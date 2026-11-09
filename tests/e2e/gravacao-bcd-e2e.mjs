// Item 3, lotes B (catálogo, histórico), C (imóveis/chaves) e D (superadmin) — app e Supabase LOCAIS.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '').split('\n').pop()
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE GB ${T}`
const limpar = []
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const linhaMod = sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='imoveis'),'sem')`)

sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo, config) values (1,'imoveis','addon',true,'{"forcado":true}') on conflict (empresa_id, modulo) do update set ativo=true, config='{"forcado":true}'`)
const ligouEm = Date.now()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha(`pageerror (${email}): ` + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])
  return { page, api }
}
try {
  const { page } = await entrar(E.dono)

  // ── B: catálogo — remover preço da tabela
  const p1 = sql(`insert into estoque_tabela_precos (empresa_id, modelo, preco_sugerido, ativo) values (1, '${MK} A', 1, true) returning id`)
  const p2 = sql(`insert into estoque_tabela_precos (empresa_id, modelo, preco_sugerido, ativo) values (1, '${MK} B', 2, true) returning id`)
  limpar.push(`delete from estoque_tabela_precos where modelo like 'TESTE GB ${T}%'`)
  await page.goto(BASE + '/catalogo', { waitUntil: 'networkidle', timeout: 240000 })
  await page.getByRole('tab', { name: /Tabela/ }).first().click().catch(async () => page.getByText(/Tabela de preços/).first().click())
  await page.waitForTimeout(800)
  const linhaA = page.locator('tr', { hasText: `${MK} A` }).first()
  await linhaA.getByTitle('Remover').click()
  await page.waitForTimeout(1200)
  confere(sql(`select ativo from estoque_tabela_precos where id=${p1}`) === 'f', 'catálogo: remover preço grava (ativo=false)')
  sql(`delete from estoque_tabela_precos where id=${p2}`)
  await page.locator('tr', { hasText: `${MK} B` }).first().getByTitle('Remover').click()
  await page.waitForTimeout(1200)
  confere((await toasts(page)).some((t) => t.includes('Preço não removido')), 'catálogo: preço que sumiu avisa "Preço não removido"')

  // ── B: histórico — transferir venda
  const venda = sql(`select id||'|'||coalesce(vendedor_id::text,'') from vendas_vendas where empresa_id=1 and filial_id=3 order by id desc limit 1`).split('|')
  const outroVend = sql(`select usuario_id from empresa_usuarios where empresa_id=1 and ativo and usuario_id <> '${venda[1] || DONO}' limit 1`)
  if (venda[0] && outroVend) {
    limpar.push(`update vendas_vendas set vendedor_id=${venda[1] ? `'${venda[1]}'` : 'null'} where id=${venda[0]}`)
    await page.goto(BASE + '/historico', { waitUntil: 'networkidle', timeout: 240000 })
    await page.getByTitle('Transferir venda').first().click()
    const dlg = page.getByRole('dialog')
    await dlg.waitFor()
    const opcoes = await dlg.locator('select option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean))
    await dlg.locator('select').first().selectOption(opcoes.find((v) => v !== venda[1]) ?? opcoes[0])
    await dlg.getByRole('button', { name: 'Transferir' }).click()
    await page.waitForTimeout(1500)
    const t = await toasts(page)
    confere(t.some((x) => x.includes('Venda transferida')), `histórico: transferir avisa sucesso (${t.join(' / ')})`)
  } else ok('histórico: sem venda/vendedor no local para transferir — pulado')

  // ── C: imóveis — chave emprestar / devolver / remover e excluir imóvel
  // o proxy guarda os módulos por 60 s
  { const falta = 65000 - (Date.now() - ligouEm); if (falta > 0) await page.waitForTimeout(falta) }
  const COD = 'E2EG-' + T
  const im = sql(`insert into imoveis_imoveis (empresa_id, codigo, titulo, tipo, finalidade, status, bairro, cidade, valor_venda) values (1, '${COD}', '${MK} casa', 'casa', 'venda', 'disponivel', 'Centro', 'Mogi', 500000) returning id`)
  const ch = sql(`insert into imoveis_chaves (empresa_id, imovel_id, codigo, status) values (1, ${im}, 'CH-${T}', 'na_imobiliaria') returning id`)
  limpar.push(`delete from imoveis_chaves where imovel_id=${im}; delete from imoveis_imoveis where id=${im}`)
  await page.goto(BASE + '/imoveis', { waitUntil: 'networkidle', timeout: 240000 })
  await page.waitForTimeout(1500)
  console.log('DEBUG', JSON.stringify(await page.evaluate((mk) => ({ tem: document.body.innerText.includes(mk), botoes: [...new Set([...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')))].slice(0, 15), trecho: document.querySelector('main')?.innerText.slice(0, 300) }), MK)))
  await page.screenshot({ path: `${import.meta.dirname}/saida/imoveis-debug.png` })
  const cartaoDe = (txt) => page.getByText(txt, { exact: true }).first().locator('xpath=ancestor::*[.//button[@aria-label="Editar"]][1]')
  const card = () => cartaoDe(`${MK} casa`)
  await card().getByLabel('Editar').click()
  let dlg = page.getByRole('dialog')
  await dlg.waitFor()
  await dlg.getByRole('button', { name: 'Emprestar' }).click()
  await dlg.getByLabel('Com quem fica').fill('Corretor E2E')
  await dlg.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(1200)
  confere(sql(`select status||'|'||com_quem from imoveis_chaves where id=${ch}`) === 'emprestada|Corretor E2E', 'imóveis: emprestar chave grava')
  await dlg.getByRole('button', { name: /Devolver/ }).click()
  await page.waitForTimeout(1200)
  confere(sql(`select status from imoveis_chaves where id=${ch}`) === 'na_imobiliaria', 'imóveis: devolver chave grava')
  // chave que sumiu entre abrir e emprestar
  sql(`delete from imoveis_chaves where id=${ch}`)
  await dlg.getByRole('button', { name: 'Emprestar' }).click()
  await dlg.getByLabel('Com quem fica').fill('Ninguém')
  await dlg.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(1200)
  confere((await toasts(page)).some((t) => t.includes('Nada foi gravado')), 'imóveis: chave que sumiu avisa "Nada foi gravado" (antes dizia "Empréstimo registrado")')
  const ch2 = sql(`insert into imoveis_chaves (empresa_id, imovel_id, codigo, status) values (1, ${im}, 'CH2-${T}', 'na_imobiliaria') returning id`)
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await card().getByLabel('Editar').click()
  dlg = page.getByRole('dialog'); await dlg.waitFor()
  await dlg.getByLabel('Remover chave').first().click()
  await page.waitForTimeout(1200)
  confere(sql(`select count(*) from imoveis_chaves where id=${ch2}`) === '0', 'imóveis: remover chave apaga')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  await card().getByLabel('Excluir').click()
  await page.getByRole('button', { name: 'Excluir' }).last().click()
  await page.waitForTimeout(1500)
  confere(sql(`select count(*) from imoveis_imoveis where id=${im}`) === '0', 'imóveis: excluir imóvel apaga')
  const im2 = sql(`insert into imoveis_imoveis (empresa_id, codigo, titulo, tipo, finalidade, status, bairro, cidade, valor_venda) values (1, '${COD}b', '${MK} casa2', 'casa', 'venda', 'disponivel', 'Centro', 'Mogi', 1) returning id`)
  limpar.push(`delete from imoveis_imoveis where id=${im2}`)
  await page.reload({ waitUntil: 'networkidle' })
  sql(`delete from imoveis_imoveis where id=${im2}`)
  await cartaoDe(`${MK} casa2`).getByLabel('Excluir').click()
  await page.getByRole('button', { name: 'Excluir' }).last().click()
  await page.waitForTimeout(1500)
  const tx = await toasts(page)
  confere(tx.some((t) => t.includes('Imóvel não excluído')) && !tx.some((t) => t.includes('Imóvel excluído')), `imóveis: imóvel que sumiu avisa (${tx.join(' / ')})`)

  // ── D: superadmin — ação na empresa
  const sa = await entrar(E.superadmin)
  const trial = sql(`select coalesce(trial_ends_at::text,'null') from empresas where id=1`)
  limpar.push(`update empresas set trial_ends_at=${trial === 'null' ? 'null' : `'${trial}'`} where id=1`)
  const r1 = await sa.api('/api/superadmin/empresas/1', 'POST', { tipo: 'estender_trial', dias: 1 })
  confere(r1.status === 200, `superadmin: estender trial da empresa 1 (${r1.status} ${r1.json?.error ?? ''})`)
  const r0 = await sa.api('/api/superadmin/empresas/999999', 'POST', { tipo: 'alterar_status', status: 'ativo' })
  confere(r0.status === 404, `superadmin: empresa que não existe = 404 (era 200 e ia para o log) (${r0.status})`)

  // KDS: módulo em preparação, a tela tem de seguir abrindo/fechando como antes
  const k = await page.goto(BASE + '/kds', { waitUntil: 'networkidle', timeout: 240000 }).catch(() => null)
  ok(`/kds responde ${k?.status()} (módulo em preparação; sem e2e de clique)`)
} catch (e) {
  falha('exceção: ' + String(e?.message ?? e).slice(0, 400))
} finally {
  await browser.close()
  for (const q of limpar) { try { sql(q) } catch (e) { console.log('limpeza falhou:', q.slice(0, 60)) } }
  if (linhaMod === 'sem') sql(`delete from empresa_modulos where empresa_id=1 and modulo='imoveis'`)
  else sql(`update empresa_modulos set ativo=${linhaMod} where empresa_id=1 and modulo='imoveis'`)
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
