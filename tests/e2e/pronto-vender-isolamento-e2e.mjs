// "Pronto para vender" (17/11/2026) — Parte 3 com DUAS empresas: isolamento (tabelas, Storage, rotas, realtime),
// modo somente leitura, reativar, Unlimited e limites, cadastro com loja principal e CNPJ, papel Técnico,
// excluir empresa libera o login.
//   A = empresa 1 (JM, dono do usuarios.local.json).  B = empresa nova pelo /api/register (preset padrão).
// Precisa da migração 20261117000100 no banco LOCAL. App LOCAL :3010, Supabase LOCAL.
// Rodar: node tests/e2e/pronto-vender-isolamento-e2e.mjs
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const env = Object.fromEntries(fs.readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=' + (process.env.DB_PORT ?? '54322') + ' dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

if (sql(`select count(*) from pg_policies where policyname = 'somente_leitura_insert'`) === '0') { console.error('Falta a migração 20261117000100 no banco local.'); process.exit(2) }
sql(`delete from rate_limit where chave like 'register%'`)

const EMAIL_B = `dono-iso-${Date.now()}@e2e.test`
const EMAIL_T = `tecnico-iso-${Date.now()}@e2e.test`
let empresaB = null
const arquivosA = []
function apagarEmpresa(id) {
  if (!id) return
  sql(`do $$ declare t text; r int; begin
    for r in 1..2 loop
      for t in select c.table_name from information_schema.columns c join information_schema.tables x
        on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE'
        where c.table_schema='public' and c.column_name='empresa_id' and c.table_name<>'empresas' loop
        begin execute format('delete from public.%I where empresa_id=%s', t, ${id}); exception when others then null; end;
      end loop;
    end loop;
    delete from public.empresas where id=${id};
  end $$`)
}
const novoCliente = () => createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function sessao(email) {
  const c = novoCliente()
  const { error } = await c.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}
const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const register = (body) => fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [url, method, body])

