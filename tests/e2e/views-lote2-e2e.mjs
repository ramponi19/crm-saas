// Views lote 2 (financeiro + troca) — app LOCAL :3010 contra o Supabase LOCAL, com as 7 views JÁ derrubadas no local.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MOD = `TESTE VIEWS ${T}`
const env = Object.fromEntries(readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))

const VIEWS = ['cobrancas', 'lancamentos_financeiros', 'taxas_pagamento', 'tenant_payment_config', 'troca_cotacoes', 'troca_precos', 'troca_regras']
confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${VIEWS.map((v) => `'${v}'`).join(',')})`) === '0', 'as 7 views não existem no local')
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const lanc = sql(`insert into financeiro_lancamentos (empresa_id, filial_id, tipo, descricao, valor, data_venc, status) values (1, 3, 'despesa', 'LANC ${MOD}', 12.34, current_date, 'pendente') returning id`).split('\n')[0]
const cob = sql(`insert into financeiro_cobrancas (empresa_id, filial_id, provider, tipo, valor, status, descricao) values (1, 3, 'asaas', 'pix', 56.78, 'pendente', 'COB ${MOD}') returning id`).split('\n')[0]
console.log('lançamento', lanc, 'cobrança', cob)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [url, method, body])
let cotId = null
try {
  // --- troca ---
  let r = await api('/api/troca/precos', 'POST', { modelo: MOD, armazenamento: '128GB', na_troca: 1000 })
  confere(r.status === 200, `matriz: cria preço (${r.status} ${JSON.stringify(r.json).slice(0, 80)})`)
  r = await api('/api/troca/precos', 'POST', { modelo: MOD, armazenamento: '128GB', na_troca: 1100 })
  confere(r.status === 200 && sql(`select na_troca from avaliacao_precos where modelo='${MOD}'`) === '1100.00' || sql(`select na_troca from avaliacao_precos where modelo='${MOD}'`) === '1100', `matriz: atualiza preço (${sql(`select na_troca from avaliacao_precos where modelo='${MOD}'`)})`)
  const maxNum = Number(sql(`select coalesce(max(numero),0) from avaliacao_cotacoes where empresa_id=1`))
  r = await api('/api/troca/cotacoes', 'POST', { modelo: MOD, armazenamento: '128GB', cliente_nome: `CLI ${MOD}` })
  cotId = r.json?.id
  confere(r.status === 200 && r.json?.numero === maxNum + 1, `cotação criada com número do gatilho (${r.json?.numero} = ${maxNum + 1})`)
  for (const rota of ['/orcamentos', '/orcamentos/cotacao', '/orcamentos/precos', '/orcamentos/checklist', '/pdv', '/configuracoes/taxas', '/relatorios', '/financeiro']) {
    const g = await page.goto(BASE + rota, { waitUntil: 'networkidle' })
    confere(g.status() === 200, `${rota} 200`)
  }
  await page.goto(BASE + '/orcamentos/precos', { waitUntil: 'networkidle' })
  confere((await page.content()).includes(MOD), 'a matriz recebeu do servidor a linha de teste (avaliacao_precos; a tela só desenha os modelos do catálogo)')
  r = await api(`/api/troca/cotacoes?id=${cotId}`, 'DELETE')
  confere(r.status === 200 && sql(`select count(*) from avaliacao_cotacoes where id=${cotId}`) === '0', `apagar cotação (${r.status})`)
  r = await api(`/api/troca/cotacoes?id=${cotId}`, 'DELETE')
  confere(r.status === 404 && /Nada foi gravado/.test(r.json?.error ?? ''), `apagar de novo = 404 Nada foi gravado (${r.status})`)
  r = await api('/api/orcamentos?id=999999999', 'DELETE')
  confere(r.status === 404, `apagar orçamento inexistente = 404 (${r.status})`)
  r = await api('/api/taxas')
  confere(r.status === 200, `/api/taxas 200 (${JSON.stringify(r.json).slice(0, 60)})`)

  // embed do painel de orçamento do card, com o JWT do dono no PostgREST local
  const tok = await (await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: E.dono, password: SENHA }) })).json()
  const rr = await fetch(`${env.API_URL}/rest/v1/orcamentos?select=id,tipo,status,total,token,valor_devolver,troca_cotacoes:avaliacao_cotacoes!orcamentos_troca_cotacao_id_fkey(numero)&limit=3`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${tok.access_token}` } })
  confere(rr.status === 200, `embed troca_cotacoes:avaliacao_cotacoes no orçamento (${rr.status} ${(await rr.text()).slice(0, 80)})`)

  // --- financeiro ---
  await page.goto(BASE + '/financeiro', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /A pagar/i }).click().catch(() => {})
  await espera(600)
  let linha = page.locator('tr', { hasText: `LANC ${MOD}` }).first()
  confere(await linha.count() > 0, 'financeiro lista o lançamento (financeiro_lancamentos)')
  await linha.click()
  await page.getByRole('dialog').waitFor({ timeout: 10000 })
  await page.getByRole('dialog').getByLabel(/Descrição/).fill(`LANC2 ${MOD}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await espera(1200)
  confere(sql(`select descricao from financeiro_lancamentos where id=${lanc}`) === `LANC2 ${MOD}`, 'editar lançamento grava')
  // fora da vista: muda de loja por trás e tenta salvar
  linha = page.locator('tr', { hasText: `LANC2 ${MOD}` }).first()
  await linha.click(); await page.getByRole('dialog').waitFor({ timeout: 10000 })
  await page.getByRole('dialog').getByLabel(/Descrição/).fill(`LANC3 ${MOD}`)
  sql(`update financeiro_lancamentos set filial_id=6 where id=${lanc}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await espera(1200)
  const txtModal = (await page.getByRole('dialog').count()) ? await page.getByRole('dialog').innerText() : ''
  confere(/Nada foi gravado/.test(txtModal) && sql(`select descricao from financeiro_lancamentos where id=${lanc}`) === `LANC2 ${MOD}`, 'editar fora da vista avisa e não grava')
  sql(`update financeiro_lancamentos set filial_id=3 where id=${lanc}`)
  await page.goto(BASE + '/financeiro', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /A pagar/i }).click().catch(() => {})
  await espera(600)
  await page.locator('tr', { hasText: `LANC2 ${MOD}` }).first().click(); await page.getByRole('dialog').waitFor({ timeout: 10000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click()
  await espera(1200)
  confere(sql(`select count(*) from financeiro_lancamentos where id=${lanc}`) === '0', 'remover lançamento apaga')
  // cobrança
  await page.getByRole('tab', { name: /Cobranças/ }).click()
  await espera(600)
  confere(await page.locator('tr', { hasText: `COB ${MOD}` }).count() > 0, 'aba Cobranças lista a cobrança (financeiro_cobrancas)')
  await page.locator('tr', { hasText: `COB ${MOD}` }).first().getByRole('button', { name: 'Marcar pago' }).click()
  await espera(1200)
  confere(sql(`select status from financeiro_cobrancas where id=${cob}`) === 'pago', 'marcar pago grava')
  sql(`update financeiro_cobrancas set status='pendente', filial_id=6 where id=${cob}`)
  await page.reload({ waitUntil: 'networkidle' })
  sql(`update financeiro_cobrancas set filial_id=3 where id=${cob}`)
  // a lista agora vem sem a cobrança (estava em 6 no load) — recarrega em 3 e tira por trás
  await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('tab', { name: /Cobranças/ }).click(); await espera(600)
  sql(`update financeiro_cobrancas set filial_id=6 where id=${cob}`)
  await page.locator('tr', { hasText: `COB ${MOD}` }).first().getByRole('button', { name: 'Marcar pago' }).click()
  await espera(1200)
  const t = await toasts(page)
  confere(t.some((x) => /Nada foi gravado/.test(x)) && sql(`select status from financeiro_cobrancas where id=${cob}`) === 'pendente', `marcar pago fora da vista avisa (${JSON.stringify(t).slice(0, 100)})`)
} finally {
  sql(`delete from financeiro_lancamentos where descricao like '%${MOD}'`)
  sql(`delete from financeiro_cobrancas where descricao like '%${MOD}'`)
  sql(`delete from avaliacao_cotacoes where modelo='${MOD}'`)
  sql(`delete from avaliacao_precos where modelo='${MOD}'`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
