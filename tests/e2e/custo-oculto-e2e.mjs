// CUSTO OCULTO NAS TELAS (etapa 1.1e/1.1f, 26/11/2026; docs/etapa-1.1-plano.md §B.1 e §4.4).
// Na JM da SEMENTE LOCAL (empresa 1, Mogi = loja 3), com o app local apontando para o banco local do ritual:
//   (A) Varredura: Dashboard, Histórico, Estoque, PDV, Relatórios, Catálogo e Compras como Dono, Vendedor e Consulta.
//       Cria uma unidade à venda (custo 2.718,28), uma vendida (custo 4.567,89 → lucro 5.308,11) e um pedido de compra
//       (3.141,59). Procura esses números no HTML de cada tela E em todas as respostas que o navegador recebe (RSC,
//       /api, PostgREST). Vendedor e Consulta: ZERO ocorrências. Dono: aparecem (a tela continua mostrando o custo).
//   (B) Entrada de unidade: para o Vendedor o campo "Preço de custo" não existe e aparece a nota do custo pendente;
//       a unidade registrada pela tela nasce com o custo pendente (satélite nulo).
//   (C) Custo pendente: o Dono vê a aba "Custo pendente", informa 1.500 na unidade do Vendedor e o satélite grava,
//       com origem "informado". O Vendedor não vê a aba.
// Rodar: BASE=http://localhost:3011 DB_PORT=57322 node tests/e2e/custo-oculto-e2e.mjs   (FOTOS=<pasta> grava as telas)
// Só contra o banco LOCAL. Tudo o que cria é apagado; o cargo do vendedor.matriz2 (vira Consulta) volta a Vendedor.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3011'
const DB_PORT = process.env.DB_PORT ?? '57322'
const SENHA = 'teste-local-123'   // senha SÓ LOCAL da semente fictícia (supabase/scripts/teste-local)
const FOTOS = process.env.FOTOS ?? ''
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(BASE)) throw new Error('RECUSADO: só contra o app local')
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true })

const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${DB_PORT} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

const USU = { dono: 'dono.jm@teste.invalid', vendedor: 'vendedor.matriz1@teste.invalid', consulta: 'vendedor.matriz2@teste.invalid' }
const M2 = '0e5e0000-0000-4000-8000-000000000102'
const TELAS = ['/dashboard', '/historico', '/estoque', '/pdv', '/relatorios', '/catalogo', '/compras']
// os números de custo do cenário, nos formatos em que podem sair (JSON, pt-BR com e sem milhar)
const MARCAS = ['2718.28', '2.718,28', '2718,28', '4567.89', '4.567,89', '4567,89', '5308.11', '5.308,11', '5308,11', '3141.59', '3.141,59', '3141,59']

