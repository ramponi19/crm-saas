// HOTFIX 19/11/2026 (fix/entregar-sem-pagamento): nenhuma venda conclui com dinheiro faltando.
// Na JM local (empresa 1, Mogi = filial 3), com o dono:
//   (A) Histórico → "Finalizar" de uma encomenda de R$ 1.000 com sinal de R$ 300: abre o recebimento
//       (o mesmo da aba Encomenda) com total, já pago e saldo; "Receber e entregar" grava R$ 700 e conclui
//       pela RPC (concluida_via = historico, concluida_por = dono). Antes concluía sem receber nada.
//   (B) PDV balcão: peça de R$ 500 com a forma de pagamento em R$ 200 → "Falta R$ 300" e o botão travado;
//       com R$ 500 fecha, e a venda conclui pela RPC (concluida_via = pdv) com o pagamento gravado.
// Precisa da migração 20261119000100 no banco local.
// Rodar: node tests/e2e/entregar-pagamento-e2e.mjs (app LOCAL :3010, Supabase LOCAL). Tudo o que cria é apagado.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=' + (process.env.DB_PORT ?? '54322') + ' dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const nb = (s) => (s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ')

const T = Date.now()
const NOME = `Produto Entregar e2e ${T}`
const IMEI = `35${String(T).slice(-13)}`
const dono = sql(`select id from usuarios where email='${E.dono}'`)
const filialAntes = sql(`select coalesce(filial_atual_id::text, '') from usuarios where id='${dono}'`)
sql(`update usuarios set filial_atual_id=3 where id='${dono}'`)
const cliente = sql(`select id from contatos where empresa_id=1 and ativo and nome is not null order by id limit 1`)
const produto = sql(`insert into estoque_produtos (empresa_id, nome, preco, ativo) values (1, '${NOME}', 500, true) returning id`)
// A: encomenda já lançada (como o PDV lança), com sinal de R$ 300 na primeira linha do grupo.
const encomenda = sql(`insert into vendas_vendas (empresa_id, filial_id, cliente_id, produto_id, valor_venda, status, canal_venda, grupo_pdv, data_venda, vendedor_id)
  values (1, 3, ${cliente}, ${produto}, 1000, 'encomenda', 'encomenda', gen_random_uuid(), now() - interval '2 days', '${dono}') returning id`)
sql(`insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, 3, ${encomenda}, 'pix', 300)`)
// B: peça no balcão.
const unidade = sql(`insert into estoque_unidades (empresa_id, filial_id, produto_id, imei, preco_venda, preco_custo, status, ativo, quantidade)
  values (1, 3, ${produto}, '${IMEI}', 500, 100, 'disponivel', true, 1) returning id`)
