// Views lote 4 (estoque) — app LOCAL :3010, Supabase LOCAL, as 7 views já derrubadas.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE VIEWS4 ${T}`
const env = Object.fromEntries(readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const VIEWS = ['produtos', 'categorias_produtos', 'marcas_produtos', 'fornecedores', 'inventario_unidades', 'tabela_precos', 'avaliacoes_usados']
confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${VIEWS.map((v) => `'${v}'`).join(',')})`) === '0', 'as 7 views não existem no local')
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const prod = sql(`select p.id||'|'||p.nome from estoque_produtos p join estoque_unidades u on u.produto_id=p.id where p.empresa_id=1 and p.ativo and u.ativo and u.filial_id=3 limit 1`).split('|')
const categ = sql(`select id||'|'||nome from estoque_categorias where empresa_id=1 and ativo limit 1`).split('|')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])
let precoId = null
try {
  for (const rota of ['/estoque', '/catalogo', '/pdv', '/historico', '/compras', '/assistencia', '/garantia', '/orcamentos', '/leads', '/estoque/imei']) {
    const g = await page.goto(BASE + rota, { waitUntil: 'networkidle' })
    confere(g.status() === 200, `${rota} 200`)
  }
  await page.goto(BASE + '/estoque', { waitUntil: 'networkidle' })
  confere((await page.locator('body').innerText()).includes(prod[1]), `estoque lista a unidade com o produto pelo embed ("${prod[1]}")`)
  await page.goto(BASE + '/pdv', { waitUntil: 'networkidle' })
  confere((await page.content()).includes(prod[1]), 'PDV recebe as unidades com o nome do produto')
  // produto: editar e 0 linhas
  await page.goto(BASE + '/catalogo', { waitUntil: 'networkidle' })
  const nomeOrig = prod[1]
  await page.locator('tr', { hasText: nomeOrig }).first().click()
  await page.getByRole('dialog').waitFor({ timeout: 10000 })
  const campoNome = page.getByRole('dialog').getByLabel(/^Nome/).first()
  if (await campoNome.count()) {
    await campoNome.fill(nomeOrig + ' X')
    await page.getByRole('dialog').getByRole('button', { name: /Salvar/ }).click(); await espera(1500)
    confere(sql(`select nome from estoque_produtos where id=${prod[0]}`) === nomeOrig + ' X', 'editar produto grava em estoque_produtos')
    sql(`update estoque_produtos set nome='${nomeOrig.replace(/'/g, "''")}' where id=${prod[0]}`)
  } else falha('campo Nome do produto não encontrado')
  // categoria: editar com a linha fora da vista (outra empresa) avisa
  await page.goto(BASE + '/catalogo', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Categorias/ }).click(); await espera(500)
  await page.locator('button', { hasText: categ[1].replace(/^[^A-Za-zÀ-ú0-9]+/, '').trim() }).first().click()
  await page.getByRole('dialog').waitFor({ timeout: 10000 })
  sql(`update estoque_categorias set empresa_id=5 where id=${categ[0]}`)
  await page.getByRole('dialog').getByRole('button', { name: /Salvar/ }).click(); await espera(1500)
  const t1 = await toasts(page)
  confere(t1.some((x) => /Nada foi gravado/.test(x)), `salvar categoria fora da vista avisa (${JSON.stringify(t1).slice(0, 90)})`)
  sql(`update estoque_categorias set empresa_id=1 where id=${categ[0]}`)
  // tabela de preços: criar pela tela
  await page.goto(BASE + '/catalogo', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Tabela/ }).click(); await espera(500)
  const novoPreco = page.getByRole('button', { name: /Novo preço|Adicionar preço|Novo/ }).first()
  if (await novoPreco.count()) {
    await novoPreco.click(); await page.getByRole('dialog').waitFor({ timeout: 10000 })
    await page.getByRole('dialog').getByLabel(/Modelo/).first().fill(MK)
    const pr = page.getByRole('dialog').getByLabel(/Preço/).first(); if (await pr.count()) await pr.fill('123')
    await page.getByRole('dialog').getByRole('button', { name: /Salvar|Adicionar/ }).last().click(); await espera(1500)
    precoId = sql(`select id from estoque_tabela_precos where modelo='${MK}'`)
    confere(!!precoId, 'criar preço sugerido grava em estoque_tabela_precos')
  } else falha('botão de novo preço não encontrado')
  // avaliações: API com 0 linhas
  let r = await api('/api/avaliacoes', 'PATCH', { id: 999999999, status: 'recusado' })
  confere(r.status === 404 || r.status === 403, `PATCH avaliação inexistente = ${r.status}`)
  r = await api('/api/avaliacoes', 'DELETE', { id: 999999999 })
  confere(r.status === 404 || r.status === 403, `DELETE avaliação inexistente = ${r.status}`)
  // transferência ainda funciona (lê estoque_unidades)
  const u = sql(`select id from estoque_unidades where empresa_id=1 and filial_id=3 and ativo and status='disponivel' order by id desc limit 1`)
  const f = sql(`select row_to_json(x)::text from (select filial_id, status, recebido_em, recebido_por from estoque_unidades where id=${u}) x`)
  const mov0 = sql(`select coalesce(max(id),0) from estoque_movimentacoes`)
  r = await api('/api/estoque/transferir', 'POST', { ids: [Number(u)], filialDestino: 6, observacoes: MK })
  confere(r.status === 200, `transferir com Mogi escolhida (${r.status})`)
  const s = JSON.parse(f); sql(`update estoque_unidades set filial_id=${s.filial_id}, status='${s.status}', recebido_em=${s.recebido_em ? `'${s.recebido_em}'` : 'null'}, recebido_por=${s.recebido_por ? `'${s.recebido_por}'` : 'null'} where id=${u}`)
  sql(`delete from estoque_movimentacoes where id>${mov0}`)
  // REST: os selects de embed do PDV, estoque e match com o JWT do dono
  const tok = await (await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: E.dono, password: SENHA }) })).json()
  for (const q of [
    'estoque_unidades?select=id,produtos:estoque_produtos!produto_id(nome,garantia_dias,foto_url,marcas_produtos:estoque_marcas!marca_id(nome),categorias_produtos:estoque_categorias!categoria_id(tipo_formulario))&limit=2',
    'estoque_unidades?select=*,produtos:estoque_produtos!produto_id(nome,foto_url,marcas_produtos:estoque_marcas!marca_id(nome)),fornecedores:estoque_fornecedores!fornecedor_id(nome_fantasia)&limit=2',
    'vendas?select=id,clientes!cliente_id(nome),produtos:estoque_produtos!produto_id(nome)&limit=2',
    'vendas_pedidos_compra?select=*,fornecedores:estoque_fornecedores(nome_fantasia,contato,telefone)&limit=2',
    'assistencia_garantias?select=*,clientes(nome,telefone),produtos:estoque_produtos(nome)&limit=2',
  ]) {
    const rr = await fetch(`${env.API_URL}/rest/v1/${q}`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${tok.access_token}` } })
    confere(rr.status === 200, `REST ${q.slice(0, 70)}… ${rr.status} ${rr.status !== 200 ? (await rr.text()).slice(0, 120) : ''}`)
  }
} finally {
  sql(`update estoque_categorias set empresa_id=1 where id=${categ[0]}`)
  sql(`update estoque_produtos set nome='${prod[1].replace(/'/g, "''")}' where id=${prod[0]}`)
  sql(`delete from estoque_tabela_precos where modelo='${MK}'`)
  sql(`delete from estoque_movimentacoes where observacoes like '%${MK}%'`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
