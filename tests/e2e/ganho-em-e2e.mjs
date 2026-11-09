// A data do ganho (05/11/2026): mover para a etapa de ganho grava ganho_em (arrasto e mudança
// em lote do funil), e o prazo de pós-venda se configura na tela. App LOCAL, Supabase LOCAL.
// Rodar copiado para .../1deac4cf.../scratchpad/ensaio/pw:  node ganho-em-e2e.mjs [BASE]
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${process.env.DB_PORT || 54322} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), MK = `TESTE GANHO ${T}`
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const funil = sql(`select id from funis where empresa_id=1 and padrao and not interno order by id limit 1`)
const etapas = sql(`select json_agg(json_build_object('id', id, 'slug', slug, 'label', label, 'cor', cor, 'tipo', tipo, 'ativo', ativo, 'probabilidade', probabilidade) order by ordem, id) from funil_etapas where funil_id=${funil}`)
const lista = JSON.parse(etapas)
const ganho = lista.find((e) => e.tipo === 'ganho'), normal = lista.find((e) => e.tipo === 'normal')
let negocioId = null, contatoId = null, temp = null

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])

  const r = await api('/api/leads', 'POST', { nome: MK, origem: 'manual', kanban_status: normal.slug })
  negocioId = r.json?.lead?.id; contatoId = r.json?.lead?.contato_id
  confere(r.status === 200 && negocioId, `lead de teste ${negocioId}`)
  const linha = () => sql(`select status || '|' || coalesce(to_char(ganho_em, 'YYYY-MM-DD HH24:MI:SS.US'), '-') from negocios where id=${negocioId}`)

  // 1. arrastar para o ganho grava a data
  let m = await api('/api/leads/mover', 'POST', { leadId: negocioId, kanban_status: ganho.slug })
  const [st1, d1] = linha().split('|')
  confere(m.status === 200 && st1 === 'ganho' && d1 !== '-', `mover para "${ganho.slug}": status ganho e ganho_em gravado (${d1})`)
  // 2. de ganho para ganho mantém a data
  m = await api('/api/leads/mover', 'POST', { leadId: negocioId, kanban_status: ganho.slug })
  confere(m.status === 200 && linha() === `ganho|${d1}`, 'mover de novo para o ganho mantém a data')
  // 3. sair do ganho limpa a data
  m = await api('/api/leads/mover', 'POST', { leadId: negocioId, kanban_status: normal.slug })
  confere(m.status === 200 && linha() === 'aberto|-', 'voltar para etapa normal: aberto e sem ganho_em')

  // 4. mudança em lote ao excluir etapa: etapa temporária → ganho
  temp = sql(`insert into funil_etapas (empresa_id, funil_id, slug, label, cor, tipo, ordem, ativo) values (1, ${funil}, 'teste_ganho_${T}', 'Teste ${T}', '#999999', 'normal', 99, true) returning id`).split('\n')[0]
  sql(`update negocios set etapa_id=${temp}, status='aberto', ganho_em=null where id=${negocioId}`)
  const f = await api('/api/funil', 'POST', { funilId: Number(funil), etapas: lista.map((e) => ({ id: e.id, label: e.label, cor: e.cor, tipo: e.tipo, ativo: e.ativo, probabilidade: e.probabilidade })), excluir: [{ id: Number(temp), moverPara: ganho.slug }] })
  const [st4, d4] = linha().split('|')
  confere(f.status === 200 && st4 === 'ganho' && d4 !== '-', `excluir etapa movendo para o ganho: status ganho e ganho_em gravado (HTTP ${f.status} ${JSON.stringify(f.json)?.slice(0, 80)})`)
  confere(sql(`select count(*) from funil_etapas where id=${temp}`) === '0', 'etapa temporária excluída')
  temp = null
  confere(sql(`select count(*) from negocios where status='ganho' and ganho_em is null`) === '0', 'nenhum ganho sem data no banco local')

  // 4b. relatório de perdas e conversão: iguais antes e depois de uma reabertura pelo canal
  const totalPerdas = async () => {
    await page.goto(BASE + '/relatorios', { waitUntil: 'networkidle', timeout: 240000 })
    const m = await page.getByText(/\d+ leads? perdidos?/).first().textContent({ timeout: 30000 }).catch(() => '')
    return Number((m ?? '').match(/(\d+)/)?.[1] ?? -1)
  }
  sql(`update negocios set status='perdido', perdido_em=now()-interval '3 days', ganho_em=null where id=${negocioId}`)
  const perdasAntes = await totalPerdas()
  const reaberto = sql(`select core_negocio_do_canal(1, ${contatoId}, 3, 'voltei', false, 'whatsapp', null)`)
  confere(reaberto === String(negocioId) && sql(`select status from negocios where id=${negocioId}`) === 'aberto', `reabertura pelo canal: o mesmo negócio (${reaberto}) volta aberto`)
  const perdasDepois = await totalPerdas()
  confere(perdasAntes > 0 && perdasAntes === perdasDepois, `tela de perdas igual antes e depois da reabertura (${perdasAntes} = ${perdasDepois})`)
  const gc = await page.goto(BASE + '/conversao', { waitUntil: 'networkidle', timeout: 240000 })
  confere(gc?.status() === 200, `/conversao 200 (${gc?.status()})`)

  // 5. o prazo de pós-venda pela tela (Configurações › SLA de atendimento)
  await page.goto(BASE + '/configuracoes/sla', { waitUntil: 'networkidle', timeout: 240000 })
  const card = page.locator('section, div').filter({ hasText: 'Cliente que volta a escrever' }).last()
  confere(await page.getByText('Cliente que volta a escrever').count() > 0, 'card "Cliente que volta a escrever" na tela de SLA')
  const campo = page.getByLabel('Dias de pós-venda')
  confere((await campo.inputValue()) === '30', `padrão 30 dias (${await campo.inputValue()})`)
  await campo.fill('12')
  await page.getByText('Cliente que volta a escrever').locator('xpath=ancestor::*[.//button][1]').getByRole('button', { name: 'Salvar' }).click()
  await page.waitForTimeout(1200)
  confere(sql(`select valor::text from configuracoes_sistema where empresa_id=1 and chave='retorno_cliente'`) === '{"pos_venda_dias": 12}', 'salvar grava {"pos_venda_dias": 12} na configuração da empresa')
  await page.reload({ waitUntil: 'networkidle' })
  confere((await page.getByLabel('Dias de pós-venda').inputValue()) === '12', 'ao reabrir, a tela mostra 12')
  void card
} finally {
  if (temp) sql(`update negocios set etapa_id=null where etapa_id=${temp}; delete from funil_etapas where id=${temp}`)
  if (negocioId) sql(`delete from negocio_historico where negocio_id=${negocioId}; delete from negocios where id=${negocioId}`)
  if (contatoId) sql(`delete from contatos where id=${contatoId}`)
  sql(`delete from configuracoes_sistema where empresa_id=1 and chave='retorno_cliente'`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