const T = Date.now()
const NOME = `Produto Custo Oculto e2e ${T}`
const cargoDe = (n) => sql(`select id from empresa_cargos where empresa_id=1 and nome='${n}'`)
const cargoM2Antes = sql(`select cargo_id from empresa_usuarios where empresa_id=1 and usuario_id='${M2}'`)
sql(`update empresa_usuarios set cargo_id=${cargoDe('Consulta')} where empresa_id=1 and usuario_id='${M2}'`)
// escrita sem usuário (como script): vai ao satélite; a coluna antiga fica como o banco decidir (tempo 2 ou 3)
const produto = sql(`insert into estoque_produtos (empresa_id, nome, preco, ativo) values (1, '${NOME}', 9876, true) returning id`)
const uVenda = sql(`insert into estoque_unidades (empresa_id, filial_id, produto_id, numero_serie, preco_venda, preco_custo, status, ativo, quantidade) values (1, 3, ${produto}, 'OC${T}A', 9876, 2718.28, 'disponivel', true, 1) returning id`)
const uVendida = sql(`insert into estoque_unidades (empresa_id, filial_id, produto_id, numero_serie, preco_venda, preco_custo, status, ativo, quantidade) values (1, 3, ${produto}, 'OC${T}B', 9876, 4567.89, 'vendido', true, 1) returning id`)
// a venda é DO VENDEDOR (ele só enxerga as próprias): assim a tela dele mostra a venda, e o teste prova que vem sem lucro
const M1 = '0e5e0000-0000-4000-8000-000000000101'
const venda = sql(`insert into vendas_vendas (empresa_id, filial_id, produto_id, unidade_id, valor_venda, status, data_venda, vendedor_id, usuario_id) values (1, 3, ${produto}, ${uVendida}, 9876, 'concluida', now(), '${M1}', '${M1}') returning id`)
const pedido = sql(`insert into compras_pedidos (empresa_id, filial_id, descricao, valor_total) values (1, 3, 'Pedido custo oculto e2e ${T}', 3141.59) returning id`)
const tempo = sql(`select case when preco_custo is null then 3 else 2 end from estoque_unidades where id=${uVenda}`)
console.log(`tempo ${tempo} | produto ${produto} | unidades ${uVenda}/${uVendida} | venda ${venda} | pedido ${pedido}`)
confere(sql(`select valor_custo from vendas_vendas_custos where venda_id=${venda}`) === '4567.89', 'cenário: a venda pegou o custo da unidade (4.567,89) no satélite')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
let uPendente = ''
try {
  // ── A. varredura ─────────────────────────────────────────────────────────────────────────────────
  const achadosDono = {}
  for (const [quem, email] of Object.entries(USU)) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => falha(`${quem}: pageerror ${String(e).slice(0, 160)}`))
    let respostas = []
    page.on('response', async (r) => {
      const ct = r.headers()['content-type'] ?? ''
      if (!/json|text|x-component/.test(ct)) return
      try { respostas.push({ url: r.url(), corpo: await r.text() }) } catch { /* corpo indisponível (redirect) */ }
    })
    await page.goto(BASE + '/login', { timeout: 300000 })
    await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
    await page.evaluate(() => { try { localStorage.clear() } catch { /* */ } })
    for (const tela of TELAS) {
      respostas = []
      await page.goto(BASE + tela, { waitUntil: 'networkidle', timeout: 300000 }).catch(() => {})
      await espera(1500)
      if (tela === '/estoque') {
        // a lista mostra a coluna Custo; a aba pendentes só existe para quem tem a permissão
        const aba = page.getByText(/^Custo pendente/).first()
        const temAba = await aba.count() > 0
        confere(quem === 'dono' ? temAba : !temAba, `${quem}: aba "Custo pendente" ${quem === 'dono' ? 'aparece' : 'não aparece'} no Estoque`)
      }
      let html = ''
      for (let i = 0; i < 8 && !html; i++) { try { await page.waitForLoadState('networkidle'); html = await page.content() } catch { await espera(1000) } }
      const onde = []
      for (const m of MARCAS) {
        if (html.includes(m)) onde.push(`html:${m}`)
        for (const r of respostas) if (r.corpo.includes(m)) onde.push(`${new URL(r.url).pathname.slice(0, 60)}:${m}`)
      }
      const final = new URL(page.url()).pathname
      if (tela === '/historico') confere(html.includes('9.876,00'), `${quem} /historico: a venda de teste está na tela (o zero de custo vale)`)
      if (FOTOS) await page.screenshot({ path: `${FOTOS}/${quem}${tela.replace(/\//g, '-')}.png`, fullPage: true }).catch(() => {})
      if (quem === 'dono') { achadosDono[tela] = onde.length; console.log(`     dono ${tela} → ${final}: ${onde.length} ocorrência(s) do custo`) }
      else confere(onde.length === 0, `${quem} ${tela} → ${final}: nenhuma ocorrência do custo${onde.length ? ` (achou: ${[...new Set(onde)].slice(0, 6).join(', ')})` : ''}`)
    }
    if (quem === 'dono') {
      for (const tela of ['/estoque', '/historico', '/catalogo']) confere(achadosDono[tela] > 0, `dono ${tela}: o custo continua visível (${achadosDono[tela]})`)
    }

    // ── B. entrada de unidade pelo Vendedor: sem campo de custo, nasce pendente ──────────────────────────
    if (quem === 'vendedor') {
      await page.goto(BASE + '/estoque', { waitUntil: 'networkidle', timeout: 300000 })
      await page.getByRole('button', { name: /Entrada de estoque/ }).first().click(); await espera(800)
      confere(await page.getByLabel('Preço de custo *').count() === 0, 'B: vendedor — o campo "Preço de custo" não aparece na entrada')
      confere(await page.getByText('O custo fica', { exact: false }).count() > 0, 'B: vendedor — a nota do custo pendente aparece')
      await page.getByLabel(/Produto \(catálogo\)/).first().selectOption(String(produto))
      await espera(600)
      const serie = page.getByLabel(/Número de série|IMEI 1|Código/).first()
      if (await serie.count()) await serie.fill(`OC${T}P`)
      await page.getByLabel('Preço de venda *').first().fill('3000')
      await page.getByRole('button', { name: 'Registrar entrada' }).click(); await espera(2500)
      uPendente = sql(`select coalesce(max(id)::text, '') from estoque_unidades where produto_id=${produto} and id not in (${uVenda}, ${uVendida})`)
      confere(uPendente !== '', `B: a unidade do vendedor foi registrada pela tela (${uPendente || 'não gravou'})`)
      if (uPendente) {
        const r = sql(`select coalesce(u.preco_custo::text,'nulo')||'|'||coalesce(c.preco_custo::text,'nulo')||'|'||c.custo_origem from estoque_unidades u join estoque_unidades_custos c on c.unidade_id=u.id where u.id=${uPendente}`)
        confere(r === 'nulo|nulo|entrada', `B: nasce com o custo pendente (coluna|satélite|origem = ${r})`)
      }
      if (FOTOS) await page.screenshot({ path: `${FOTOS}/vendedor-estoque-entrada.png`, fullPage: true }).catch(() => {})
    }

    await ctx.close()
  }

  // ── C. Dono informa o custo pendente (depois do laço: a unidade vem do Vendedor, no B) ──────────────────
  if (uPendente) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => falha(`C: pageerror ${String(e).slice(0, 160)}`))
    await page.goto(BASE + '/login', { timeout: 300000 })
    await page.fill('input[type="email"]', USU.dono); await page.fill('input[type="password"]', SENHA)
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
    await page.goto(BASE + '/estoque', { waitUntil: 'networkidle', timeout: 300000 })
    await page.getByText(/^Custo pendente/).first().click(); await espera(1500)
    if (FOTOS) await page.screenshot({ path: `${FOTOS}/dono-estoque-pendentes.png`, fullPage: true }).catch(() => {})
    const linha = page.locator('tr').filter({ hasText: `OC${T}P` }).first()
    const temLinha = await linha.count() > 0
    confere(temLinha, 'C: a unidade do vendedor aparece em "Custo pendente"')
    if (temLinha) {
      await linha.getByLabel('Custo').fill('1500')
      await linha.getByRole('button', { name: 'Informar' }).click(); await espera(2000)
      const r = sql(`select coalesce(u.preco_custo::text,'nulo')||'|'||c.preco_custo||'|'||c.custo_origem from estoque_unidades u join estoque_unidades_custos c on c.unidade_id=u.id where u.id=${uPendente}`)
      confere(r.replace(/\.00/g, '') === `${tempo === '3' ? 'nulo' : '1500'}|1500|informado`, `C: o Dono informou 1.500 (coluna|satélite|origem = ${r})`)
      confere(await page.locator('tr').filter({ hasText: `OC${T}P` }).count() === 0, 'C: a unidade sai da lista de pendentes')
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  sql(`delete from vendas_vendas where id=${venda}`)
  sql(`delete from compras_pedidos where id=${pedido}`)
  sql(`delete from estoque_unidades where produto_id=${produto}`)
  sql(`delete from estoque_produtos where id=${produto}`)
  sql(`update empresa_usuarios set cargo_id=${cargoM2Antes || 'null'} where empresa_id=1 and usuario_id='${M2}'`)
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
