// Views lote 7 (canais) — app LOCAL :3010, Supabase LOCAL, canais_conectados já derrubada.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname='canais_conectados'`) === '0', 'canais_conectados não existe no local')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const fil = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
const doBanco = sql(`select count(*) from canais where empresa_id=1 and (${fil === 'null' ? 'true' : 'filial_id is null or filial_id=' + fil})`)
const canal = sql(`select id||'|'||coalesce(filial_id::text,'null') from canais where empresa_id=1 and tipo='whatsapp' order by id limit 1`).split('|')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
const reqs = []
page.on('response', (r) => { if (r.url().includes('/rest/v1/') || r.url().includes('/api/')) reqs.push({ u: r.url(), s: r.status() }) })
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])
try {
  let r = await api('/api/canais')
  const lista = r.json?.canais ?? r.json?.data ?? r.json
  confere(r.status === 200 && Array.isArray(lista) && String(lista.length) === doBanco, `GET /api/canais: ${r.status}, ${Array.isArray(lista) ? lista.length : '?'} canais (banco ${doBanco})`)
  confere(Array.isArray(lista) && lista.every((c) => !('access_token_enc' in c)), 'GET /api/canais não devolve o token')
  // PATCH muda a loja do canal e volta (tabela canais, empresa da sessão).
  r = await api(`/api/canais/${canal[0]}`, 'PATCH', { filialId: 6 })
  confere(r.status === 200 && sql(`select filial_id from canais where id=${canal[0]}`) === '6', `PATCH /api/canais/${canal[0]} muda a loja (${r.status})`)
  r = await api(`/api/canais/${canal[0]}`, 'PATCH', { filialId: canal[1] === 'null' ? null : Number(canal[1]) })
  confere(r.status === 200 && sql(`select coalesce(filial_id::text,'null') from canais where id=${canal[0]}`) === canal[1], 'PATCH devolve a loja original')
  r = await api('/api/canais/999999', 'PATCH', { filialId: null })
  confere(r.status !== 200 || (Array.isArray(r.json?.data) && r.json.data.length === 0) || r.status === 404, `PATCH de canal inexistente não finge sucesso (${r.status} ${JSON.stringify(r.json).slice(0, 80)})`)
  r = await api('/api/modelos')
  confere(r.status === 200, `GET /api/modelos: ${r.status}`)
  for (const rota of ['/configuracoes/integracoes', '/comunicacao', '/leads', '/configuracoes']) {
    reqs.length = 0
    const g = await page.goto(BASE + rota, { waitUntil: 'networkidle' })
    await espera(800)
    const ruins = reqs.filter((x) => x.s >= 400 && !x.u.includes('/api/modelos/sincronizar'))
    confere(g.status() === 200 && ruins.length === 0, `${rota} 200, sem erro de REST/API${ruins.length ? ' — ' + ruins.map((x) => x.s + ' ' + x.u.split(/\/rest\/v1\/|\/api\//)[1]?.slice(0, 60)).join(' ; ') : ''}`)
  }
  await page.goto(BASE + '/configuracoes/integracoes', { waitUntil: 'networkidle' })
  const txt = await page.locator('main').last().innerText()
  confere(/WhatsApp/i.test(txt) && /Instagram/i.test(txt), 'Integrações mostra os cartões de WhatsApp e Instagram')
} catch (e) {
  falha('exceção: ' + String(e).slice(0, 200))
} finally {
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
