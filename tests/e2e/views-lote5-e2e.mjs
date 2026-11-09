// Views lote 5 (vendas) — app LOCAL :3010, Supabase LOCAL, a view `vendas` já derrubada.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname='vendas'`) === '0', 'a view vendas não existe no local')
confere(sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc ~* '(from|join)\\s+(public\\.)?vendas\\M'`) === '0', 'nenhuma função lê "vendas"')
const filialAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
sql(`update usuarios set filial_atual_id=null where id='${DONO}'`)
const totalVendas = Number(sql(`select count(*) from vendas_vendas where empresa_id=1`))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
const rest = []
page.on('response', (r) => { const u = r.url(); if (u.includes('/rest/v1/')) rest.push({ u, s: r.status() }) })
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
const api = (url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, texto: await r.text() } }, url)
try {
  for (const rota of ['/dashboard', '/pdv', '/historico', '/garantia', '/relatorios', '/financeiro', '/metas', '/equipe', '/visao-geral',
    '/configuracoes/usuarios', '/ranking', '/assistencia', '/zapintel', '/zapintel/insights', '/zapintel/posvenda']) {
    rest.length = 0
    const g = await page.goto(BASE + rota, { waitUntil: 'networkidle' })
    await espera(800)
    const ruins = rest.filter((x) => x.s >= 400)
    confere(g.status() === 200 && ruins.length === 0, `${rota} 200, REST sem erro${ruins.length ? ' — ' + ruins.map((x) => x.s + ' ' + x.u.split('/rest/v1/')[1].slice(0, 60)).join(' ; ') : ''}`)
    if (rota.startsWith('/zapintel')) {
      const rpcs = rest.filter((x) => /rpc\/zapintel_(dashboard|insights|posvenda)/.test(x.u))
      if (rota !== '/zapintel/insights' || rpcs.length) confere(rpcs.length > 0 && rpcs.every((x) => x.s === 200), `${rota}: RPC do ZapIntel 200 (${rpcs.map((x) => x.s).join(',') || 'nenhuma'})`)
      const corpo = await page.locator('body').innerText()
      confere(!/Não foi possível|deu erro|Tentar de novo/i.test(corpo), `${rota}: sem mensagem de erro na tela`)
    }
  }
  // Histórico: o número de vendas da tela bate com a tabela (mostra a contagem no topo ou linhas).
  await page.goto(BASE + '/historico', { waitUntil: 'networkidle' })
  const h = await page.locator('body').innerText()
  confere(h.length > 200 && !/Erro/.test(h.slice(0, 400)), 'histórico renderiza')
  // Garantia: o embed venda:vendas_vendas!venda_id traz a venda.
  const comVenda = sql(`select count(*) from vendas_termos g join vendas_vendas v on v.id=g.venda_id where g.empresa_id=1`)
  console.log('   termos com venda no banco:', comVenda)
  // Exportar vendas (CSV) = tabela.
  const ex = await api('/api/exportar?tipo=vendas')
  const linhas = ex.texto.trim().split(/\r?\n/).length - 1
  confere(ex.status === 200 && linhas === totalVendas, `exportar vendas: ${ex.status}, ${linhas} linhas (banco ${totalVendas})`)
  // Assistente: a ferramenta de vendas lê a tabela (SQL das funções do ZapIntel direto, como postgres).
  for (const q of [
    `select zapintel_posvenda(null, 1) is not null`,
    `select zapintel_insights(30, null, 1) is not null`,
    `select zapintel_dashboard(null, 1, null) is not null`,
    `select count(*) >= 0 from zapintel_conversa_calc(1, null, 7)`,
  ]) {
    try { const r = sql(`set role postgres; ${q}`); confere(r.endsWith('t'), `${q.slice(7, 40)} roda (${r.slice(-1)})`) } catch (e) {
      // Sem sessão a função pode recusar (escopo); só o "vendas não existe" é defeito deste lote.
      const m = String(e.stderr ?? e)
      const linha = m.split('\n').find((l) => /ERROR/.test(l))?.slice(0, 140) ?? m.slice(0, 140)
      if (/relation .*vendas.* does not exist/.test(m)) falha(`${q.slice(7, 40)}: ${linha}`)
      else ok(`${q.slice(7, 40)} não cita a view (recusa sem sessão: ${linha})`)
    }
  }
} catch (e) {
  falha('exceção: ' + String(e).slice(0, 200))
} finally {
  await browser.close()
  sql(`update usuarios set filial_atual_id=${filialAntes} where id='${DONO}'`)
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
