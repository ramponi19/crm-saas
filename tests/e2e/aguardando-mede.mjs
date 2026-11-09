// Mede o filtro "aguardando resposta" (varredura em lotes no navegador) no app LOCAL, dono nas 2 lojas.
// 1ª página (tempo até a lista aparecer) e "carregar mais" até acabar (tempo total, requisições, bytes).
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3010'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } })
const page = await ctx.newPage()
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono)
await page.fill('input[type="password"]', 'teste-local-22')
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
const res = []
for (const loja of [3, 6]) {
  await page.evaluate(async (id) => fetch('/api/filial/selecionar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filialId: id }) }), loja)
  for (const rodada of [1, 2, 3]) {
    await page.goto(BASE + '/comunicacao', { waitUntil: 'networkidle' })
    await page.waitForFunction(() => !/Carregando conversas/.test(document.body.innerText))
    const reqs = []
    const ouvir = (r) => { if (/rest\/v1\/conversas/.test(r.url())) reqs.push(r) }
    page.on('request', ouvir)
    const t0 = Date.now()
    await page.selectOption('select[aria-label="Situação"]', 'aguardando')
    await page.waitForFunction(() => !/Carregando conversas/.test(document.body.innerText) && document.querySelectorAll('[data-conversa-id]').length > 0, null, { timeout: 30000 })
    const primeira = Date.now() - t0
    const naPrimeira = await page.locator('[data-conversa-id]').count()
    const reqPrimeira = reqs.length
    // carregar mais até acabar
    const t1 = Date.now()
    let cliques = 0
    for (;;) {
      const b = page.getByRole('button', { name: 'Carregar mais' })
      if (!(await b.count())) break
      const n = await page.locator('[data-conversa-id]').count()
      await b.click(); cliques++
      await page.waitForFunction((x) => document.querySelectorAll('[data-conversa-id]').length > x || ![...document.querySelectorAll('button')].some((y) => /Carregar mais/.test(y.innerText) && !y.disabled), n, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(150)
      if (cliques > 60) break
    }
    const total = await page.locator('[data-conversa-id]').count()
    const resp = await Promise.all(reqs.map((r) => r.response()))
    const bytes = (await Promise.all(resp.map((r) => r?.body().then((b) => b.length).catch(() => 0) ?? 0))).reduce((a, b) => a + b, 0)
    page.off('request', ouvir)
    res.push({ loja, rodada, primeira_ms: primeira, na_primeira: naPrimeira, req_primeira: reqPrimeira, ate_o_fim_ms: Date.now() - t1, cliques, total_aguardando: total, req_total: reqs.length, kb: Math.round(bytes / 1024) })
    console.log(JSON.stringify(res[res.length - 1]))
  }
}
await browser.close()
