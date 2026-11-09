// Lote 2 (fix/linhas-lote-2) — encomendas abertas no app LOCAL :3010 contra o Supabase LOCAL.
// Caminho normal continua (Pedido feito, Ajustar) e os casos de 0 linhas avisam.
// Tudo o que mexe no banco é devolvido no fim.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
// Clientes das duas encomendas do cenário, lidos do banco local (nada de nome real no código).
const nomeDoPedido = (p) => sql(`select c.nome from vendas v join contatos c on c.id = v.cliente_id where v.pedido_compra_id = ${p} order by v.id limit 1`)
const CLI_A = nomeDoPedido(3), CLI_B = nomeDoPedido(10)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const novoToast = async (page, re, antes) => { for (let i = 0; i < 20; i++) { const t = await toasts(page); const n = t.filter((x) => re.test(x)); if (n.length > antes) return n[n.length - 1]; await espera(250) } return null }
const conta = async (page, re) => (await toasts(page)).filter((x) => re.test(x)).length

// Estado original (para devolver)
const orig = {
  v31: sql(`select valor_venda || '|' || valor_custo || '|' || coalesce(previsao_entrega::text,'') || '|' || filial_id from vendas where id=31`),
  v43: sql(`select valor_venda || '|' || valor_custo || '|' || coalesce(previsao_entrega::text,'') || '|' || filial_id from vendas where id=43`),
  p3: sql(`select coalesce(solicitado_em::text,'') || '|' || coalesce(solicitado_por::text,'') || '|' || valor_total from pedidos_compra where id=3`),
  p10: sql(`select coalesce(solicitado_em::text,'') || '|' || coalesce(solicitado_por::text,'') || '|' || valor_total from pedidos_compra where id=10`),
}
console.log('original', orig)
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
async function abrirEncomendas() {
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Encomenda/ }).first().click()
  await page.waitForSelector(`text=${CLI_A}`, { timeout: 20000 })
  await espera(500)
}
const cartao = (cliente) => page.locator('div.rounded-card', { hasText: cliente }).last()

try {
  // ── 1. Pedido feito: caminho normal ───────────────────────────────────────
  await abrirEncomendas()
  let antes = await conta(page, /Pedido registrado/)
  await cartao(CLI_A).getByRole('button', { name: 'Pedido feito' }).click()
  confere(!!(await novoToast(page, /Pedido registrado/, antes)), 'Pedido feito (normal): "Pedido registrado"')
  confere(sql(`select solicitado_em is not null from pedidos_compra where id=3`) === 't', 'pedido 3 marcado no banco')

  // ── 2. Pedido feito: alguém já marcou por trás → avisa, não diz "registrado" ──
  await abrirEncomendas()
  sql(`update pedidos_compra set solicitado_em = '2026-01-02T10:00:00Z' where id=10`)
  antes = await conta(page, /já estava marcada/)
  const antesReg = await conta(page, /Pedido registrado/)
  await cartao(CLI_B).getByRole('button', { name: 'Pedido feito' }).click()
  confere(!!(await novoToast(page, /já estava marcada/, antes)), 'Pedido feito já marcado por trás: avisa "já estava marcada"')
  confere(await conta(page, /Pedido registrado/) === antesReg, 'e não diz "Pedido registrado"')
  confere(sql(`select solicitado_em from pedidos_compra where id=10`).startsWith('2026-01-02'), 'a data do primeiro pedido foi mantida')

  // ── 3. Ajustar valores: caminho normal ────────────────────────────────────
  await abrirEncomendas()
  await cartao(CLI_A).locator('button[title="Ajustar valores e prazo"]').click()
  await cartao(CLI_A).getByLabel('Venda (R$)').fill('5299')
  await cartao(CLI_A).getByLabel('Custo (R$)').fill('4100')
  antes = await conta(page, /Encomenda atualizada/)
  await cartao(CLI_A).getByRole('button', { name: 'Salvar' }).click()
  confere(!!(await novoToast(page, /Encomenda atualizada/, antes)), 'Ajustar (normal): "Encomenda atualizada"')
  confere(sql(`select valor_venda || '|' || valor_custo from vendas where id=31`) === '5299.00|4100.00', 'venda 31 gravada (5299 / 4100)')
  confere(sql(`select valor_total from pedidos_compra where id=3`) === '4100.00', 'custo foi para o pedido 3')

  // ── 4. Ajustar com a venda fora da vista (outra loja) → erro, nada gravado ──
  await abrirEncomendas()
  await cartao(CLI_B).locator('button[title="Ajustar valores e prazo"]').click()
  sql(`update vendas set filial_id = 6 where id=43`)
  await cartao(CLI_B).getByLabel('Venda (R$)').fill('5999')
  antes = await conta(page, /Não deu para salvar/)
  await cartao(CLI_B).getByRole('button', { name: 'Salvar' }).click()
  const t4 = await novoToast(page, /Não deu para salvar/, antes)
  confere(!!t4 && /Nada foi gravado/.test(t4), `Ajustar venda fora da vista: "${t4}"`)
  confere(sql(`select valor_venda from vendas where id=43`) === orig.v43.split('|')[0], 'venda 43 não mudou')
} finally {
  // Devolve tudo
  const [vv31, vc31, vp31, vf31] = orig.v31.split('|'), [vv43, vc43, vp43, vf43] = orig.v43.split('|')
  sql(`update vendas set valor_venda=${vv31}, valor_custo=${vc31}, previsao_entrega=${vp31 ? `'${vp31}'` : 'null'}, filial_id=${vf31} where id=31`)
  sql(`update vendas set valor_venda=${vv43}, valor_custo=${vc43}, previsao_entrega=${vp43 ? `'${vp43}'` : 'null'}, filial_id=${vf43} where id=43`)
  for (const [id, o] of [[3, orig.p3], [10, orig.p10]]) {
    const [se, sp, vt] = o.split('|')
    sql(`update pedidos_compra set solicitado_em=${se ? `'${se}'` : 'null'}, solicitado_por=${sp ? `'${sp}'` : 'null'}, valor_total=${vt} where id=${id}`)
  }
  const depois = {
    v31: sql(`select valor_venda || '|' || valor_custo || '|' || coalesce(previsao_entrega::text,'') || '|' || filial_id from vendas where id=31`),
    v43: sql(`select valor_venda || '|' || valor_custo || '|' || coalesce(previsao_entrega::text,'') || '|' || filial_id from vendas where id=43`),
    p3: sql(`select coalesce(solicitado_em::text,'') || '|' || coalesce(solicitado_por::text,'') || '|' || valor_total from pedidos_compra where id=3`),
    p10: sql(`select coalesce(solicitado_em::text,'') || '|' || coalesce(solicitado_por::text,'') || '|' || valor_total from pedidos_compra where id=10`),
  }
  confere(JSON.stringify(depois) === JSON.stringify(orig), 'estado original devolvido')
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
