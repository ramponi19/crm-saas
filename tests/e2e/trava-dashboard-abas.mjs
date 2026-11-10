// A TRAVA DO DASHBOARD DO ZAPINTEL com abas de verdade (10/11/2026). LOCAL, empresa 1, dono.
//   node tests/e2e/trava-dashboard-abas.mjs [http://localhost:3010] [segundos=240]
// Três abas de /zapintel no mesmo navegador (a 3ª "escondida" no começo, como ctrl+clique). O banco
// avisa uma mensagem a cada 12 s (o pico de 09/11) e uma ficha refeita por minuto, pelo mesmo
// realtime.send do gatilho. Confere, contando as chamadas a /rpc/zapintel_dashboard de cada aba:
//   - a aba escondida não consulta (nem a carga inicial); ao aparecer, mostra o dado;
//   - fora das aberturas, o navegador inteiro faz no máximo 1 dashboard a cada 60 s (abas partilham);
//   - nunca dois dashboards ao mesmo tempo fora das aberturas;
//   - ficha refeita sozinha não refaz o dashboard.
// Não grava nada no banco (só avisos de realtime).
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const DURACAO = Number(process.argv[3] || 240) * 1000
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
sql(`update usuarios set filial_atual_id=null where id='${DONO}'`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'pt-BR' })
const t0 = Date.now()
const consultas = [] // { aba, ini, fim }
const avisos = []
function vigiar(page, aba) {
  page.on('request', (r) => { if (/\/rest\/v1\/rpc\/zapintel_dashboard(\?|$)/.test(r.url())) { r._ini = Date.now() - t0; consultas.push({ aba, ini: r._ini, fim: null, r }) } })
  const fim = (r) => { const c = consultas.find((x) => x.r === r); if (c) c.fim = Date.now() - t0 }
  page.on('requestfinished', fim); page.on('requestfailed', fim)
}
const ESCONDE = `(() => {
  window.__escondida = true
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return !!window.__escondida } })
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__escondida ? 'hidden' : 'visible' } })
})()`
let timer
try {
  const login = await ctx.newPage()
  await login.goto(BASE + '/login', { timeout: 240000 })
  await login.fill('input[type="email"]', E.dono); await login.fill('input[type="password"]', SENHA)
  await Promise.all([login.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), login.click('button[type="submit"]')])
  await login.close()

  const abas = []
  for (const [i, espera, escondida] of [[0, 0, false], [1, 3000, false], [2, 6000, true]]) {
    await new Promise((r) => setTimeout(r, espera))
    const p = await ctx.newPage(); vigiar(p, i)
    if (escondida) await p.addInitScript(ESCONDE)
    await p.goto(BASE + '/zapintel', { waitUntil: 'domcontentloaded', timeout: 240000 })
    abas.push(p)
  }
  const aberturaAte = Date.now() - t0 + 15_000

  // Avisos do banco: mensagem a cada 12 s, ficha a cada 60 s.
  let n = 0
  timer = setInterval(() => {
    n++
    const ev = n % 5 === 0 ? 'analises' : 'mensagens'
    sql(`select realtime.send(jsonb_build_object('em', now()), '${ev}', 'zapintel:1', true)`)
    avisos.push({ ev, t: Date.now() - t0 })
  }, 12_000)

  // A aba escondida aparece aos 90 s.
  await new Promise((r) => setTimeout(r, 90_000))
  const apareceu = Date.now() - t0
  await abas[2].evaluate(() => { window.__escondida = false; document.dispatchEvent(new Event('visibilitychange')) })
  await new Promise((r) => setTimeout(r, Math.max(0, DURACAO - (Date.now() - t0))))
  clearInterval(timer)
  await new Promise((r) => setTimeout(r, 3000))

  const c = consultas.map(({ aba, ini, fim }) => ({ aba, ini, fim: fim ?? ini }))
  console.log(`avisos: ${avisos.filter((a) => a.ev === 'mensagens').length} de mensagem, ${avisos.filter((a) => a.ev === 'analises').length} de ficha em ${Math.round(DURACAO / 1000)} s`)
  for (const i of [0, 1, 2]) console.log(`  aba ${i}: ${c.filter((x) => x.aba === i).map((x) => `${(x.ini / 1000).toFixed(1)}s(${x.fim - x.ini}ms)`).join(' ')}`)

  confere(c.some((x) => x.aba === 0) && c.some((x) => x.aba === 1), 'as abas visíveis carregaram o dashboard')
  const escondidas = c.filter((x) => x.aba === 2 && x.ini < apareceu)
  confere(escondidas.length === 0, `aba escondida não consultou até aparecer (${escondidas.length})`)
  const texto = await abas[2].locator('body').innerText()
  confere(/Esperando|esperando|Recebidas|recebidas/.test(texto), 'a aba que apareceu mostra o dashboard (por consulta própria ou partilhada)')

  const recalc = c.filter((x) => x.ini > aberturaAte).sort((a, b) => a.ini - b.ini)
  const gaps = recalc.slice(1).map((x, i) => x.ini - recalc[i].ini)
  console.log(`  recálculos fora das aberturas: ${recalc.length}; intervalos: ${gaps.map((g) => (g / 1000).toFixed(1) + 's').join(' ')}`)
  confere(recalc.length >= 1, 'houve recálculo por aviso de mensagem')
  confere(gaps.every((g) => g >= 59_000), 'no máximo 1 dashboard a cada 60 s no navegador inteiro')
  let max = 0
  for (const x of recalc) max = Math.max(max, recalc.filter((y) => y.ini <= x.ini && y.fim >= x.ini).length)
  confere(max <= 1, `nunca dois dashboards ao mesmo tempo fora das aberturas (máx ${max})`)
  // Antes (20 s por aba, cada aba por si) seriam ~3 abas × (duração/20 s).
  console.log(`  comparação: a regra de antes faria até ~${Math.floor((DURACAO - 15_000) / 20_000) * 2 + Math.floor((DURACAO - apareceu) / 20_000)} recálculos neste roteiro`)
} catch (e) {
  falha('erro: ' + String(e).slice(0, 300))
} finally {
  clearInterval(timer)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
