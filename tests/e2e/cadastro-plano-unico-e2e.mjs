// Cadastro no plano único (18/11/2026): /register em 3 passos (conta → empresa → aceite), resumo do plano base
// vindo de planos_config (editável no superadmin), sem segmento, aceite de termos + privacidade + DPA na versão
// "piloto 0.9", e o que nasce no banco: empresa, loja principal, dono, aceite e teste de 14 dias. Mais a tabela de
// preços de módulos e extras e as páginas legais públicas.
// Precisa da migração 20261118000100 no banco LOCAL. App LOCAL :3010, Supabase LOCAL.
// Rodar: node tests/e2e/cadastro-plano-unico-e2e.mjs
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

if (sql(`select count(*) from planos_config where id = 'base'`) !== '1') { console.error('Falta a migração 20261118000100 no banco local.'); process.exit(2) }
sql(`delete from rate_limit where chave like 'register%'`)

const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const register = (body) => fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const T = Date.now()
const EMAIL_UI = `dono-cad-${T}@e2e.test`, EMAIL_API = `dono-cad-api-${T}@e2e.test`
const criadas = []
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
const featuresOriginais = sql(`select features::text from planos_config where id='base'`)
const precoUsuarioOriginal = sql(`select coalesce(preco_centavos::text, 'null') from precos_adicionais where chave='usuario'`) || 'sem linha'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const novaPagina = async () => (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
async function entrar(email) {
  const page = await novaPagina()
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
  // ── Migração: ninguém ficou nos planos antigos; os antigos inativos ────────
  confere(sql(`select count(*) from empresas where plano <> 'base'`) === '0', 'empresas existentes no plano base')
  confere(sql(`select string_agg(id, ',' order by id) from planos_config where ativo`) === 'base', 'só o plano base ativo')
  confere(sql(`select string_agg(chave, ',' order by ordem) from precos_adicionais where tipo='extra'`) === 'usuario,numero,loja', 'extras usuário, número e loja na tabela de preços')

  // ── Superadmin edita o resumo e um preço ───────────────────────────────────
  const pS = await entrar(E.superadmin)
  const novas = [...JSON.parse(featuresOriginais), 'Item e2e do resumo']
  let r = await api(pS, '/api/superadmin/planos', 'PATCH', { id: 'base', features: novas })
  confere(r.status === 200, `superadmin edita o que o plano base inclui (${r.status})`)
  r = await api(pS, '/api/superadmin/precos', 'PUT', { chave: 'usuario', preco_centavos: 2990 })
  confere(r.status === 200 && sql(`select preco_centavos from precos_adicionais where chave='usuario'`) === '2990', `preço do usuário adicional salvo (${r.status})`)
  r = await api(pS, '/api/superadmin/precos', 'PUT', { chave: 'nao_existe', preco_centavos: 100 })
  confere(r.status === 400, `item fora da lista recusado (${r.status})`)
  await pS.goto(BASE + '/superadmin/planos', { timeout: 300000 })
  const tS = await pS.locator('body').innerText()
  confere(/Plano e preços/.test(tS) && /Preços de módulos e extras/.test(tS) && /Usuário adicional/.test(tS) && /R\$ 29,90\/mês/.test(tS), 'tela do superadmin: plano base e tabela de preços')
  r = await api(pS, '/api/superadmin/precos', 'PUT', { chave: 'modulo_inexistente_e2e' })
  confere(r.status === 400, 'preço sem valor válido recusado')

  // ── Páginas legais públicas com a Versão piloto 0.9 ────────────────────────
  const pub = await novaPagina()
  for (const [href, nome] of [['/termos', 'Termos de uso'], ['/privacy', 'Política de privacidade'], ['/dpa', 'Acordo de tratamento de dados']]) {
    const resp = await pub.goto(BASE + href, { timeout: 300000 })
    const t = await pub.locator('body').innerText()
    confere(resp.status() === 200 && pub.url().endsWith(href) && /versão\s+piloto 0\.9/i.test(t) && !t.includes('[EU INFORMO]') && t.includes(nome), `${href} pública, com "Versão piloto 0.9"`)
  }

  // ── /register pela tela ────────────────────────────────────────────────────
  await pub.goto(BASE + '/register', { timeout: 300000 })
  const resumo = await pub.locator('aside[aria-label="Resumo do plano"]').innerText()
  confere(/R\$\s?197/.test(resumo) && /3 usuários/.test(resumo) && /Instagram e Messenger/.test(resumo) && /2 lojas/.test(resumo), 'resumo do plano base (preço e o que inclui)')
  confere(/14 dias grátis, sem cartão/.test(resumo) && /Módulos extras na Central/.test(resumo), 'resumo: 14 dias grátis, sem cartão; módulos extras na Central')
  confere(resumo.includes('Item e2e do resumo'), 'resumo segue o que o superadmin editou')
  confere(!/PDV|leads|white-?label|API|SLA/i.test(resumo), 'resumo sem PDV, limite de leads, white-label, API ou SLA')
  const tela1 = await pub.locator('body').innerText()
  confere(!/segmento|escolha seu plano/i.test(tela1), 'sem pergunta de segmento nem escolha de plano')

  await pub.getByLabel('Seu nome').fill('Dono Cadastro e2e')
  await pub.getByLabel('E-mail').fill(EMAIL_UI)
  await pub.getByLabel('Telefone / WhatsApp').fill('11988887777')
  confere(await pub.getByLabel('Telefone / WhatsApp').inputValue() === '(11) 98888-7777', 'telefone com máscara')
  await pub.locator('#reg-senha').fill(SENHA)
  await pub.getByLabel('Confirmar senha').fill(SENHA)
  await pub.getByRole('button', { name: /Continuar/ }).click()

  await pub.getByLabel('Nome da empresa').fill('Empresa Cadastro e2e')
  confere(await pub.getByLabel('Nome da loja principal').inputValue() === 'Empresa Cadastro e2e', 'loja principal nasce com o nome da empresa')
  await pub.getByLabel('CNPJ (opcional)').fill('11222333000180')
  await pub.getByRole('button', { name: /Continuar/ }).click()
  confere(/CNPJ inválido/.test(await pub.locator('body').innerText()), 'CNPJ inválido barrado na tela')
  await pub.getByLabel('CNPJ (opcional)').fill('11222333000181')
  confere(await pub.getByLabel('CNPJ (opcional)').inputValue() === '11.222.333/0001-81', 'CNPJ com máscara')
  await pub.getByRole('button', { name: /Continuar/ }).click()

  const tela3 = await pub.locator('body').innerText()
  const links = await pub.locator('main a, a[target="_blank"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  confere(['/termos', '/privacy', '/dpa'].every((h) => links.includes(h)), `links de termos, privacidade e DPA (${links.join(' ')})`)
  confere((tela3.match(/versão piloto 0.9/g) ?? []).length === 3, 'as três versões "piloto 0.9" na tela')
  const criar = pub.getByRole('button', { name: /Criar conta grátis/ })
  confere(await criar.isDisabled(), 'sem o aceite, o botão de criar fica desligado')
  await pub.getByRole('checkbox').check()
  await Promise.all([pub.waitForURL((u) => u.pathname.startsWith('/dashboard'), { timeout: 300000 }), criar.click()])
  confere(true, 'conta criada e direto no painel')
  await pub.getByText('Primeiros passos').waitFor({ timeout: 60000 }).then(() => ok('primeiro acesso guiado: "Primeiros passos" na tela'), () => falha('"Primeiros passos" não apareceu'))

  // ── O que nasceu no banco ──────────────────────────────────────────────────
  const uid = sql(`select id from auth.users where email='${EMAIL_UI}'`)
  const emp = sql(`select e.id from empresas e join empresa_usuarios eu on eu.empresa_id=e.id where eu.usuario_id='${uid}'`)
  criadas.push(emp)
  const linha = sql(`select nome||'|'||plano||'|'||status||'|'||coalesce(cnpj,'')||'|'||coalesce(telefone,'')||'|'||coalesce(preset_onboarding,'')||'|'||limite_usuarios||'|'||limite_leads||'|'||cortesia||'|'||coalesce(demo,false) from empresas where id=${emp}`)
  confere(linha === 'Empresa Cadastro e2e|base|ativo|11.222.333/0001-81|(11) 98888-7777|geral|3|99999|false|false', `empresa: plano base, CRM geral, CNPJ/telefone, 3 usuários, leads 99999 — nunca 0, que o gatilho lê como teto zero (${linha})`)
  const dias = Number(sql(`select round(extract(epoch from (trial_ends_at - now())) / 86400, 2) from empresas where id=${emp}`))
  confere(dias > 13.9 && dias <= 14, `teste de 14 dias (${dias} dias)`)
  const loja = sql(`select f.nome||'|'||f.matriz||'|'||f.ativo||'|'||coalesce(f.cnpj,'') from filiais f where f.empresa_id=${emp}`)
  confere(loja === 'Empresa Cadastro e2e|true|true|11.222.333/0001-81' || loja === 'Empresa Cadastro e2e|t|t|11.222.333/0001-81', `loja principal (${loja})`)
  const dono = sql(`select eu.role||'|'||eu.ativo||'|'||(eu.filial_id = f.id) from empresa_usuarios eu join filiais f on f.empresa_id=eu.empresa_id where eu.empresa_id=${emp} and eu.usuario_id='${uid}'`)
  confere(/^owner\|(t|true)\|(t|true)$/.test(dono), `dono (owner, ativo, na loja principal): ${dono}`)
  const aceites = sql(`select string_agg(documento||':'||versao, ',' order by documento) from termos_aceites where usuario_id='${uid}' and empresa_id=${emp}`)
  confere(aceites === 'dpa:piloto 0.9,privacidade:piloto 0.9,termos:piloto 0.9', `aceite dos três documentos, versão piloto 0.9 (${aceites})`)
  const quando = sql(`select bool_and(aceito_em > now() - interval '10 minutes')::text||'|'||bool_and(user_agent is not null)::text||'|'||coalesce(max(ip), '(sem ip)') from termos_aceites where usuario_id='${uid}'`)
  confere(/^true\|true\|/.test(quando), `aceite com data e navegador; IP: ${quando.split('|')[2]}`)
  const mods = sql(`select coalesce(string_agg(modulo, ','), '') from empresa_modulos where empresa_id=${emp} and ativo`)
  confere(!/estoque|pdv|celulares|imoveis|agenda|cardapio/.test(mods), `sem módulo de ramo ligado (${mods || 'nenhum'})`)

  // ── Pela API: regras do servidor ───────────────────────────────────────────
  const corpo = { email: EMAIL_API, password: SENHA, nomeUsuario: 'Dono API', nomeEmpresa: 'Empresa API e2e', telefone: '11977776666', aceite: true }
  r = await register({ ...corpo, aceite: false })
  confere(r.status === 400 && /Aceite/.test((await r.json()).error ?? ''), `sem aceite: 400 (${r.status})`)
  r = await register({ ...corpo, telefone: '' })
  confere(r.status === 400 && /telefone/i.test((await r.json()).error ?? ''), `sem telefone: 400 (${r.status})`)
  r = await register({ ...corpo, plano: 'pro', segmento: 'imobiliaria', nomeLoja: 'Loja Centro' })
  const rj = await r.json().catch(() => ({}))
  confere(r.status === 200 && rj.empresaId, `cadastro pela API (${r.status} ${rj.error ?? ''})`)
  if (rj.empresaId) {
    criadas.push(rj.empresaId)
    const l2 = sql(`select e.plano||'|'||e.preset_onboarding||'|'||f.nome from empresas e join filiais f on f.empresa_id=e.id where e.id=${rj.empresaId}`)
    confere(l2 === 'base|geral|Loja Centro', `plano e segmento mandados são ignorados; loja com o nome dado (${l2})`)
  }
  sql(`delete from rate_limit where chave like 'register%'`)
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 500))
} finally {
  // Pelo cliente, não pelo psql: o argumento de linha de comando do Windows estraga o acento do texto.
  const { error: eVolta } = await svc.from('planos_config').update({ features: JSON.parse(featuresOriginais) }).eq('id', 'base')
  if (eVolta) falha('restaurar o resumo do plano: ' + eVolta.message)
  if (precoUsuarioOriginal === 'sem linha') sql(`delete from precos_adicionais where chave='usuario'`)
  else sql(`update precos_adicionais set preco_centavos = ${precoUsuarioOriginal} where chave='usuario'`)
  for (const id of criadas) { try { apagarEmpresa(id) } catch (e) { falha('apagar empresa ' + id + ': ' + e.message) } }
  for (const email of [EMAIL_UI, EMAIL_API]) {
    const id = sql(`select id from auth.users where email='${email}'`)
    if (id) await svc.auth.admin.deleteUser(id)
  }
  sql(`delete from rate_limit where chave like 'register%'`)
  await browser.close()
  const sobra = sql(`select count(*) from auth.users where email in ('${EMAIL_UI}','${EMAIL_API}')`) + '/' + sql(`select count(*) from empresas where nome in ('Empresa Cadastro e2e','Empresa API e2e')`)
  confere(sobra === '0/0', `limpeza: usuários e empresas do teste apagados (${sobra})`)
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
