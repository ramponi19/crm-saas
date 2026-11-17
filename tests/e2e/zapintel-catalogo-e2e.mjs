// ZapIntel "Produtos mais pedidos" pelo CATÁLOGO da empresa (17/11/2026, migração 20261117000200): nenhuma
// regra de celular no banco. Duas empresas:
//   A = empresa 1 (JM): o painel lista produtos do catálogo dela (que são modelos de iPhone).
//   B = empresa nova pelo /api/register (preset padrão, sem módulo de celular), com o ZapIntel ligado e um
//       catálogo de móveis; um cliente cita "mesa de jantar lyon grande", "cadeira eames" e um iPhone.
// Rodar: node tests/e2e/zapintel-catalogo-e2e.mjs (app LOCAL :3010, Supabase LOCAL com as migrações 0100/0200)
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

if (sql(`select count(*) from pg_proc where proname = 'zapintel_padrao_produto'`) === '0') { console.error('Falta a migração 20261117000200 no banco local.'); process.exit(2) }
sql(`delete from rate_limit where chave like 'register%'`)
const EMAIL_B = `dono-zap-${Date.now()}@e2e.test`
let empresaB = null
const cliente = async (email) => {
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}
function apagarB() {
  if (!empresaB) return
  sql(`do $$ declare t text; r int; begin
    for r in 1..2 loop
      for t in select c.table_name from information_schema.columns c join information_schema.tables x
        on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE'
        where c.table_schema='public' and c.column_name='empresa_id' and c.table_name<>'empresas' loop
        begin execute format('delete from public.%I where empresa_id=%s', t, ${empresaB}); exception when others then null; end;
      end loop;
    end loop;
    delete from public.empresas where id=${empresaB};
  end $$`)
  sql(`delete from public.usuarios where email='${EMAIL_B}'; delete from auth.users where email='${EMAIL_B}'`)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono Zap', nomeEmpresa: 'Moveis Lyon e2e', plano: 'pro' }) })
  empresaB = (await reg.json().catch(() => ({}))).empresaId ?? null
  confere(reg.status === 200 && empresaB, `cadastro da empresa B: ${reg.status}`)
  if (!empresaB) throw new Error('sem empresa B')
  confere(sql(`select count(*) from empresa_modulos where empresa_id=${empresaB} and modulo='celulares' and ativo`) === '0', 'B não tem o módulo de celular')

  // B: ZapIntel ligado, catálogo de móveis, um cliente com 3 mensagens recebidas.
  const loja = sql(`select id from filiais where empresa_id=${empresaB} limit 1`)
  sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo) values (${empresaB}, 'inteligencia', 'addon', true)
       on conflict (empresa_id, modulo) do update set ativo = true`)
  sql(`insert into estoque_produtos (empresa_id, nome, ativo) values (${empresaB}, 'Mesa de Jantar Lyon', true), (${empresaB}, 'Mesa de Jantar Lyon Grande', true), (${empresaB}, 'Cadeira Eames', true)`)
  const contato = sql(`insert into contatos (empresa_id, filial_id, nome, telefone) values (${empresaB}, ${loja}, 'Cliente Zap e2e', '11977776666') returning id`)
  const funil = sql(`select id from funis where empresa_id=${empresaB} order by id limit 1`)
  const etapa = sql(`select id from funil_etapas where empresa_id=${empresaB} and funil_id=${funil} order by ordem limit 1`)
  const neg = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status) values (${empresaB}, ${loja}, ${contato}, ${funil}, ${etapa}, 'aberto') returning id`)
  const conv = sql(`insert into conversas (empresa_id, filial_id, contato_id) values (${empresaB}, ${loja}, ${contato}) returning id`)
  for (const [i, txt] of ['Oi, vocês têm a mesa de jantar lyon grande?', 'E a cadeira eames, sai quanto?', 'Meu filho quer um iphone 15 pro max também'].entries()) {
    sql(`insert into mensagens (empresa_id, filial_id, contato_id, conversa_id, direcao, conteudo, tipo, origem, created_at)
         values (${empresaB}, ${loja}, ${contato}, ${conv}, 'recebida', '${txt}', 'texto', 'whatsapp', now() - interval '${10 - i} minutes')`)
  }
  ok(`dados de B: loja ${loja}, negócio ${neg}, 3 mensagens`)

  const cB = await cliente(EMAIL_B)
  const { data: dB, error: eB } = await cB.rpc('zapintel_dashboard', {})
  const modB = (dB?.modelos ?? []).map((m) => `${m.modelo}=${m.leads}`).sort()
  confere(!eB, `B: painel do ZapIntel responde (${eB?.message ?? 'ok'})`)
  confere(JSON.stringify(modB) === JSON.stringify(['Cadeira Eames=1', 'Mesa de Jantar Lyon Grande=1']),
    `B: produtos mais pedidos = catálogo citado, o nome mais longo vence, sem iPhone (${modB.join(', ')})`)
  const { data: lB } = await cB.rpc('zapintel_dashboard_lista', { p_tipo: 'modelo', p_valor: 'Cadeira Eames' })
  confere((lB?.total ?? 0) === 1, `B: a lista de quem pediu "Cadeira Eames" traz o lead (${lB?.total})`)
  const { data: lB2 } = await cB.rpc('zapintel_dashboard_lista', { p_tipo: 'modelo', p_valor: 'Sofá Inexistente' })
  confere((lB2?.total ?? 0) === 0, 'B: produto que ninguém citou não traz lead')

  // A (JM): os produtos vêm do catálogo dela.
  const cA = await cliente(E.dono)
  const { data: dA, error: eA } = await cA.rpc('zapintel_dashboard', {})
  const catA = new Set(sql(`select string_agg(nome, '|') from estoque_produtos where empresa_id=1 and ativo`).split('|'))
  const modA = (dA?.modelos ?? []).map((m) => m.modelo)
  confere(!eA && modA.every((m) => catA.has(m)), `A: todo produto do painel é do catálogo da JM (${modA.slice(0, 4).join(', ') || 'nenhum nos 30 dias'})`)

  // Tela de B: o bloco aparece com o nome do produto, sem "iPhone".
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', EMAIL_B); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  await page.goto(BASE + '/zapintel', { waitUntil: 'networkidle', timeout: 300000 })
  await page.waitForTimeout(3000)
  const t = await page.locator('body').innerText()
  confere(/Produtos mais pedidos/.test(t) && /Cadeira Eames/.test(t), 'B: a tela mostra "Produtos mais pedidos" com "Cadeira Eames"')
  confere(!/iPhone/i.test(t), 'B: nenhuma menção a iPhone na tela do ZapIntel')
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 500))
} finally {
  await browser.close()
  try {
    apagarB()
    sql(`delete from rate_limit where chave like 'register%'`)
    const sobra = sql(`select count(*) from empresas where nome='Moveis Lyon e2e'`) + '/' + sql(`select count(*) from auth.users where email='${EMAIL_B}'`)
    confere(sobra === '0/0', `limpeza: empresa B e login apagados (${sobra})`)
  } catch (e) { falha('limpeza: ' + String(e).slice(0, 300)) }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
