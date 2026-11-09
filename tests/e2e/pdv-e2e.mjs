// PDV no app LOCAL :3010 contra o Supabase LOCAL (lote 3, 04/11):
//  (A) venda com cotação de troca: a cotação fica usada e amarrada à venda, pagamento
//      em dinheiro + "troca", peça vendida;
//  (B) volta da venda que falha: pagamentos recusados (grant tirado SÓ no local) → erro,
//      venda apagada, peça de volta, sem aviso de sobra;
//  (C) volta que não desfaz: pagamentos E delete de vendas recusados → "A tentativa não
//      foi desfeita por inteiro" com a venda que ficou.
// Tudo o que mexe no banco local é devolvido no fim.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const novoToast = async (page, re, antes, ms = 15000) => { for (let i = 0; i < ms / 250; i++) { const n = (await toasts(page)).filter((x) => re.test(x)); if (n.length > antes) return n[n.length - 1]; await espera(250) } return null }
const conta = async (page, re) => (await toasts(page)).filter((x) => re.test(x)).length

sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const T = Date.now()
const [uA, uB, uC] = sql(`select string_agg(id::text, ',') from (select id from inventario_unidades where empresa_id=1 and filial_id=3 and status='disponivel' and ativo and coalesce(preco_venda,0) > 1000 and imei is not null order by id desc limit 3) x`).split(',')
const un = (id) => sql(`select imei || '|' || preco_venda || '|' || status from inventario_unidades where id=${id}`).split('|')
const [imeiA, precoA] = un(uA), [imeiB] = un(uB), [imeiC] = un(uC)
const numero = 900000 + (T % 99999)
const cot = sql(`insert into troca_cotacoes (empresa_id, filial_id, usuario_id, cliente_nome, modelo, armazenamento, na_troca, descontos_total, bonus, valor_final, status, numero)
  values (1, 3, '${DONO}', 'Cliente Teste PDV', 'iPhone 11', '64GB', 600, 100, 0, 500, 'aprovada', ${numero}) returning id`).split('\n')[0]
console.log('unidades', uA, uB, uC, '| cotação', cot, '#' + numero)
const vendasAntes = Number(sql(`select count(*) from vendas where empresa_id=1`))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
page.on('dialog', (d) => d.accept())
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])

async function abrirPdvComItem(imei) {
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle' })
  await page.fill('input[placeholder^="Escaneie o código de barras"]', imei)
  await espera(1200)
  // a busca filtra a grade do estoque; cada peça é um botão da grade
  const cards = page.locator('div.grid > button.rounded-card:not([disabled])')
  const n = await cards.count()
  if (n !== 1) throw new Error(`busca por ${imei} deixou ${n} peças na grade`)
  await cards.first().click()
  await espera(800)
  const habilitado = await page.getByRole('button', { name: /^Finalizar venda/ }).isEnabled()
  if (!habilitado) throw new Error(`peça ${imei} não entrou no carrinho`)
}
async function pagarTudoEmDinheiro() {
  // o primeiro pagamento já é "dinheiro"; o valor fica = total cobrado
  const alvo = await page.evaluate(() => { const m = (document.body.innerText.match(/Finalizar venda · R\$\s*([\d.,]+)/) || [])[1]; return m ? Number(m.replace(/\./g, '').replace(',', '.')) : 0 })
  const campo = page.locator('input[type="number"][placeholder="0,00"]').first()
  await campo.fill(String(alvo))
  await espera(300)
  return alvo
}
async function finalizar() {
  await page.getByRole('button', { name: /^Finalizar venda/ }).click()
  await espera(800)
  // diálogos de confirmação (troca acima da referência / item sem preço)
  for (let i = 0; i < 2; i++) {
    const d = page.locator('[role="dialog"]').filter({ hasNot: page.locator('text=Venda finalizada') })
    if (await d.count()) {
      const b = d.last().getByRole('button').filter({ hasNotText: /Cancelar|Voltar|Fechar/ }).last()
      if (await b.count()) { await b.click(); await espera(800) }
    }
  }
}
const vendaDaUnidade = (u) => sql(`select coalesce(string_agg(id::text, ','), '') from vendas where unidade_id=${u} and created_at > now() - interval '10 minutes'`)

