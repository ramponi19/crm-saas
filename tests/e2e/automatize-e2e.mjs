// AUTOMATIZE — app LOCAL :3010 em modo dev (bash tools/dev-local.sh) + Supabase LOCAL + Edge LOCAL
// (deno, este script sobe em :8000) + Graph FALSA (este script, :54999) que só aceita número de teste
// 5519900…. Rodar da RAIZ do repo: node tests/e2e/automatize-e2e.mjs. Nada sai para cliente: só
// contatos, modelo e dois números de WhatsApp de TESTE criados aqui.
// Dono cria/liga/vê; vendedor vê e não edita. Travas: 7 dias, opt-out, fora do horário, teto 50/h,
// pausar todas. Cron: esperar N dias, idempotente, evento da rodada. Tudo devolvido no fim.
// 23/11/2026: o modelo grava a aprovação POR NÚMERO (modelos_mensagem_wabas; sem isso a rota recusa
// desde 11/11) e o envio sai pelo WhatsApp em que o cliente falou por último na loja (multinúmero).
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479', VEND = 'dd2ae788-0e28-47af-86e2-73a15d1d600f'
const CRON = 'cron-local-de-teste' // o app local sobe com este CRON_SECRET (o .env.local tem o campo vazio)
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()

// ── Edge LOCAL + Graph FALSA (como no transmissao-e2e) ───────────────────────
const EDGE = 'http://127.0.0.1:8000', GRAPH_PORTA = 54999
const CHAVE_CANAL = 'e2e0'.repeat(16) // a mesma de tools/dev-local.sh (só de teste)
const SEGREDO_EDGE = 'edge-interna-local-de-teste' // a mesma de tools/dev-local.sh (só de teste)
const env = Object.fromEntries(fs.readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) { console.error('RECUSADO: status.local.env não é o Supabase local'); process.exit(2) }
const graph = []
const servidorGraph = createServer((req, res) => {
  let b = ''
  req.on('data', (c) => { b += c })
  req.on('end', () => {
    const j = (() => { try { return JSON.parse(b) } catch { return {} } })()
    res.setHeader('Content-Type', 'application/json')
    if (req.method !== 'POST' || !String(req.url).endsWith('/messages')) { res.end('{}'); return }
    graph.push({ url: req.url, ...j })
    if (!String(j.to ?? '').startsWith('5519900')) { res.statusCode = 400; res.end(JSON.stringify({ error: { code: 131026, message: 'número fora do teste' } })); return }
    res.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.AUTO${T}.${graph.length}` }] }))
  })
}).listen(GRAPH_PORTA)
const edge = spawn('deno', ['run', '--allow-net', '--allow-env', '--allow-read', 'supabase/functions/webhook-leads/index.ts'], {
  env: {
    ...process.env, SUPABASE_URL: env.API_URL, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: env.ANON_KEY, EDGE_INTERNAL_SECRET: SEGREDO_EDGE,
    META_GRAPH_BASE: `http://127.0.0.1:${GRAPH_PORTA}`, META_APP_SECRET: 'segredo-e2e-automatize', WEBHOOK_VERIFY_TOKEN: 'e2e', CHANNEL_ENCRYPTION_KEY: CHAVE_CANAL,
  }, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
})
let logEdge = ''
edge.stdout.on('data', (d) => { logEdge += d }); edge.stderr.on('data', (d) => { logEdge += d })
for (let i = 0; i < 60; i++) { try { await fetch(EDGE, { method: 'OPTIONS' }); break } catch { await espera(1000) } }
const cifrar = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(CHAVE_CANAL, 'hex'), iv); const e = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), e.toString('base64')].join('.') }
// Dois WhatsApp de TESTE em Mogi: A (mais antigo) e B (o conectado por último). O cliente que fala
// pelo A recebe pelo A; quem não fala por nenhum cai na regra da loja (o B, o mais recente).
const novoCanal = (letra, quando) => sql(`insert into canais (empresa_id, filial_id, tipo, external_id, waba_id, nome_exibicao, access_token_enc, status, via, conectado_em)
  values (1, 3, 'whatsapp', 'PHONE_AUTO_${letra}_${T}', 'WABA_AUTO_${letra}_${T}', 'WhatsApp teste ${letra}', '${cifrar('token-falso-e2e')}', 'ativo', 'pagina', ${quando}) returning id`).split('\n')[0]
