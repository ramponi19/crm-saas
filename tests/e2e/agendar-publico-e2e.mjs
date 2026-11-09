// Agendamento público no fuso da empresa (10/11/2026). LOCAL, empresa 1 (slug jm-store).
//   node tests/e2e/agendar-publico-e2e.mjs
// 1. o 1º cliente marca o 1º horário livre pela tela → "Agendamento confirmado!" e a consulta no
//    banco no instante do horário (no fuso da loja);
// 2. o PRÓXIMO cliente (outra sessão) abre a página e esse horário aparece OCUPADO (desabilitado);
// 3. tentar o mesmo horário pela API → 409; horário fora da agenda → 400;
// 4. nenhum erro de hidratação (#418) nem pageerror.
// Liga a Agenda e um horário de teste só durante a rodada e devolve tudo; apaga a consulta, o
// negócio e o contato que criou, passe ou falhe.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SLUG = 'jm-store'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), NOME = `TESTE AGENDAR ${T}`

const agendaAntes = sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='agenda'), 'nenhum')`)
const horarioAntes = sql(`select coalesce((select valor::text from configuracoes_sistema where empresa_id=1 and chave='horario_comercial'), '')`)
if (agendaAntes === 'nenhum') sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo) values (1, 'agenda', 'addon', true)`)
else sql(`update empresa_modulos set ativo=true where empresa_id=1 and modulo='agenda'`)
// Todos os dias, 07:00–23:00: sempre há horário livre hoje ou amanhã, a qualquer hora do teste.
sql(`insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'horario_comercial', '{"inicio":"07:00","fim":"23:00","dias":[0,1,2,3,4,5,6]}')
     on conflict (empresa_id, chave) do update set valor = excluded.valor`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const erros = []
async function abrir() {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error' && /418|hydrat/i.test(m.text())) erros.push(m.text().slice(0, 200)) })
  await page.goto(`${BASE}/agendar/${SLUG}`, { waitUntil: 'networkidle', timeout: 240000 })
  return { ctx, page }
}
const livres = (page) => page.locator('div.grid button:not([disabled])')
let visitaId = null
try {
  // 1º cliente
  const c1 = await abrir()
  confere((await c1.page.content()).includes('Escolha o melhor horário'), 'a página de agendamento abre')
  let alvo = livres(c1.page).first()
  if (await alvo.count() === 0) { // nada livre hoje: vai para o próximo dia
    await c1.page.locator('div.overflow-x-auto button').nth(1).click(); alvo = livres(c1.page).first()
  }
  const diaSel = (await c1.page.locator('div.overflow-x-auto button').evaluateAll((bs) => bs.map((b) => b.getAttribute('style') ?? '').findIndex((s) => s.includes('background'))))
  const hora = (await alvo.innerText()).trim()
  await alvo.click()
  await c1.page.getByPlaceholder('Seu nome').fill(NOME)
  await c1.page.getByPlaceholder('WhatsApp / telefone').fill('(19) 9' + String(T).slice(-8))
  await c1.page.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await c1.page.getByText('Agendamento confirmado!').waitFor({ timeout: 20000 })
  const confirmado = await c1.page.locator('h2 + p').innerText()
  confere(confirmado.includes(hora), `confirmado para ${confirmado} (horário escolhido: ${hora})`)
  const v = sql(`select v.id||'|'||to_char(v.data_hora at time zone 'America/Sao_Paulo', 'HH24:MI') from visitas v join negocios n on n.id = v.lead_id join contatos c on c.id = n.contato_id where c.nome = '${NOME}'`).split('|')
  visitaId = Number(v[0]) || null
  confere(visitaId && v[1] === hora, `consulta gravada às ${v[1]} de Brasília (= ${hora} da tela)`)
  await c1.ctx.close()

  // Próximo cliente: o horário tem de aparecer ocupado
  const c2 = await abrir()
  if (diaSel > 0) await c2.page.locator('div.overflow-x-auto button').nth(diaSel).click()
  const mesmo = c2.page.locator('div.grid button', { hasText: hora }).first()
  confere(await mesmo.isDisabled(), `para o próximo cliente o horário ${hora} aparece ocupado`)

  // A API recusa o mesmo horário e um horário fora da agenda
  const instante = sql(`select to_char(data_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from visitas where id=${visitaId}`)
  const r1 = await c2.page.evaluate(async ([s, dh]) => (await fetch(`/api/agendar/${s}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Outro', data_hora: dh }) })).status, [SLUG, instante])
  confere(r1 === 409, `a API recusa o horário já marcado (${r1})`)
  const fora = new Date(new Date(instante).getTime() + 17 * 60000).toISOString()
  const r2 = await c2.page.evaluate(async ([s, dh]) => (await fetch(`/api/agendar/${s}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Outro', data_hora: dh }) })).status, [SLUG, fora])
  confere(r2 === 400, `a API recusa horário fora da agenda (+17 min: ${r2})`)
  await c2.ctx.close()
  confere(erros.length === 0, `sem erro de hidratação nem pageerror${erros.length ? ': ' + erros.join(' / ') : ''}`)
} catch (e) {
  falha('erro: ' + String(e).slice(0, 300))
} finally {
  await browser.close()
  const ids = sql(`select coalesce(string_agg(n.id::text, ','), '') || '|' || coalesce(string_agg(distinct c.id::text, ','), '') from contatos c left join negocios n on n.contato_id = c.id where c.nome in ('${NOME}', 'Outro') and c.empresa_id = 1 and c.created_at > now() - interval '1 hour'`).split('|')
  if (ids[0]) { sql(`delete from visitas where lead_id in (${ids[0]})`); sql(`delete from negocio_historico where negocio_id in (${ids[0]})`); sql(`delete from negocios where id in (${ids[0]})`) }
  if (ids[1]) { sql(`delete from contato_identidades where contato_id in (${ids[1]})`); sql(`delete from contatos where id in (${ids[1]})`) }
  if (agendaAntes === 'nenhum') sql(`delete from empresa_modulos where empresa_id=1 and modulo='agenda'`)
  else sql(`update empresa_modulos set ativo=${agendaAntes} where empresa_id=1 and modulo='agenda'`)
  if (horarioAntes) sql(`update configuracoes_sistema set valor='${horarioAntes.replace(/'/g, "''")}'::jsonb where empresa_id=1 and chave='horario_comercial'`)
  else sql(`delete from configuracoes_sistema where empresa_id=1 and chave='horario_comercial'`)
  console.log(`limpeza: contatos de teste restantes = ${sql(`select count(*) from contatos where nome = '${NOME}'`)}`)
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
  process.exit(falhas.length ? 1 : 0)
}