try {
  // ── Cadastro: validação, preset padrão, loja principal ─────────────────────
  let r = await register({ email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono Iso', nomeEmpresa: 'Empresa Iso e2e', plano: 'starter', cnpj: '11.222.333/0001-80' })
  confere(r.status === 400 && /CNPJ inválido/.test((await r.json()).error ?? ''), `cadastro recusa CNPJ inválido (${r.status})`)
  r = await register({ email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono Iso', nomeEmpresa: 'Empresa Iso e2e', plano: 'unlimited', cnpj: '11222333000181', telefone: '11999998888' })
  const rj = await r.json().catch(() => ({}))
  empresaB = rj.empresaId ?? null
  confere(r.status === 200 && empresaB, `cadastro no plano Unlimited: ${r.status} ${JSON.stringify(rj)}`)
  if (!empresaB) throw new Error('sem empresa B')
  const linhaB = sql(`select plano||'|'||coalesce(cnpj,'')||'|'||coalesce(telefone,'')||'|'||coalesce(preset_onboarding,'')||'|'||limite_usuarios from empresas where id=${empresaB}`)
  confere(linhaB === 'unlimited|11.222.333/0001-81|(11) 99999-8888|geral|999', `B: Unlimited, CNPJ e telefone formatados, preset CRM geral, limite 999 (${linhaB})`)
  const loja = sql(`select f.id||'|'||f.matriz||'|'||(eu.filial_id = f.id) from filiais f join empresa_usuarios eu on eu.empresa_id=f.empresa_id where f.empresa_id=${empresaB}`)
  confere(/^\d+\|(t|true)\|(t|true)$/.test(loja), `B nasce com a loja principal e o dono vinculado a ela (${loja})`)
  const modsB = sql(`select coalesce(string_agg(modulo, ','), '') from empresa_modulos where empresa_id=${empresaB} and ativo`)
  confere(!/estoque|pdv|celulares|imoveis|agenda|cardapio/.test(modsB), `B (CRM geral) sem módulo de ramo ligado (${modsB || 'nenhum'})`)

  const cA = await sessao(E.dono)
  const cB = await sessao(EMAIL_B)

  // ── Isolamento por tabela: B não lê nada de A ──────────────────────────────
  const tabelas = sql(`select string_agg(c.table_name, ',' order by c.table_name) from information_schema.columns c join information_schema.tables x on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='empresa_id'`).split(',')
  const vazou = []
  for (const t of tabelas) {
    const { count, error } = await cB.from(t).select('*', { count: 'exact', head: true }).eq('empresa_id', 1)
    if (!error && (count ?? 0) > 0) vazou.push(`${t}=${count}`)
  }
  confere(vazou.length === 0, `isolamento: B não lê linha de A em nenhuma das ${tabelas.length} tabelas com empresa_id (${vazou.join(', ') || 'nada'})`)
  const { count: contatosA } = await cA.from('contatos').select('*', { count: 'exact', head: true }).eq('empresa_id', 1)
  confere((contatosA ?? 0) > 0, `controle: A lê os próprios contatos (${contatosA})`)
  const { error: eInsA } = await cB.from('tarefas').insert({ empresa_id: 1, titulo: 'invasao e2e' })
  confere(!!eInsA, `B não grava na empresa A (${eInsA?.message?.slice(0, 60)})`)

  // ── Storage: cada empresa só na própria pasta (imoveis e produtos) ─────────
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  for (const bucket of ['imoveis', 'produtos']) {
    const meuA = `1/e2e-iso-${Date.now()}.png`
    const up = await cA.storage.from(bucket).upload(meuA, png, { contentType: 'image/png' })
    confere(!up.error, `${bucket}: A grava na pasta 1 (${up.error?.message ?? 'ok'})`)
    if (!up.error) arquivosA.push([bucket, meuA])
    const invade = await cB.storage.from(bucket).upload(`1/e2e-invasao-${Date.now()}.png`, png, { contentType: 'image/png' })
    confere(!!invade.error, `${bucket}: B NÃO grava na pasta de A (${invade.error?.message?.slice(0, 50) ?? 'gravou!'})`)
    const sob = await cB.storage.from(bucket).upload(meuA, png, { contentType: 'image/png', upsert: true })
    confere(!!sob.error, `${bucket}: B NÃO sobrescreve o arquivo de A`)
    const del = await cB.storage.from(bucket).remove([meuA])
    const aindaLa = (await svc.storage.from(bucket).list('1', { search: meuA.split('/')[1] })).data?.length ?? 0
    confere(aindaLa === 1, `${bucket}: B NÃO apaga o arquivo de A (${del.error?.message ?? 'sem erro'}, arquivo ${aindaLa ? 'ficou' : 'sumiu'})`)
    const meuB = `${empresaB}/e2e-iso.png`
    const upB = await cB.storage.from(bucket).upload(meuB, png, { contentType: 'image/png', upsert: true })
    confere(!upB.error, `${bucket}: B grava na própria pasta (${upB.error?.message ?? 'ok'})`)
  }

  // ── Realtime: B não recebe mudança de A ────────────────────────────────────
  const recebidos = []
  const canal = cB.channel('e2e-iso').on('postgres_changes', { event: '*', schema: 'public', table: 'negocios' }, (p) => recebidos.push(p))
  await new Promise((res) => canal.subscribe((s) => { if (s === 'SUBSCRIBED') res() }))
  const negA = sql(`select id from negocios where empresa_id=1 order by id desc limit 1`)
  sql(`update negocios set updated_at = now() where id=${negA}`)
  await espera(4000)
  confere(!recebidos.some((p) => (p.new?.empresa_id ?? p.old?.empresa_id) === 1), `realtime: B não recebe o negócio de A (${recebidos.length} evento(s))`)
  await cB.removeChannel(canal)

  // ── Rotas: B não abre dado de A ────────────────────────────────────────────
  const pB = await entrar(EMAIL_B)
  r = await api(pB, `/api/leads/${negA}/canais`)
  confere(r.status === 404 || r.status === 403, `rota: B não lê os canais de um negócio de A (${r.status})`)
  r = await api(pB, `/api/leads/${negA}/card`)
  confere(r.status === 404 || r.status === 403 || (r.json && !r.json.lead && !r.json.negocio), `rota: B não abre o card de A (${r.status})`)

  // ── Papel Técnico ───────────────────────────────────────────────────────────
  r = await api(pB, '/api/equipe/criar-usuario', 'POST', { nome: 'Técnico e2e', email: EMAIL_T, senha: SENHA + 'x', role: 'tecnico' })
  confere(r.status === 200, `dono cria usuário Técnico: ${r.status} ${r.json?.error ?? ''}`)
  confere(sql(`select role from empresa_usuarios where empresa_id=${empresaB} and usuario_id=(select id from auth.users where email='${EMAIL_T}')`) === 'tecnico', 'o vínculo grava o papel tecnico')

  // ── Modo somente leitura ────────────────────────────────────────────────────
  sql(`update empresas set status='suspenso' where id=${empresaB}`)
  await espera(31000) // o proxy guarda a situação por 30 s
  const { error: eLeit } = await cB.from('tarefas').insert({ empresa_id: empresaB, titulo: 'nao pode' })
  confere(!!eLeit, `só leitura: B não grava pelo banco (${eLeit?.message?.slice(0, 70)})`)
  const { count: vePropria } = await cB.from('filiais').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaB)
  confere((vePropria ?? 0) === 1, 'só leitura: B continua lendo os próprios dados')
  r = await api(pB, '/api/leads', 'POST', { nome: 'Lead em só leitura', telefone: '11988887777' })
  confere(r.status === 423 && r.json?.code === 'somente_leitura', `só leitura: API que grava responde 423 (${r.status})`)
  const tela = await pB.goto(BASE + '/leads', { waitUntil: 'domcontentloaded', timeout: 300000 })
  const corpo = await pB.locator('body').innerText()
  confere(tela?.status() === 200 && /Modo somente leitura/i.test(corpo), 'só leitura: a tela abre com o aviso "Modo somente leitura"')
  const { error: eMsg } = await svc.from('historico_bruto').insert({ empresa_id: empresaB, tipo: 'e2e', payload: { e2e: true } }).select('id')
  confere(!eMsg, `só leitura: o recebimento (service_role) continua gravando (${eMsg?.message ?? 'ok'})`)
  // Superadmin reativa com um clique (a mesma chamada do botão "Reativar").
  const pS = await entrar(E.superadmin)
  r = await api(pS, `/api/superadmin/empresas/${empresaB}`, 'POST', { tipo: 'alterar_status', status: 'ativo' })
  confere(r.status === 200 && sql(`select status from empresas where id=${empresaB}`) === 'ativo', `superadmin reativa: ${r.status}`)
  const { error: eVolta } = await cB.from('tarefas').insert({ empresa_id: empresaB, titulo: 'voltou e2e' })
  confere(!eVolta, `reativada: B volta a gravar (${eVolta?.message ?? 'ok'})`)

  // ── Plano e limites ─────────────────────────────────────────────────────────
  r = await api(pS, `/api/superadmin/empresas/${empresaB}`, 'POST', { tipo: 'trocar_plano', plano: 'starter' })
  const lim = sql(`select plano||'|'||limite_usuarios||'|'||limite_leads from empresas where id=${empresaB}`)
  confere(r.status === 200 && lim === 'starter|3|500', `trocar de plano atualiza os limites (${r.status} ${lim})`)

  // ── Excluir empresa libera o login ──────────────────────────────────────────
  r = await api(pS, `/api/superadmin/empresas/${empresaB}/excluir`, 'DELETE', { confirmacao: 'Empresa Iso e2e' })
  confere(r.status === 200, `superadmin exclui a empresa B: ${r.status} ${JSON.stringify(r.json?.pendencias ?? r.json?.error ?? '')}`)
  const sobra = sql(`select count(*) from auth.users where email in ('${EMAIL_B}','${EMAIL_T}')`) + '/' + sql(`select count(*) from empresas where id=${empresaB}`)
  confere(sobra === '0/0', `logins de B apagados e empresa fora (${sobra})`)
  const restoStorage = (await svc.storage.from('produtos').list(String(empresaB))).data?.length ?? 0
  confere(restoStorage === 0, `arquivos de B apagados do Storage (${restoStorage})`)
  if (sobra === '0/0') empresaB = null
  sql(`delete from rate_limit where chave like 'register%'`)
  r = await register({ email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono Iso', nomeEmpresa: 'Empresa Iso e2e', plano: 'starter' })
  const re = await r.json().catch(() => ({}))
  confere(r.status === 200, `o mesmo e-mail se cadastra de novo (${r.status} ${re.error ?? ''})`)
  empresaB = re.empresaId ?? null
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 500))
} finally {
  await browser.close()
  try {
    for (const [b, p] of arquivosA) await svc.storage.from(b).remove([p])
    if (empresaB) {
      for (const b of ['imoveis', 'produtos']) await svc.storage.from(b).remove([`${empresaB}/e2e-iso.png`])
      apagarEmpresa(empresaB)
    }
    sql(`delete from public.usuarios where email in ('${EMAIL_B}','${EMAIL_T}'); delete from auth.users where email in ('${EMAIL_B}','${EMAIL_T}')`)
    sql(`delete from tarefas where titulo in ('invasao e2e','nao pode','voltou e2e')`)
    sql(`delete from rate_limit where chave like 'register%'`)
    const sobra = sql(`select count(*) from empresas where nome='Empresa Iso e2e'`) + '/' + sql(`select count(*) from auth.users where email in ('${EMAIL_B}','${EMAIL_T}')`)
    confere(sobra === '0/0', `limpeza: nada de teste sobrou (${sobra})`)
  } catch (e) { falha('limpeza: ' + String(e).slice(0, 300)) }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
