// Views lote 6 (imob) — app LOCAL :3010, Supabase LOCAL, as 4 views já derrubadas.
// Liga o módulo Imóveis para a empresa 1 SÓ NO LOCAL, cria dados de teste e apaga no fim.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22', EMAIL = E.dono
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const env = Object.fromEntries(readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const T = Date.now(), COD = `E2E6-${T}`

const VIEWS = ['imoveis', 'chaves_imoveis', 'negocios_imobiliarios', 'lead_perfil_busca']
confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${VIEWS.map((v) => `'${v}'`).join(',')})`) === '0', 'as 4 views não existem no local')
confere(sql(`select count(*) from pg_proc where proname='propagar_filial_do_lead'`) === '0', 'propagar_filial_do_lead saiu')
const linhaMod = sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='imoveis'),'sem')`)
sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo) values (1,'imoveis','plano',true) on conflict (empresa_id, modulo) do update set ativo=true`)
const lead = sql(`select id from negocios where empresa_id=1 order by id desc limit 1`)

// JWT do dono pelo GoTrue local (PostgREST com a RLS dele).
const tok = await (await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: SENHA }) })).json()
const rest = async (path, method = 'GET', body) => {
  const r = await fetch(`${env.API_URL}/rest/v1/${path}`, { method, headers: { apikey: env.ANON_KEY, authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json', prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}
let imovelId = null
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
const reqs = []
page.on('response', (r) => { if (r.url().includes('/rest/v1/')) reqs.push({ u: r.url(), s: r.status() }) })
try {
  confere(!!tok.access_token, 'JWT do dono')
  // Escritas pela RLS do dono nas tabelas do core.
  let r = await rest('imoveis_imoveis', 'POST', { empresa_id: 1, codigo: COD, titulo: 'Casa E2E lote 6', tipo: 'casa', finalidade: 'venda', status: 'disponivel', bairro: 'Centro', cidade: 'Mogi Guaçu', valor_venda: 500000 })
  imovelId = r.json?.[0]?.id
  confere(r.status === 201 && imovelId, `cria imóvel em imoveis_imoveis (${r.status})`)
  r = await rest('imoveis_chaves', 'POST', { empresa_id: 1, imovel_id: imovelId, codigo: 'CH-' + T, status: 'na_imobiliaria' })
  confere(r.status === 201, `cria chave em imoveis_chaves (${r.status} ${JSON.stringify(r.json).slice(0, 80)})`)
  r = await rest('imoveis_perfis_busca', 'POST', { empresa_id: 1, lead_id: Number(lead), finalidade: 'venda', cidades: ['Mogi Guaçu'], bairros: ['Centro'], preco_max: 600000 })
  confere(r.status === 201, `cria perfil em imoveis_perfis_busca (${r.status} ${JSON.stringify(r.json).slice(0, 80)})`)
  r = await rest('imoveis_negocios', 'POST', { empresa_id: 1, imovel_id: imovelId, lead_id: Number(lead), tipo: 'venda', valor: 500000, status: 'contrato', origem: 'funil' })
  confere(r.status === 201, `cria negócio em imoveis_negocios (${r.status} ${JSON.stringify(r.json).slice(0, 120)})`)
  r = await rest(`visitas?select=id,imoveis:imoveis_imoveis(titulo,codigo,bairro)&limit=1`)
  confere(r.status === 200, `embed visitas → imoveis:imoveis_imoveis (${r.status} ${JSON.stringify(r.json).slice(0, 80)})`)
  r = await rest(`imoveis_chaves?select=id,imovel:imoveis_imoveis(codigo)&imovel_id=eq.${imovelId}`)
  confere(r.status === 200 && r.json?.[0]?.imovel?.codigo === COD, `embed chave → imóvel (${JSON.stringify(r.json).slice(0, 80)})`)

  // Telas.
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', EMAIL); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
  for (const rota of ['/imoveis', '/dashboard', '/financeiro', '/gestao-leads', '/clientes', '/relatorios', '/leads']) {
    reqs.length = 0
    const g = await page.goto(BASE + rota, { waitUntil: 'networkidle' })
    await espera(600)
    const ruins = reqs.filter((x) => x.s >= 400)
    confere(g.status() === 200 && ruins.length === 0, `${rota} 200, REST sem erro${ruins.length ? ' — ' + ruins.map((x) => x.s + ' ' + x.u.split('/rest/v1/')[1].slice(0, 70)).join(' ; ') : ''} (${new URL(page.url()).pathname})`)
  }
  await page.goto(BASE + '/imoveis', { waitUntil: 'networkidle' })
  confere((await page.locator('body').innerText()).includes('Casa E2E lote 6'), '/imoveis lista o imóvel de teste')
  const api = (u) => page.evaluate(async (x) => { const r = await fetch(x); return { s: r.status, t: await r.text() } }, u)
  let a = await api(`/api/match/lead/${lead}`)
  confere(a.s === 200, `/api/match/lead/${lead}: ${a.s} ${a.t.slice(0, 100)}`)
  a = await api('/api/exportar?tipo=imob_imoveis')
  confere(a.s === 200 && a.t.includes(COD), `exportar imob_imoveis traz o imóvel (${a.s})`)
  a = await api('/api/exportar?tipo=imob_financeiro')
  confere(a.s === 200 && a.t.split(/\r?\n/).length >= 2, `exportar imob_financeiro (${a.s}, ${a.t.split(/\r?\n/).length - 1} linhas)`)
} catch (e) {
  falha('exceção: ' + String(e).slice(0, 200))
} finally {
  await browser.close()
  if (imovelId) sql(`delete from imoveis_negocios where imovel_id=${imovelId}; delete from imoveis_chaves where imovel_id=${imovelId}; delete from imoveis_imoveis where id=${imovelId}`)
  sql(`delete from imoveis_perfis_busca where empresa_id=1 and lead_id=${lead} and preco_max=600000 and created_at > now() - interval '30 minutes'`)
  if (linhaMod === 'sem') sql(`delete from empresa_modulos where empresa_id=1 and modulo='imoveis'`)
  else sql(`update empresa_modulos set ativo=${linhaMod} where empresa_id=1 and modulo='imoveis'`)
  console.log('limpo:', sql(`select count(*) from imoveis_imoveis where codigo like 'E2E6-%'`), 'imóveis de teste; módulo:', sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='imoveis'),'sem')`))
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
