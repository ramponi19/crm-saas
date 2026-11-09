// Fuso por empresa — varredura das telas (10/11/2026). LOCAL, empresa 1, dono.
//   node tests/e2e/fuso-telas-e2e.mjs
// 1. cada tela do painel abre (sem 5xx), sem pageerror e sem erro de hidratação (#418), com o
//    NAVEGADOR em Tóquio — se algum texto de data dependesse do fuso de quem abre, o servidor e o
//    navegador divergiriam e o #418 apareceria;
// 2. Configurações → Horário mostra o fuso; trocar para Manaus grava (API e banco) e a hora "agora
//    na loja" muda; voltar para Brasília apaga a linha (o padrão). Devolve como estava.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

const TELAS = ['/dashboard', '/leads', '/comunicacao', '/clientes', '/tarefas', '/fila', '/executivo', '/visao-geral',
  '/financeiro', '/metas', '/ranking', '/equipe', '/relatorios', '/historico', '/pdv', '/estoque', '/catalogo',
  '/garantia', '/assistencia', '/propostas', '/avaliacoes', '/configuracoes/horario', '/configuracoes/usuarios', '/modulos']
const fusoAntes = sql(`select coalesce((select valor::text from configuracoes_sistema where empresa_id=1 and chave='fuso'), '')`)
sql(`update usuarios set filial_atual_id=null where id='${DONO}'`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'Asia/Tokyo', locale: 'pt-BR' })
const page = await ctx.newPage()
let erros = []
page.on('pageerror', (e) => erros.push('pageerror: ' + String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error' && /418|hydrat|did not match/i.test(m.text())) erros.push('hidratação: ' + m.text().slice(0, 160)) })
try {
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])

  for (const t of TELAS) {
    erros = []
    const r = await page.goto(BASE + t, { waitUntil: 'networkidle', timeout: 240000 }).catch((e) => ({ status: () => 'erro ' + String(e).slice(0, 80) }))
    await page.waitForTimeout(600)
    const st = r?.status?.() ?? '?'
    confere(typeof st === 'number' && st < 500 && erros.length === 0, `${t}: ${st}${erros.length ? ' — ' + erros.join(' | ') : ''}`)
  }

  // Configurações → Horário
  await page.goto(BASE + '/configuracoes/horario', { waitUntil: 'networkidle' })
  const card = page.locator('text=Fuso horário').first()
  confere(await card.isVisible(), 'cartão "Fuso horário" em Configurações → Horário')
  const sel = page.getByLabel('Fuso da loja')
  await sel.selectOption('America/Manaus')
  await page.getByRole('button', { name: 'Salvar fuso' }).click()
  await page.waitForTimeout(1500)
  confere(sql(`select valor->>'fuso' from configuracoes_sistema where empresa_id=1 and chave='fuso'`) === 'America/Manaus', 'Manaus gravado em configuracoes_sistema')
  const api = await page.evaluate(async () => (await fetch('/api/empresa/fuso')).json())
  confere(api.fuso === 'America/Manaus', `GET /api/empresa/fuso = ${api.fuso}`)
  const inval = await page.evaluate(async () => (await fetch('/api/empresa/fuso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fuso: 'Marte/Base' }) })).status)
  confere(inval === 400, `fuso inválido recusado (${inval})`)
  erros = []
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(600)
  confere(erros.length === 0, `painel abre com a empresa em Manaus${erros.length ? ' — ' + erros.join(' | ') : ''}`)
  await page.goto(BASE + '/configuracoes/horario', { waitUntil: 'networkidle' })
  await page.getByLabel('Fuso da loja').selectOption('America/Sao_Paulo')
  await page.getByRole('button', { name: 'Salvar fuso' }).click()
  await page.waitForTimeout(1500)
  confere(sql(`select count(*) from configuracoes_sistema where empresa_id=1 and chave='fuso'`) === '0', 'voltar para Brasília apaga a linha (vale o padrão)')
} catch (e) {
  falha('erro: ' + String(e).slice(0, 300))
} finally {
  await browser.close()
  if (fusoAntes) sql(`insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'fuso', '${fusoAntes.replace(/'/g, "''")}'::jsonb) on conflict (empresa_id, chave) do update set valor = excluded.valor`)
  else sql(`delete from configuracoes_sistema where empresa_id=1 and chave='fuso'`)
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
  process.exit(falhas.length ? 1 : 0)
}
