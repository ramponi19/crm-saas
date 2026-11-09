// Quadro /leads lendo o core — ponta a ponta no app LOCAL (:3010). uso: node quadro-e2e.mjs <usuarios.json> <esperado.json> <saida.json> <fotos>
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const [arqU, arqE, arqSaida, fotos] = process.argv.slice(2)
const BASE = 'http://localhost:3010'
const usuarios = JSON.parse(fs.readFileSync(arqU, 'utf8'))
const esperado = JSON.parse(fs.readFileSync(arqE, 'utf8'))
fs.mkdirSync(fotos, { recursive: true })
const out = []
const falhas = []
const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function lerQuadro(page) {
  return page.evaluate(() => {
    const t = document.body.innerText
    const colunas = Object.fromEntries([...document.querySelectorAll('[data-etapa]')].map((c) => [c.getAttribute('data-etapa'), {
      total: Number(c.querySelector('[data-total]')?.textContent ?? -1),
      cartoes: c.querySelectorAll('[data-lead-id]').length,
      ids: [...c.querySelectorAll('[data-lead-id]')].map((e) => Number(e.getAttribute('data-lead-id'))),
      mais: [...c.querySelectorAll('button')].find((b) => /Carregar mais/.test(b.innerText))?.innerText ?? null,
    }]))
    return {
      emAberto: Number((t.match(/([\d.]+) em aberto/) ?? [])[1]?.replace(/\./g, '') ?? -1),
      aguardando: Number((t.match(/([\d.]+) aguardando resposta/) ?? [])[1]?.replace(/\./g, '') ?? 0),
      esteira: Number((t.match(/Esteira \((\d+)\)/) ?? [])[1] ?? 0),
      colunas,
    }
  })
}
const esperarQuadro = (page) => page.waitForFunction(() => document.querySelectorAll('[data-lead-id]').length > 0, null, { timeout: 30000 })

