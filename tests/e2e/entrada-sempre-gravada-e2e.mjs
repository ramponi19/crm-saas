// e2e LOCAL da regra "mensagem recebida nunca é descartada; webhook só responde 200 depois de gravar"
// (18/11/2026, depois do incidente do 06 s.54). Edge `webhook-leads` servida localmente
// (npx supabase functions serve webhook-leads --no-verify-jwt --env-file <arquivo com META_APP_SECRET=...>)
// e webhooks assinados como os da Meta, num canal de teste da empresa 5 (Preview) do banco local.
//
// Casos: limite de leads estourado (o card nasce com aviso; o cadastro à mão segue barrado), empresa
// suspensa, regra que recusa o negócio (a mensagem entra, alerta negocio_nao_criado), falha ao gravar a
// mensagem (500; reenvio grava), banco fora (500; reenvio grava), entrada pendente e o alerta de 30 min.
//
//   META_APP_SECRET=... node tests/e2e/entrada-sempre-gravada-e2e.mjs
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'

const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const DB = ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres']
const EDGE = 'http://127.0.0.1:54321/functions/v1/webhook-leads'
const SEGREDO = process.env.META_APP_SECRET ?? 'segredo-teste-local'
const CONTAINER_DB = 'supabase_db_guiuzbcqkvelqcuogxtd'
const EMP = 5
const PNID = `pnid-teste-entrada-e2e-${Date.now()}`
const sql = (q) => execFileSync(PSQL, [...DB, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim()
const sqlErro = (q) => { try { sql(q); return null } catch (e) { return String(e.stderr ?? e.message) } }

let falhas = 0
const ok = (m) => console.log('ok   ' + m)
const falha = (m) => { falhas++; console.log('FALHA ' + m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const base = 5519900000000 + Math.floor(Math.random() * 900000)
const fone = (i) => String(base + i * 1000000)
let seq = 0
function payload(de, texto) {
  seq++
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-teste', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { display_phone_number: '5500000000000', phone_number_id: PNID },
      contacts: [{ profile: { name: `Teste Entrada ${seq}` }, wa_id: de }],
      messages: [{ from: de, id: `wamid.TESTE${Date.now()}${seq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }],
    } }] }],
  })
}
async function enviar(corpo) {
  const assinatura = 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(corpo).digest('hex')
  const r = await fetch(EDGE, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura }, body: corpo, signal: AbortSignal.timeout(180000) })
  return r.status
}
const wamid = (corpo) => JSON.parse(corpo).entry[0].changes[0].value.messages[0].id
const gravada = (corpo) => sql(`select count(*) from mensagens where external_id = '${wamid(corpo)}'`) === '1'
const pendente = () => sql(`select coalesce(entrada_pendente_desde::text, '') from canais where external_id = '${PNID}'`)

const APP = 'http://localhost:3010'
const CRON_SECRET = process.env.CRON_SECRET || (() => { try { return (fs.readFileSync('.env.local', 'utf8').match(/^CRON_SECRET=(.*)$/m)?.[1] ?? '').replace(/^"|"$/g, '').trim() } catch { return '' } })()
let canalId = null, canal1 = null, limite1Antes = null
const limiteAntes = sql(`select coalesce(limite_leads::text, 'null') from empresas where id = ${EMP}`)
try {
  // ── Preparação ──────────────────────────────────────────────────────────────
  const filial = sql(`select id from filiais where empresa_id = ${EMP} order by matriz desc, id limit 1`)
  canalId = sql(`insert into canais (empresa_id, filial_id, tipo, external_id, nome_exibicao, status) values (${EMP}, ${filial}, 'whatsapp', '${PNID}', 'teste entrada e2e', 'ativo') returning id`)
  ok(`canal de teste ${canalId} na empresa ${EMP}`)
  // A Edge guarda canal em cache e o primeiro pedido acorda o runtime: um aquecimento.
  const aquece = payload(fone(9), 'aquecimento')
  confere(await enviar(aquece) === 200 && gravada(aquece), 'aquecimento: Edge local responde e grava')

  // ── 1. Limite de leads estourado ────────────────────────────────────────────
  const abertos = Number(sql(`select count(*) from negocios where empresa_id = ${EMP} and status = 'aberto'`))
  sql(`update empresas set limite_leads = 1 where id = ${EMP}`)
  const p1 = payload(fone(1), 'quero saber o preco')
  const s1 = await enviar(p1)
  confere(s1 === 200 && gravada(p1), `limite estourado (${abertos} abertos, limite 1): 200 e mensagem gravada (${s1})`)
  const neg1 = sql(`select n.id || '|' || n.status || '|' || coalesce(n.dados->'_lead'->'aviso_limite'->>'limite', '') from negocios n join contatos c on c.id = n.contato_id where c.empresa_id = ${EMP} and c.telefone = '${fone(1)}'`)
  confere(/^\d+\|aberto\|1$/.test(neg1), `card nasceu aberto com o aviso de limite (${neg1})`)
  const cont1 = sql(`select contato_id from negocios where id = ${neg1.split('|')[0]}`)
  const manual = sqlErro(`insert into negocios (empresa_id, contato_id, status, dados) values (${EMP}, ${cont1}, 'aberto', '{}'::jsonb)`)
  confere(manual && /LEAD_LIMIT_REACHED/.test(manual), 'negócio pelo cadastro (fora da entrada do canal) segue barrado pelo limite')
  sql(`update empresas set limite_leads = ${limiteAntes} where id = ${EMP}`)

  // ── 2. Empresa suspensa (só leitura) ────────────────────────────────────────
  sql(`update empresas set status = 'suspenso' where id = ${EMP}`)
  const p2 = payload(fone(2), 'oi, ainda tem?')
  const s2 = await enviar(p2)
  confere(s2 === 200 && gravada(p2), `empresa suspensa: 200 e mensagem gravada (${s2})`)
  sql(`update empresas set status = 'ativo' where id = ${EMP}`)

  // ── 3. Regra que recusa o negócio (não é o limite) ──────────────────────────
  sql(`create or replace function public._teste_recusa_negocio() returns trigger language plpgsql as $$ begin if new.empresa_id = ${EMP} then raise exception 'REGRA_TESTE_E2E'; end if; return new; end $$`)
  sql(`create trigger _teste_recusa_negocio before insert on negocios for each row execute function public._teste_recusa_negocio()`)
  const p3 = payload(fone(3), 'mensagem com regra recusando')
  const s3 = await enviar(p3)
  sql(`drop trigger _teste_recusa_negocio on negocios; drop function public._teste_recusa_negocio()`)
  const neg3 = sql(`select count(*) from negocios n join contatos c on c.id = n.contato_id where c.empresa_id = ${EMP} and c.telefone = '${fone(3)}'`)
  const cont3 = sql(`select count(*) from contatos where empresa_id = ${EMP} and telefone = '${fone(3)}'`)
  confere(s3 === 200 && gravada(p3) && cont3 === '1' && neg3 === '0', `regra recusa o negócio: 200, mensagem e contato gravados, sem negócio (${s3}, contato ${cont3}, negócio ${neg3})`)
  const al3 = sql(`select count(*) from alertas_entrada where empresa_id = ${EMP} and tipo = 'negocio_nao_criado' and detalhe like '%REGRA_TESTE_E2E%'`)
  confere(al3 === '1', `alerta negocio_nao_criado registrado (${al3})`)

  // ── 4. Falha ao gravar a mensagem: 500, e o reenvio grava ───────────────────
  sql(`create or replace function public._teste_recusa_msg() returns trigger language plpgsql as $$ begin if new.conteudo = 'FALHA_GRAVACAO_E2E' then raise exception 'GRAVACAO_TESTE_E2E'; end if; return new; end $$`)
  sql(`create trigger _teste_recusa_msg before insert on mensagens for each row execute function public._teste_recusa_msg()`)
  const p4 = payload(fone(4), 'FALHA_GRAVACAO_E2E')
  const s4 = await enviar(p4)
  confere(s4 === 500 && !gravada(p4), `mensagem não gravada: 500 para a Meta reenviar, nunca 200 (${s4})`)
  confere(pendente() !== '', `canal fica com entrada pendente (${pendente()})`)
  sql(`drop trigger _teste_recusa_msg on mensagens; drop function public._teste_recusa_msg()`)
  const s4b = await enviar(p4)
  confere(s4b === 200 && gravada(p4), `reenvio da Meta (mesmo corpo) grava: ${s4b}`)
  confere(pendente() === '', 'gravou: entrada pendente limpa')

  // ── 5. Banco fora: 500, e o reenvio grava ───────────────────────────────────
  const p5 = payload(fone(5), 'mensagem com o banco fora')
  execFileSync('docker', ['stop', CONTAINER_DB], { stdio: 'ignore' })
  let s5
  try { s5 = await enviar(p5) } catch (e) { s5 = `erro ${e.message}` }
  execFileSync('docker', ['start', CONTAINER_DB], { stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { try { sql('select 1'); break } catch { await espera(2000) } }
  // O GoTrue não se reconecta sozinho depois do Postgres reiniciar (login dá "Database error querying schema").
  execFileSync('docker', ['restart', CONTAINER_DB.replace('_db_', '_auth_')], { stdio: 'ignore' })
  await espera(5000)
  confere(s5 === 500, `banco fora: 500 (${s5})`)
  let s5b = 0
  for (let i = 0; i < 10 && s5b !== 200; i++) { s5b = await enviar(p5); if (s5b !== 200) await espera(5000) }
  confere(s5b === 200 && gravada(p5), `banco de volta: o reenvio grava (${s5b})`)

  // ── 6. Entrada parada: pendente há 40 min, alerta pela rota (lib/alertas-entrada.ts) ────
  sql(`update canais set entrada_pendente_desde = now() - interval '40 minutes' where id = ${canalId}`)
  confere(sql(`select count(*) from canais where status = 'ativo' and entrada_pendente_desde < now() - interval '30 minutes' and id = ${canalId}`) === '1',
    'o filtro do pg_cron enxerga o canal pendente há 30 min')
  const p6 = payload(fone(6), 'chegou e gravou')
  confere(await enviar(p6) === 200 && pendente() === '', 'mensagem gravada limpa a entrada pendente')

  // ── 7 e 8. Com o app local no ar (:3010, build com o banco local e sem DSN do Sentry) ──────────
  const app = await fetch(APP + '/login').then((r) => r.status).catch(() => 0)
  if (app !== 200) {
    console.log('(app local fora do ar: etapas 7 e 8 puladas)')
  } else {
    // 7. A rota do alerta: abre com o canal pendente há 40 min (horário de atendimento de teste: todo dia,
    //    o dia inteiro), avisa, e resolve quando o canal volta a gravar.
    const horarioAntes = sql(`select coalesce(valor::text, '') from configuracoes_sistema where empresa_id = ${EMP} and chave = 'horario_comercial'`)
    sql(`insert into configuracoes_sistema (empresa_id, chave, valor) values (${EMP}, 'horario_comercial', '{"inicio":"00:00","fim":"23:59","dias":[0,1,2,3,4,5,6]}') on conflict (empresa_id, chave) do update set valor = excluded.valor`)
    sql(`update canais set entrada_pendente_desde = now() - interval '40 minutes' where id = ${canalId}`)
    const rota = () => fetch(APP + '/api/cron/entrada-parada', { headers: { authorization: `Bearer ${CRON_SECRET}` } }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }))
    const r1 = await rota()
    const aberto = sql(`select count(*) from alertas_entrada where canal_id = ${canalId} and tipo = 'entrada_parada' and resolvido_em is null and notificado_em is not null`)
    confere(r1.s === 200 && r1.j?.abertos >= 1 && aberto === '1', `rota: alerta de entrada parada aberto e avisado (${r1.s} ${JSON.stringify(r1.j)})`)
    const r1b = await rota()
    confere(r1b.j?.abertos === 0 && sql(`select count(*) from alertas_entrada where canal_id = ${canalId} and tipo = 'entrada_parada'`) === '1', 'segunda rodada não duplica o alerta')
    const p7 = payload(fone(7), 'voltou a gravar')
    await enviar(p7)
    const r2 = await rota()
    confere(r2.j?.resolvidos >= 1 && sql(`select count(*) from alertas_entrada where canal_id = ${canalId} and tipo = 'entrada_parada' and resolvido_em is not null`) === '1', `canal gravou: alerta resolvido (${JSON.stringify(r2.j)})`)
    const naoAut = await fetch(APP + '/api/cron/entrada-parada').then((r) => r.status)
    confere(naoAut === 401, `rota sem o segredo: 401 (${naoAut})`)
    if (horarioAntes) sql(`update configuracoes_sistema set valor = '${horarioAntes.replace(/'/g, "''")}'::jsonb where empresa_id = ${EMP} and chave = 'horario_comercial'`)
    else sql(`delete from configuracoes_sistema where empresa_id = ${EMP} and chave = 'horario_comercial'`)

    // 8. O aviso no card aberto: limite estourado na empresa 1, mensagem pelo canal, o dono abre o card.
    const filial1 = sql(`select id from filiais where empresa_id = 1 order by matriz desc, id limit 1`)
    canal1 = sql(`insert into canais (empresa_id, filial_id, tipo, external_id, nome_exibicao, status) values (1, ${filial1}, 'whatsapp', '${PNID}-1', 'teste entrada e2e 1', 'ativo') returning id`)
    limite1Antes = sql(`select coalesce(limite_leads::text, 'null') from empresas where id = 1`)
    sql(`update empresas set limite_leads = 1 where id = 1`)
    const p8 = payload(fone(8), 'card com aviso').replace(`"phone_number_id":"${PNID}"`, `"phone_number_id":"${PNID}-1"`)
    const s8 = await enviar(p8)
    sql(`update empresas set limite_leads = ${limite1Antes} where id = 1`)
    const neg8 = sql(`select n.id from negocios n join contatos c on c.id = n.contato_id where c.empresa_id = 1 and c.telefone = '${fone(8)}'`)
    confere(s8 === 200 && /^\d+$/.test(neg8), `empresa 1 no limite: 200 e card ${neg8}`)
    const { chromium } = await import('playwright-core')
    const { E } = await import('./_usuarios.mjs')
    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    try {
      const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
      await page.goto(APP + '/login', { timeout: 300000 })
      await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', 'teste-local-22')
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
      await page.goto(APP + `/leads?lead=${neg8}`, { timeout: 300000 })
      const aviso = page.locator('[data-aviso-limite]')
      await aviso.waitFor({ timeout: 120000 })
      confere((await aviso.innerText()).includes('acima do limite de leads'), 'dono vê no card: "acima do limite de leads do plano"')
      await page.screenshot({ path: process.env.PRINT_AVISO ?? 'aviso-limite.png' })
    } catch (e) { falha('card com aviso: ' + e.message) } finally { await browser.close() }
  }
} catch (e) {
  falha('erro: ' + (e.stack ?? e.message))
} finally {
  try { execFileSync('docker', ['start', CONTAINER_DB], { stdio: 'ignore' }) } catch { /* já no ar */ }
  try {
    sql(`drop trigger if exists _teste_recusa_negocio on negocios; drop function if exists public._teste_recusa_negocio(); drop trigger if exists _teste_recusa_msg on mensagens; drop function if exists public._teste_recusa_msg()`)
    sql(`update empresas set limite_leads = ${limiteAntes}, status = 'ativo' where id = ${EMP}`)
    if (canalId) {
      const fones = [1, 2, 3, 4, 5, 6, 7, 9].map((i) => `'${fone(i)}'`).join(',')
      sql(`delete from alertas_entrada where canal_id = ${canalId} or (empresa_id = ${EMP} and detalhe like '%REGRA_TESTE_E2E%')`)
      sql(`delete from mensagens where canal_id = ${canalId}`)
      sql(`delete from conversas where canal_id = ${canalId}`)
      sql(`delete from negocios where empresa_id = ${EMP} and contato_id in (select id from contatos where empresa_id = ${EMP} and telefone in (${fones}))`)
      sql(`delete from contatos where empresa_id = ${EMP} and telefone in (${fones})`)
      sql(`delete from canais where id = ${canalId}`)
    }
    if (limite1Antes) sql(`update empresas set limite_leads = ${limite1Antes} where id = 1`)
    if (canal1) {
      sql(`delete from mensagens where canal_id = ${canal1}`)
      sql(`delete from conversas where canal_id = ${canal1}`)
      sql(`delete from negocios where empresa_id = 1 and contato_id in (select id from contatos where empresa_id = 1 and telefone = '${fone(8)}')`)
      sql(`delete from contatos where empresa_id = 1 and telefone = '${fone(8)}'`)
      sql(`delete from alertas_entrada where canal_id = ${canal1}`)
      sql(`delete from canais where id = ${canal1}`)
    }
    const sobra = sql(`select count(*) from canais where external_id like '${PNID}%'`)
    confere(sobra === '0', `limpeza: canal, mensagens, contatos e negócios de teste apagados; empresa ${EMP} como antes (limite ${limiteAntes})`)
  } catch (e) { falha('limpeza: ' + e.message) }
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
process.exit(falhas ? 1 : 0)
