// Aviso de VALOR MUITO ABAIXO DO CATÁLOGO (17/11/2026, pedido do Lucas): abaixo da metade do preço do produto
// no catálogo, o PDV e a encomenda perguntam antes de gravar ("Confirme o valor: R$ 7,60 para um produto de
// R$ 7.695,00") — sem bloquear. Três pontos, na JM local (empresa 1, Mogi):
//   (A) PDV: peça com preço R$ 7,60 de um produto de R$ 7.695 → "Finalizar venda" pergunta; "Corrigir" não grava.
//   (B) Encomenda nova com R$ 7,60 → pergunta; "Corrigir" não grava; "O valor está certo" grava R$ 7,60.
//   (C) Ajuste da encomenda (lápis) para R$ 5 → pergunta; "Corrigir" deixa o valor como estava; R$ 7.000
//       (acima da metade) salva sem perguntar.
//   (D) Produto SEM preço no catálogo (17/11 noite): a referência é a mediana das vendas dele em 90 dias, só com
//       5 ou mais. Com 6 vendas (mediana R$ 7.695) a encomenda de R$ 7,60 pergunta e diz "mediana das últimas 6
//       vendas: R$ 7.695"; com 4 vendas não há referência e lança sem perguntar.
// Rodar: node tests/e2e/pdv-valor-catalogo-e2e.mjs (app LOCAL :3010, Supabase LOCAL). Tudo o que cria é apagado.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=' + (process.env.DB_PORT ?? '54322') + ' dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const nb = (s) => (s ?? '').replace(/\u00a0/g, ' ')

const T = Date.now()
const NOME = `Produto Valor e2e ${T}`
const IMEI = `35${String(T).slice(-13)}`
const dono = sql(`select id from usuarios where email='${E.dono}'`)
const filialAntes = sql(`select coalesce(filial_atual_id::text, '') from usuarios where id='${dono}'`)
sql(`update usuarios set filial_atual_id=3 where id='${dono}'`)
const produto = sql(`insert into estoque_produtos (empresa_id, nome, preco, ativo) values (1, '${NOME}', 7695, true) returning id`)
const unidade = sql(`insert into estoque_unidades (empresa_id, filial_id, produto_id, imei, preco_venda, preco_custo, status, ativo, quantidade)
  values (1, 3, ${produto}, '${IMEI}', 7.60, 0, 'disponivel', true, 1) returning id`)