const CANAL_A = novoCanal('A', "now() - interval '1 day'"), CANAL_B = novoCanal('B', 'now()')

sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const [etA, etB] = sql(`select string_agg(slug, ',' order by ordem) from (select slug, ordem from funil_etapas where empresa_id=1 and funil_id=1 and ativo and coalesce(tipo,'') not in ('ganho','perdido') order by ordem limit 2) x`).split(',')
const etapaIdA = sql(`select id from funil_etapas where empresa_id=1 and funil_id=1 and slug='${etA}'`)
const etapaIdB = sql(`select id from funil_etapas where empresa_id=1 and funil_id=1 and slug='${etB}'`)
console.log('etapas', etA, '→', etB)
const horarioAntes = sql(`select coalesce(valor::text, '') from empresa_config where empresa_id=1 and filial_id is null and modulo='core' and chave='horario'`)
const setHorario = (v) => sql(`delete from empresa_config where empresa_id=1 and filial_id is null and modulo='core' and chave='horario'; insert into empresa_config (empresa_id, filial_id, modulo, chave, valor) values (1, null, 'core', 'horario', core_horario_do_antigo('${JSON.stringify(v)}'::jsonb))`)
setHorario({ inicio: '00:00', fim: '23:59', dias: [0, 1, 2, 3, 4, 5, 6] })
const modelo = sql(`insert into modelos_mensagem (empresa_id, nome, idioma, categoria, corpo, status) values (1, 'teste_automatize_${T}', 'pt_BR', 'MARKETING', 'Oi {{1}}, teste do Automatize', 'aprovado') returning id`).split('\n')[0]
const novoNegocio = (n) => {
  const c = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo) values (1, 3, 'Teste Auto ${n} ${T}', '551990000${String(9000 + n)}', '+551990000${String(9000 + n)}', 'pessoa') returning id`).split('\n')[0]
  const neg = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, dados) values (1, 3, ${c}, 1, ${etapaIdA}, '${DONO}', '{"_lead":{"kanban_status":"${etA}","ativo":true}}') returning id`).split('\n')[0]
  return { c, neg }
}
const N = [1, 2, 3, 4, 5, 6].map(novoNegocio)
// Aprovação POR NÚMERO (11/11/2026): o modelo existe aprovado nos dois números de teste.
sql(`insert into modelos_mensagem_wabas (modelo_id, empresa_id, waba_id, status) values (${modelo}, 1, 'WABA_AUTO_A_${T}', 'aprovado'), (${modelo}, 1, 'WABA_AUTO_B_${T}', 'aprovado')`)
// O cliente 1 conversa pelo número A (o mais antigo): o modelo tem de sair por ele.
const conv1 = sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id) values (1, 3, ${N[0].c}, ${CANAL_A}) returning id`).split('\n')[0]
sql(`insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, canal_id, created_at) values (1, 3, ${conv1}, ${N[0].c}, 'recebida', 'oi pelo A', ${CANAL_A}, now() - interval '1 hour')`)
console.log('negócios de teste', N.map((x) => x.neg).join(','), '| modelo', modelo, '| WhatsApp A', CANAL_A, 'B', CANAL_B)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, corpo) => page.evaluate(async ([u, c]) => { const r = await fetch(u, c ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) } : undefined); return { status: r.status, j: await r.json().catch(() => ({})) } }, [url, corpo])
const mover = (page, neg, etapa) => api(page, '/api/leads/mover', { leadId: neg, kanban_status: etapa })
const execs = (neg) => sql(`select coalesce(string_agg(acao || ':' || status || coalesce(':' || motivo, ''), ' | ' order by id), '') from automacao_execucoes where negocio_id=${neg}`)

const dono = await entrar(E.dono)
try {
  // ── 1. Modo Automatize no quadro ──────────────────────────────────────────
  await dono.goto(BASE + '/leads', { waitUntil: 'networkidle' })
  await dono.getByRole('button', { name: 'Automatize' }).click()
  await dono.waitForSelector('[data-automatize-barra]', { timeout: 20000 })
  await dono.waitForSelector(`[data-automatize-etapa="${etB}"]`, { timeout: 20000 })
  confere(await dono.locator('[data-automatize-etapa]').count() >= 2, `painel embaixo das etapas (${await dono.locator('[data-automatize-etapa]').count()})`)

  // ── 2. Dono cria pela tela: tarefa na hora, na etapa B ─────────────────────
  await dono.locator(`[data-automatize-etapa="${etB}"]`).getByRole('button', { name: 'Automação' }).click()
  await dono.getByLabel('Título da tarefa').fill(`AUTO TAREFA {{nome}} ${T}`)
  await dono.getByRole('button', { name: 'Criar automação' }).click()
  await espera(1500)
  const autoTarefa = sql(`select id from automacoes where empresa_id=1 and config->>'titulo' = 'AUTO TAREFA {{nome}} ${T}'`)
  confere(/^\d+$/.test(autoTarefa), `automação de tarefa criada pela tela (${autoTarefa})`)
  confere(await dono.locator(`[data-automatize-item="automacao-${autoTarefa}"]`).count() === 1, 'aparece embaixo da etapa')
  // pela API: modelo na hora, e tarefa depois de 2 dias
  const rM = await api(dono, '/api/automatize', { op: 'criar', etapa_slug: etB, acao: 'enviar_modelo', modelo_id: Number(modelo), parametros: ['{{nome}}'], espera_dias: 0 })
  const autoModelo = String(rM.j.id)
  const r2 = await api(dono, '/api/automatize', { op: 'criar', etapa_slug: etB, acao: 'criar_tarefa', titulo: `AUTO 2 DIAS ${T}`, espera_dias: 2 })
  const autoDepois = String(r2.j.id)
  confere(rM.status === 200 && r2.status === 200, `criadas pela API: modelo ${autoModelo}, 2 dias ${autoDepois}`)

  // ── 3. Entrar na etapa: tarefa + modelo na hora, 2 dias agendado ───────────
  let m = await mover(dono, N[0].neg, etB)
  confere(m.status === 200, `negócio ${N[0].neg} movido para ${etB} (HTTP ${m.status})`)
  await espera(1500)
  const e1 = execs(N[0].neg)
  confere(/criar_tarefa:executada/.test(e1) && /enviar_modelo:executada/.test(e1) && /criar_tarefa:agendada/.test(e1), `execuções: ${e1}`)
  confere(sql(`select count(*) from tarefas where negocio_id=${N[0].neg} and origem='automacao' and titulo = 'AUTO TAREFA Teste Auto 1 ${T} ${T}'`) === '1', 'tarefa nasceu com o nome do lead e origem automação')
  const msg = sql(`select origem || '|' || coalesce(status_entrega,'') || '|' || conteudo from mensagens where id = (select mensagem_id from automacao_execucoes where negocio_id=${N[0].neg} and acao='enviar_modelo')`)
  confere(msg === `automacao|enviada|Oi Teste Auto 1 ${T}, teste do Automatize`, `mensagem do modelo gravada: ${msg}`)
  // Multinúmero (23/11/2026): saiu pelo número em que o cliente fala (A), não pelo conectado por último (B).
  const canalMsg = sql(`select canal_id from mensagens where id = (select mensagem_id from automacao_execucoes where negocio_id=${N[0].neg} and acao='enviar_modelo')`)
  confere(canalMsg === String(CANAL_A) && graph.some((g) => String(g.url).includes(`PHONE_AUTO_A_${T}`)),
    `modelo saiu pelo WhatsApp da conversa (A=${CANAL_A}), não pelo mais recente (B=${CANAL_B}): canal ${canalMsg}`)

  // ── 4. Travas ─────────────────────────────────────────────────────────────
  await mover(dono, N[0].neg, etA); await mover(dono, N[0].neg, etB); await espera(1200)
  confere(/enviar_modelo:pulada:este contato já recebeu este modelo nos últimos 7 dias/.test(execs(N[0].neg)), '7 dias: o mesmo modelo não vai de novo ao mesmo contato')
  confere(/criar_tarefa:pulada:substituída: entrou de novo na etapa/.test(execs(N[0].neg)) && (execs(N[0].neg).match(/criar_tarefa:agendada/g) || []).length === 1, 'reentrar substitui o "2 dias" pendente (fica 1 agendado)')
  sql(`update contatos set opt_out_em = now() where id=${N[1].c}`)
  await mover(dono, N[1].neg, etB); await espera(1200)
  confere(/enviar_modelo:pulada:contato pediu para não receber/.test(execs(N[1].neg)), 'opt-out: não recebe')
  sql(`update contatos set ativo = false where id=${N[5].c}`)
  await mover(dono, N[5].neg, etB); await espera(1200)
  confere(/enviar_modelo:pulada:contato bloqueado/.test(execs(N[5].neg)), 'bloqueado: não recebe')
  const amanha = (new Date(Date.now() - 3 * 3600_000).getUTCDay() + 1) % 7
  setHorario({ inicio: '09:00', fim: '18:00', dias: [amanha] })
  await mover(dono, N[2].neg, etB); await espera(1200)
  const fora = sql(`select status || '|' || coalesce(motivo,'') || '|' || to_char(agendada_para at time zone 'America/Sao_Paulo', 'HH24:MI') from automacao_execucoes where negocio_id=${N[2].neg} and acao='enviar_modelo'`)
  confere(fora === 'agendada|fora do horário de atendimento|09:00', `fora do horário: ${fora}`)
  setHorario({ inicio: '00:00', fim: '23:59', dias: [0, 1, 2, 3, 4, 5, 6] })
  sql(`insert into automacao_execucoes (empresa_id, filial_id, automacao_id, negocio_id, contato_id, acao, modelo_id, status, executada_em, motivo)
       select 1, 3, ${autoModelo}, ${N[4].neg}, null, 'enviar_modelo', null, 'executada', now() - interval '10 minutes', 'TETO ${T}' from generate_series(1, 50)`)
  await mover(dono, N[3].neg, etB); await espera(1200)
  confere(/enviar_modelo:agendada:teto de 50 envios automáticos por hora/.test(execs(N[3].neg)), 'teto: 50 na hora → o resto fica na fila')
  sql(`delete from automacao_execucoes where motivo = 'TETO ${T}'`)

  // ── 5. Cron: esperar 2 dias, idempotente, evento da rodada ────────────────
  sql(`update automacao_execucoes set agendada_para = now() - interval '1 minute' where negocio_id=${N[0].neg} and automacao_id=${autoDepois}`)
  const cron = async () => { const r = await fetch(`${BASE}/api/cron/automacoes`, { headers: { Authorization: `Bearer ${CRON}` } }); return { s: r.status, j: await r.json().catch(() => ({})) } }
  const evAntes = Number(sql(`select count(*) from eventos where tipo='automacoes.rodada' and empresa_id=1`))
  const c1 = await cron()
  confere(c1.s === 200 && c1.j.executadas >= 1, `cron rodou: ${JSON.stringify(c1.j)}`)
  confere(sql(`select count(*) from tarefas where negocio_id=${N[0].neg} and titulo='AUTO 2 DIAS ${T}'`) === '1', 'a tarefa de "2 dias" nasceu pelo cron')
  const c2 = await cron()
  confere(sql(`select count(*) from tarefas where negocio_id=${N[0].neg} and titulo='AUTO 2 DIAS ${T}'`) === '1', `rodar de novo não executa de novo (${JSON.stringify(c2.j)})`)
  const ev = sql(`select dados::text from eventos where tipo='automacoes.rodada' and empresa_id=1 order by id desc limit 1`)
  confere(Number(sql(`select count(*) from eventos where tipo='automacoes.rodada' and empresa_id=1`)) > evAntes && /ficaram_para_a_proxima/.test(ev), `rodada registrada em eventos: ${ev}`)
  confere((await fetch(`${BASE}/api/cron/automacoes`)).status === 401, 'cron sem segredo: 401')

  // ── 6. Pausar todas ───────────────────────────────────────────────────────
  await dono.reload({ waitUntil: 'networkidle' })
  await dono.getByRole('button', { name: 'Automatize' }).click()
  await dono.getByRole('button', { name: 'Pausar todas as automações' }).click()
  await espera(1500)
  confere(await dono.locator('text=Automações pausadas').count() === 1, 'faixa mostra "Automações pausadas"')
  await mover(dono, N[4].neg, etB); await espera(1200)
  confere(execs(N[4].neg) === '', 'pausado: entrar na etapa não agenda nada')
  await dono.getByRole('button', { name: 'Retomar automações' }).click(); await espera(1200)

  // ── 7. Contagens e ligar/desligar pela tela ───────────────────────────────
  await dono.reload({ waitUntil: 'networkidle' })
  await dono.getByRole('button', { name: 'Automatize' }).click()
  await dono.waitForSelector(`[data-automatize-item="automacao-${autoTarefa}"]`, { timeout: 20000 })
  const itemT = await dono.locator(`[data-automatize-item="automacao-${autoTarefa}"]`).innerText()
  confere(/\d+ hoje/.test(itemT) && !/ 0 hoje/.test(itemT), `contagem no item: "${itemT.replace(/\n/g, ' | ')}"`)
  await dono.locator(`[data-automatize-item="automacao-${autoTarefa}"] [role="switch"]`).click(); await espera(1200)
  confere(sql(`select ativo from automacoes where id=${autoTarefa}`) === 'f', 'desligar pela tela grava')

  // ── 8. Vendedor vê e não edita ────────────────────────────────────────────
  const vend = await entrar(E.vend_mogi)
  await vend.goto(BASE + '/leads', { waitUntil: 'networkidle' })
  await vend.getByRole('button', { name: 'Automatize' }).click()
  await vend.waitForSelector(`[data-automatize-item="automacao-${autoModelo}"]`, { timeout: 20000 })
  confere(await vend.locator('[data-automatize-etapa] >> text=Automação').count() === 0 || await vend.getByRole('button', { name: /^Automação$/ }).count() === 0, 'vendedor não vê "+ Automação"')
  confere(await vend.locator(`[data-automatize-item="automacao-${autoModelo}"] [role="switch"]`).isDisabled(), 'chave desabilitada para o vendedor')
  confere(await vend.getByRole('button', { name: /Pausar todas/ }).count() === 0, 'vendedor não vê "pausar todas"')
  const rv = await api(vend, '/api/automatize', { op: 'ligar', tipo: 'automacao', id: Number(autoModelo), ativo: false })
  confere(rv.status === 403, `vendedor pela API: HTTP ${rv.status}`)
  const rls = sql(`begin; select set_config('request.jwt.claims', json_build_object('sub','${VEND}','role','authenticated')::text, true); set local role authenticated; with u as (update automacoes set ativo=false where id=${autoModelo} returning 1) select count(*) from u; rollback;`).split('\n').filter((x) => /^\d+$/.test(x)).pop()
  confere(rls === '0', `vendedor direto no banco (RLS): ${rls} linhas`)
} finally {
  // devolve o banco local
  const negs = N.map((x) => x.neg).join(','), cons = N.map((x) => x.c).join(',')
  sql(`delete from mensagens where id in (select mensagem_id from automacao_execucoes where negocio_id in (${negs}) and mensagem_id is not null)`)
  sql(`delete from tarefas where negocio_id in (${negs})`)
  sql(`delete from automacao_execucoes where negocio_id in (${negs}) or motivo = 'TETO ${T}'`)
  sql(`delete from automacoes where empresa_id=1 and (config->>'titulo' like '%${T}%' or modelo_id=${modelo})`)
  sql(`delete from negocios where id in (${negs})`); sql(`delete from conversas where contato_id in (${cons})`); sql(`delete from contatos where id in (${cons})`)
  sql(`delete from mensagens where contato_id in (${cons})`)
  sql(`delete from modelos_mensagem_wabas where modelo_id=${modelo}`)
  sql(`delete from modelos_mensagem where id=${modelo}`)
  sql(`delete from canais where id in (${CANAL_A}, ${CANAL_B})`)
  edge.kill(); servidorGraph.close()
  sql(`delete from configuracoes_sistema where empresa_id=1 and chave='automacoes_pausadas'`)
  if (horarioAntes) sql(`update empresa_config set valor = '${horarioAntes}'::jsonb where empresa_id=1 and filial_id is null and modulo='core' and chave='horario'`)
  else sql(`delete from empresa_config where empresa_id=1 and filial_id is null and modulo='core' and chave='horario'`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