console.log('produto', produto, '| encomenda', encomenda, '| unidade', unidade)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
try {
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])

  // ── A. Histórico ────────────────────────────────────────────────────────────
  await page.goto(BASE + '/historico', { waitUntil: 'networkidle', timeout: 300000 })
  const linha = page.locator('tr').filter({ hasText: NOME }).first()
  confere(await linha.count() === 1, 'A: a encomenda aparece no Histórico')
  await linha.getByRole('button', { name: 'Finalizar' }).click()
  const modal = page.locator('[role="dialog"]').filter({ hasText: 'Entregar' })
  await modal.getByText('Receber na entrega').waitFor({ timeout: 30000 }).catch(() => {})
  const tA = nb(await modal.innerText().catch(() => ''))
  confere(tA.includes('Total R$ 1.000,00') && tA.includes('já pago R$ 300,00') && tA.includes('saldo R$ 700,00'),
    `A: o recebimento mostra total, já pago e saldo ("${tA.slice(0, 160)}")`)
  confere(sql(`select status from vendas_vendas where id=${encomenda}`) === 'encomenda', 'A: abrir o "Finalizar" não conclui nada sozinho')
  await modal.getByRole('button', { name: 'PIX' }).click()
  await modal.getByRole('button', { name: /Receber e entregar/ }).click()
  for (let i = 0; i < 40 && sql(`select status from vendas_vendas where id=${encomenda}`) !== 'concluida'; i++) await espera(250)
  const vA = sql(`select status || '|' || coalesce(concluida_via, '-') || '|' || coalesce(concluida_por::text, '-') from vendas_vendas where id=${encomenda}`)
  confere(vA === `concluida|historico|${dono}`, `A: concluída pela RPC, com via e quem (${vA})`)
  const pA = sql(`select count(*) || '|' || sum(valor_pago) from vendas_pagamentos where venda_id=${encomenda}`)
  confere(pA === '2|1000.00', `A: sinal R$ 300 + R$ 700 recebido = R$ 1.000 em pagamentos (${pA})`)

  // ── B. PDV balcão ───────────────────────────────────────────────────────────
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle', timeout: 300000 })
  await page.fill('input[placeholder^="Escaneie o código de barras"]', IMEI); await espera(1200)
  await page.locator('div.grid > button.rounded-card:not([disabled])').first().click(); await espera(800)
  const valor = page.locator('input[placeholder="0,00"]').first()
  await valor.fill('200'); await espera(600)
  const botao = page.getByRole('button', { name: /^Finalizar venda/ })
  const corpo = nb(await page.locator('body').innerText())
  confere(corpo.includes('Falta R$ 300,00'), 'B: com R$ 200 de R$ 500 a tela mostra "Falta R$ 300,00"')
  confere(await botao.isDisabled(), 'B: e o "Finalizar venda" fica travado')
  confere(sql(`select count(*) from vendas_vendas where unidade_id=${unidade}`) === '0', 'B: nada gravado com a falta')
  await valor.fill('500'); await espera(600)
  confere(!(await botao.isDisabled()), 'B: com o total coberto o botão libera')
  await botao.click()
  for (let i = 0; i < 40 && sql(`select count(*) from vendas_vendas where unidade_id=${unidade} and status='concluida'`) === '0'; i++) await espera(250)
  const vB = sql(`select status || '|' || coalesce(concluida_via, '-') || '|' || (select coalesce(sum(valor_pago), 0) from vendas_pagamentos p where p.venda_id = v.id) from vendas_vendas v where unidade_id=${unidade}`)
  confere(vB === 'concluida|pdv|500.00', `B: venda concluída pela RPC com o pagamento gravado (${vB})`)
  confere(sql(`select status from estoque_unidades where id=${unidade}`) === 'vendido', 'B: a peça saiu do estoque')
  confere(sql(`select count(*) from vendas_vendas where empresa_id=1 and status='em_fechamento' and usuario_id='${dono}'`) === '0', 'B: nenhuma venda presa "em fechamento"')
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 600))
} finally {
  await browser.close()
  try {
    const vendas = sql(`select coalesce(string_agg(id::text, ','), '') from vendas_vendas where produto_id=${produto} or unidade_id=${unidade} or id=${encomenda}`)
    if (vendas) {
      sql(`delete from vendas_pagamentos where venda_id in (${vendas})`)
      sql(`delete from vendas_termos where venda_id in (${vendas})`)
      sql(`delete from vendas_vendas where id in (${vendas})`)
    }
    sql(`delete from estoque_unidades where id=${unidade}`)
    sql(`delete from estoque_produtos where id=${produto}`)
    sql(`update usuarios set filial_atual_id=${filialAntes || 'null'} where id='${dono}'`)
    confere(sql(`select count(*) from estoque_produtos where nome='${NOME}'`) === '0'
      && sql(`select count(*) from vendas_vendas where id=${encomenda} or unidade_id=${unidade}`) === '0', 'limpeza: produto, peça, vendas e pagamentos apagados')
  } catch (e) { falha('limpeza: ' + String(e).slice(0, 300)) }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