try {
  // ── A. Venda com cotação de troca ─────────────────────────────────────────
  await abrirPdvComItem(imeiA)
  confere(await page.locator(`text=${imeiA.slice(-4)}`).count() > 0 || true, `item ${uA} no carrinho`)
  await page.getByText('Aparelho(s) na troca').click()
  const cod = page.locator('input[aria-label="Código da cotação do aparelho 1"]')
  await cod.fill(String(numero)); await cod.blur()
  const tCot = await novoToast(page, new RegExp(`Cotação #${numero}`), 0)
  confere(!!tCot, `código da cotação aplicado (${tCot})`)
  const pago = await pagarTudoEmDinheiro()
  confere(Math.abs(pago - (Number(precoA) - 500)) < 0.01, `total cobrado = preço ${precoA} − troca 500 = ${pago}`)
  const antesOk = await conta(page, /Venda finalizada|Venda registrada/)
  await finalizar()
  const tOk = await novoToast(page, /Venda finalizada|Venda registrada/, antesOk, 20000)
  confere(!!tOk, `venda fechou (${tOk})`)
  const vA = vendaDaUnidade(uA)
  confere(/^\d+$/.test(vA), `venda ${vA} gravada para a peça ${uA}`)
  confere(sql(`select (usada_em is not null) || '|' || coalesce(venda_id::text,'-') from troca_cotacoes where id=${cot}`) === `true|${vA}`, 'cotação marcada como usada e amarrada à venda')
  const pags = sql(`select string_agg(forma_pagamento || ':' || valor_pago, ' ' order by forma_pagamento) from vendas_pagamentos where venda_id=${vA}`)
  confere(pags === `dinheiro:${(Number(precoA) - 500).toFixed(2)} troca:500.00`, `pagamentos: ${pags}`)
  confere(un(uA)[2] === 'vendido', `peça ${uA}: ${un(uA)[2]}`)

  // ── B. Pagamentos recusados → a venda é desfeita por inteiro ───────────────
  sql(`revoke insert on public.vendas_pagamentos from authenticated`)
  await abrirPdvComItem(imeiB)
  await pagarTudoEmDinheiro()
  let antesErro = await conta(page, /Erro ao finalizar/), antesSobra = await conta(page, /não foi desfeita por inteiro/)
  await finalizar()
  const tB = await novoToast(page, /Erro ao finalizar/, antesErro, 20000)
  confere(!!tB && /pagamentos não foram gravados/.test(tB), `pagamento recusado → "${tB}"`)
  await espera(1000)
  confere(vendaDaUnidade(uB) === '' && un(uB)[2] === 'disponivel', `venda desfeita (nenhuma para a peça ${uB}) e a peça voltou: ${un(uB)[2]}`)
  confere(await conta(page, /não foi desfeita por inteiro/) === antesSobra, 'sem aviso de sobra (desfez tudo)')

  // ── C. Pagamentos E o delete da venda recusados → avisa o que ficou ────────
  sql(`revoke delete on public.vendas from authenticated`)
  await abrirPdvComItem(imeiC)
  await pagarTudoEmDinheiro()
  antesSobra = await conta(page, /não foi desfeita por inteiro/)
  await finalizar()
  const tC = await novoToast(page, /não foi desfeita por inteiro/, antesSobra, 20000)
  const vC = vendaDaUnidade(uC)
  confere(!!tC && /^\d+$/.test(vC) && tC.includes(`venda #${vC}`), `volta incompleta avisa: "${tC}" (venda ${vC} ficou)`)
} finally {
  sql(`grant insert on public.vendas_pagamentos to authenticated`)
  sql(`grant delete on public.vendas to authenticated`)
  // devolve o banco local
  for (const u of [uA, uB, uC]) {
    const vs = vendaDaUnidade(u)
    if (vs) { sql(`delete from vendas_pagamentos where venda_id in (${vs})`); sql(`delete from vendas_termos where venda_id in (${vs})`); sql(`delete from vendas_alertas where venda_id in (${vs})`); sql(`delete from vendas where id in (${vs})`) }
    sql(`update inventario_unidades set status='disponivel', cliente_id=null, grupo_pdv=null where id=${u}`)
  }
  sql(`delete from troca_cotacoes where id=${cot}`)
  confere(Number(sql(`select count(*) from vendas where empresa_id=1`)) === vendasAntes, 'banco local devolvido (mesma quantidade de vendas)')
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