for (const u of usuarios) {
  const lojas = u.papel === 'owner' ? [3, 6] : [u.lojas[0].id]
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push('pageerror: ' + String(e).slice(0, 160)))
  page.on('response', (r) => { if (r.status() >= 500) erros.push(`${r.status()} ${r.url().slice(0, 120)}`) })
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', u.email)
  await page.fill('input[type="password"]', 'teste-local-22')
  await Promise.all([page.waitForURL((x) => !x.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])

  for (const loja of lojas) {
    if (u.papel === 'owner') await page.evaluate((f) => fetch('/api/filial/selecionar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filialId: f }) }), loja)
    const esp = esperado.find((e) => e.usuario === u.nome && e.loja === loja).c
    // ── abertura: bytes do documento + o que o quadro pediu ──
    let bytes = 0; const pedidos = []
    const medir = async (r) => {
      const url = r.url()
      if ((url.startsWith(BASE + '/leads') && r.request().resourceType() === 'document') || /\/rest\/v1\/rpc\/quadro_/.test(url)) {
        try { const b = (await r.body()).length; bytes += b; pedidos.push(url.replace(/^.*\/(leads|rpc\/\w+).*$/, '$1') + ' ' + b) } catch {}
      }
    }
    page.on('response', medir)
    const t0 = Date.now()
    await page.goto(BASE + '/leads', { waitUntil: 'domcontentloaded' })
    await esperarQuadro(page)
    await page.waitForTimeout(1500)
    const ms = Date.now() - t0
    page.off('response', medir)
    const q = await lerQuadro(page)
    const esperadoEmAberto = Object.values(esp.etapas).reduce((s, v) => s + v.total, 0)
    const esperadoAguardando = Object.values(esp.etapas).reduce((s, v) => s + v.aguardando, 0)
    const linha = { usuario: u.nome, loja, bytes, ms, pedidos, emAberto: q.emAberto, aguardando: q.aguardando, esteira: q.esteira }
    if (bytes > 300 * 1024) falha(`${u.nome}/${loja}: abertura ${bytes} B`)
    if (q.emAberto !== esperadoEmAberto) falha(`${u.nome}/${loja}: em aberto ${q.emAberto} ≠ ${esperadoEmAberto}`)
    if (q.aguardando !== esperadoAguardando) falha(`${u.nome}/${loja}: aguardando ${q.aguardando} ≠ ${esperadoAguardando}`)
    if (q.esteira !== esp.esteira) falha(`${u.nome}/${loja}: esteira ${q.esteira} ≠ ${esp.esteira}`)
    let colOk = 0
    for (const [etapa, c] of Object.entries(q.colunas)) {
      const tot = esp.etapas[etapa]?.total ?? 0
      const naTela = Math.min(50, tot)
      if (c.total !== tot || c.cartoes !== naTela || (tot > 50) !== Boolean(c.mais)) falha(`${u.nome}/${loja} coluna ${etapa}: total ${c.total}/${tot}, cartões ${c.cartoes}/${naTela}, botão ${c.mais}`)
      else colOk++
    }
    linha.colunas = `${colOk}/${Object.keys(q.colunas).length}`
    await page.screenshot({ path: `${fotos}/${u.nome}-${loja}-abertura.png` })

    // ── carregar mais, na primeira coluna que tem ──
    const comMais = Object.entries(q.colunas).find(([, c]) => c.mais)
    if (comMais) {
      const [etapa, c] = comMais
      await page.locator(`[data-etapa="${etapa}"] button:has-text("Carregar mais")`).click()
      await page.waitForFunction(([e, n]) => document.querySelectorAll(`[data-etapa="${e}"] [data-lead-id]`).length > n, [etapa, c.cartoes], { timeout: 20000 }).catch(() => {})
      const depois = (await lerQuadro(page)).colunas[etapa]
      const tot = esp.etapas[etapa].total
      const esperadoNaTela = Math.min(100, tot)
      const repetidos = depois.ids.length - new Set(depois.ids).size
      linha.carregarMais = `${etapa}: ${c.cartoes} → ${depois.cartoes} (${depois.mais ?? 'sem botão'})`
      if (depois.cartoes !== esperadoNaTela || repetidos) falha(`${u.nome}/${loja} carregar mais ${etapa}: ${depois.cartoes}/${esperadoNaTela}, repetidos ${repetidos}`)
    }

    // ── esteira (filtro) ──
    await page.locator('button:has-text("Esteira")').click()
    await page.waitForTimeout(2500)
    const est = await lerQuadro(page)
    const espEst = Object.values(esp.esteiraFiltro.etapas).reduce((s, v) => s + v.total, 0)
    linha.filtroEsteira = `${est.emAberto} (esperado ${espEst})`
    if (est.emAberto !== espEst) falha(`${u.nome}/${loja} filtro esteira: ${est.emAberto} ≠ ${espEst}`)
    await page.locator('button:has-text("Esteira")').click()
    await page.waitForTimeout(2000)

    // ── tempo real: mover um lead pela API e ver o quadro mudar sozinho ──
    const origem = Object.entries(q.colunas).find(([, c]) => c.ids.length)
    const destinoEtapa = Object.keys(q.colunas).find((e) => e !== origem[0] && e !== 'perdido' && e !== 'convertido')
    const leadId = origem[1].ids[0]
    const m1 = await page.evaluate(([id, e]) => fetch('/api/leads/mover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: id, kanban_status: e }) }).then((r) => r.status), [leadId, destinoEtapa])
    const chegou = await page.waitForFunction(([id, e]) => !!document.querySelector(`[data-etapa="${e}"] [data-lead-id="${id}"]`), [leadId, destinoEtapa], { timeout: 15000 }).then(() => true).catch(() => false)
    await page.waitForTimeout(1500)
    const aposMover = await lerQuadro(page)
    const m2 = await page.evaluate(([id, e]) => fetch('/api/leads/mover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: id, kanban_status: e }) }).then((r) => r.status), [leadId, origem[0]])
    const voltou = await page.waitForFunction(([id, e]) => !!document.querySelector(`[data-etapa="${e}"] [data-lead-id="${id}"]`), [leadId, origem[0]], { timeout: 15000 }).then(() => true).catch(() => false)
    linha.tempoReal = `lead ${leadId} ${origem[0]}→${destinoEtapa}: ${m1} chegou=${chegou} total destino ${q.colunas[destinoEtapa].total}→${aposMover.colunas[destinoEtapa].total} | volta ${m2} voltou=${voltou}`
    if (!chegou || !voltou || aposMover.colunas[destinoEtapa].total !== q.colunas[destinoEtapa].total + 1) falha(`${u.nome}/${loja} tempo real: ${linha.tempoReal}`)

    // ── abrir um card pelo quadro ──
    await page.waitForTimeout(1500)
    await page.locator(`[data-lead-id="${leadId}"]`).first().click()
    const abriu = await page.waitForFunction(() => /hist[óo]rico de mensagens/i.test(document.body.innerText), null, { timeout: 20000 }).then(() => true).catch(() => false)
    linha.card = abriu
    if (!abriu) falha(`${u.nome}/${loja}: card ${leadId} não abriu pelo quadro`)
    await page.keyboard.press('Escape')
    out.push(linha)
    console.log(JSON.stringify(linha))
  }

  // vendedor: lead da outra loja pela URL → aviso, não card
  if (u.papel !== 'owner') {
    const outra = esperado.find((e) => e.usuario !== u.nome && e.usuario !== 'dono')
    const idOutra = u.nome === 'vend-mogi' ? u.outraLojaLead : u.outraLojaLead
    if (idOutra) {
      await page.goto(`${BASE}/leads?lead=${idOutra}`, { waitUntil: 'domcontentloaded' })
      const aviso = await page.waitForFunction(() => /não está na loja selecionada/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true).catch(() => false)
      console.log(u.nome, 'lead da outra loja pela URL → aviso:', aviso)
      if (!aviso) falha(`${u.nome}: lead ${idOutra} de outra loja não mostrou o aviso`)
    }
    void outra
  }
  if (erros.length) falha(`${u.nome}: ${erros.slice(0, 4).join(' | ')}`)
  await ctx.close()
}
await browser.close()
fs.writeFileSync(arqSaida, JSON.stringify({ out, falhas }, null, 1))
console.log(`FIM: ${falhas.length} falha(s)`)