const cliente = sql(`select id from contatos where empresa_id=1 and ativo and nome is not null order by id limit 1`)
const vendasDoProduto = () => sql(`select count(*) from vendas_vendas where produto_id=${produto}`)
// D: dois produtos sem preço no catálogo — um com 6 vendas recentes, outro com 4 (vendas antigas de 120 dias não contam)
const NOME_MED = `Produto Mediana e2e ${T}`, NOME_POUCAS = `Produto Poucas e2e ${T}`
const prodMed = sql(`insert into estoque_produtos (empresa_id, nome, preco, ativo) values (1, '${NOME_MED}', null, true) returning id`)
const prodPoucas = sql(`insert into estoque_produtos (empresa_id, nome, preco, ativo) values (1, '${NOME_POUCAS}', null, true) returning id`)
for (const v of [7695, 7695, 7495, 7895, 7795, 7595]) sql(`insert into vendas_vendas (empresa_id, filial_id, produto_id, valor_venda, valor_custo, status, data_venda) values (1, 3, ${prodMed}, ${v}, 0, 'concluida', now() - interval '10 days')`)
sql(`insert into vendas_vendas (empresa_id, filial_id, produto_id, valor_venda, valor_custo, status, data_venda) values (1, 3, ${prodMed}, 100, 0, 'concluida', now() - interval '120 days')`)
for (const v of [7695, 7695, 7495, 7895]) sql(`insert into vendas_vendas (empresa_id, filial_id, produto_id, valor_venda, valor_custo, status, data_venda) values (1, 3, ${prodPoucas}, ${v}, 0, 'concluida', now() - interval '10 days')`)
const vendasDe = (id) => sql(`select count(*) from vendas_vendas where produto_id=${id}`)
console.log('produto', produto, '| unidade', unidade, '| cliente', cliente)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
const dialogo = () => page.locator('[role="dialog"]').filter({ hasText: 'Valor bem abaixo do normal' })
try {
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])

  // ── A. PDV ──────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle', timeout: 300000 })
  await page.fill('input[placeholder^="Escaneie o código de barras"]', IMEI)
  await espera(1200)
  const cards = page.locator('div.grid > button.rounded-card:not([disabled])')
  confere(await cards.count() === 1, `A: a busca acha a peça de teste (${await cards.count()})`)
  await cards.first().click(); await espera(800)
  await page.getByRole('button', { name: /^Finalizar venda/ }).click(); await espera(800)
  const tA = nb(await dialogo().innerText().catch(() => ''))
  confere(tA.includes('Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00 (preço do catálogo)'), `A: o PDV pergunta antes de fechar ("${tA.split('\n').slice(1).join(' ').slice(0, 110)}")`)
  await dialogo().getByRole('button', { name: 'Corrigir' }).click(); await espera(800)
  confere(await dialogo().count() === 0 && vendasDoProduto() === '0' && sql(`select status from estoque_unidades where id=${unidade}`) === 'disponivel',
    'A: "Corrigir" fecha a pergunta e nada é gravado (peça disponível)')

  // ── B. Encomenda nova ───────────────────────────────────────────────────────
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle', timeout: 300000 })
  await page.getByRole('button', { name: /^Encomenda/ }).first().click(); await espera(600)
  await page.getByRole('button', { name: /Nova encomenda/ }).first().click(); await espera(600)
  await page.getByLabel('Cliente', { exact: true }).first().selectOption(cliente)
  await page.getByLabel('Produto').first().fill(NOME.slice(0, 22)); await espera(1500)
  await page.getByText(NOME, { exact: false }).first().click(); await espera(1000)
  const preco = page.getByLabel('Preço deste item (R$)').first()
  confere(await preco.inputValue() === '7695', `B: escolher o produto traz o preço do catálogo (${await preco.inputValue()})`)
  await preco.fill('7.6')
  await page.getByRole('button', { name: 'Lançar encomenda' }).click(); await espera(800)
  const tB = nb(await dialogo().innerText().catch(() => ''))
  confere(tB.includes('Confirme o valor: R$ 7,60 para um produto de R$ 7.695,00 (preço do catálogo)'), 'B: a encomenda pergunta antes de lançar')
  await dialogo().getByRole('button', { name: 'Corrigir' }).click(); await espera(1000)
  confere(vendasDoProduto() === '0', 'B: "Corrigir" não grava nada')
  await page.getByRole('button', { name: 'Lançar encomenda' }).click(); await espera(800)
  await dialogo().getByRole('button', { name: /O valor está certo/ }).click()
  for (let i = 0; i < 40 && vendasDoProduto() === '0'; i++) await espera(250)
  const vB = sql(`select id || '|' || valor_venda || '|' || status from vendas_vendas where produto_id=${produto} order by id desc limit 1`)
  confere(/\|7\.60\|encomenda$/.test(vB), `B: "O valor está certo" lança a encomenda com R$ 7,60, sem bloquear (${vB})`)
  const vendaB = vB.split('|')[0]

  // ── C. Ajuste da encomenda (lápis) ──────────────────────────────────────────
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle', timeout: 300000 })
  await page.getByRole('button', { name: /^Encomenda/ }).first().click(); await espera(800)
  const cartao = page.locator('div.rounded-card, div.card').filter({ hasText: NOME }).last()
  await cartao.locator('button[title="Ajustar valores e prazo"]').first().click()
  await espera(600)
  await page.getByLabel('Venda (R$)').first().fill('5')
  await page.getByRole('button', { name: 'Salvar', exact: true }).first().click(); await espera(800)
  const tC = nb(await dialogo().innerText().catch(() => ''))
  confere(tC.includes('Confirme o valor: R$ 5,00 para um produto de R$ 7.695,00 (preço do catálogo)'), 'C: o ajuste pergunta antes de salvar')
  await dialogo().getByRole('button', { name: 'Corrigir' }).click(); await espera(1000)
  confere(sql(`select valor_venda from vendas_vendas where id=${vendaB}`) === '7.60', 'C: "Corrigir" deixa o valor como estava')
  await page.getByLabel('Venda (R$)').first().fill('7000')
  await page.getByRole('button', { name: 'Salvar', exact: true }).first().click(); await espera(800)
  confere(await dialogo().count() === 0, 'C: R$ 7.000 (acima da metade) salva sem perguntar')
  for (let i = 0; i < 40 && sql(`select valor_venda from vendas_vendas where id=${vendaB}`) !== '7000.00'; i++) await espera(250)
  confere(sql(`select valor_venda from vendas_vendas where id=${vendaB}`) === '7000.00', 'C: o ajuste gravou R$ 7.000')

  // ── D. Sem preço no catálogo: mediana das vendas (5+) ───────────────────────
  async function encomendaDe(nome, valor) {
    await page.goto(BASE + '/pdv', { waitUntil: 'networkidle', timeout: 300000 })
    await page.getByRole('button', { name: /^Encomenda/ }).first().click(); await espera(600)
    await page.getByRole('button', { name: /Nova encomenda/ }).first().click(); await espera(600)
    await page.getByLabel('Cliente', { exact: true }).first().selectOption(cliente)
    await page.getByLabel('Produto').first().fill(nome.slice(0, 24)); await espera(1500)
    await page.getByText(nome, { exact: false }).first().click(); await espera(1000)
    await page.getByLabel('Preço deste item (R$)').first().fill(valor)
    await page.getByRole('button', { name: 'Lançar encomenda' }).click(); await espera(1000)
  }
  await encomendaDe(NOME_MED, '7.6')
  const tD = nb(await dialogo().innerText().catch(() => ''))
  confere(tD.includes('Confirme o valor: R$ 7,60 — referência: mediana das últimas 6 vendas: R$ 7.695'),
    `D: sem preço no catálogo, a mediana das 6 vendas de 90 dias ("${tD.replace(/\s+/g, ' ').slice(0, 140)}")`)
  await dialogo().getByRole('button', { name: 'Corrigir' }).click(); await espera(800)
  confere(vendasDe(prodMed) === '7', 'D: "Corrigir" não grava (só as 7 vendas de teste)')
  await encomendaDe(NOME_POUCAS, '7.6')
  confere(await dialogo().count() === 0, 'D: com 4 vendas não há referência — lança sem perguntar')
  for (let i = 0; i < 40 && vendasDe(prodPoucas) === '4'; i++) await espera(250)
  confere(vendasDe(prodPoucas) === '5', 'D: a encomenda sem referência foi lançada')
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 600))
} finally {
  await browser.close()
  try {
    const vendas = sql(`select coalesce(string_agg(id::text, ','), '') from vendas_vendas where produto_id=${produto}`)
    if (vendas) {
      const pedidos = sql(`select coalesce(string_agg(pedido_compra_id::text, ','), '') from vendas_vendas where id in (${vendas}) and pedido_compra_id is not null`)
      sql(`delete from vendas_pagamentos where venda_id in (${vendas})`)
      sql(`delete from vendas_vendas where id in (${vendas})`)
      if (pedidos) sql(`delete from compras_pedidos where id in (${pedidos})`)
    }
    for (const id of [prodMed, prodPoucas]) {
      const pedidosD = sql(`select coalesce(string_agg(pedido_compra_id::text, ','), '') from vendas_vendas where produto_id=${id} and pedido_compra_id is not null`)
      sql(`delete from vendas_pagamentos where venda_id in (select id from vendas_vendas where produto_id=${id})`)
      sql(`delete from vendas_vendas where produto_id=${id}`)
      if (pedidosD) sql(`delete from compras_pedidos where id in (${pedidosD})`)
      sql(`delete from estoque_produtos where id=${id}`)
    }
    sql(`delete from estoque_unidades where id=${unidade}`)
    sql(`delete from estoque_produtos where id=${produto}`)
    sql(`update usuarios set filial_atual_id=${filialAntes || 'null'} where id='${dono}'`)
    confere(sql(`select count(*) from estoque_produtos where nome in ('${NOME}', '${NOME_MED}', '${NOME_POUCAS}')`) === '0' && vendasDoProduto() === '0'
      && vendasDe(prodMed) === '0' && vendasDe(prodPoucas) === '0', 'limpeza: produtos, peça, vendas e encomendas apagados')
  } catch (e) { falha('limpeza: ' + String(e).slice(0, 300)) }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
