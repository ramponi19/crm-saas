// Bloco 1 da frente "pronto para vender" (17/11/2026): em preparação fora, trava de módulo no servidor,
// seções de Configurações de módulo, rotas antigas — com DUAS empresas.
//   A = empresa 1 (JM, dono do usuarios.local.json): Orçamentos, PDV e Estoque ligados.
//   B = empresa nova, criada pelo /api/register (preset padrão, o CRM geral) e apagada no fim. A base dela
//       ganha à mão os endereços que o antigo preset Imobiliária ligava (módulos em preparação +
//       Financeiro e Relatórios): é a empresa antiga que nasceu com eles.
// Rodar: node tests/e2e/pronto-vender-b1-e2e.mjs (app LOCAL :3010, Supabase LOCAL; ver LEIA-ME.md)
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=' + (process.env.DB_PORT ?? '54322') + ' dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

const EMAIL_B = `dono-b-${Date.now()}@e2e.test`
const menuAntes = sql(`select coalesce(itens::text,'') from empresa_menu where empresa_id=1`)
let empresaB = null
const orcTokens = []

/** Apaga a empresa B inteira: toda tabela com empresa_id, depois a empresa e o login. */
function apagarB() {
  if (!empresaB) return
  sql(`do $$ declare t text; begin
    for t in select c.table_name from information_schema.columns c join information_schema.tables x
      on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE'
      where c.table_schema='public' and c.column_name='empresa_id' and c.table_name<>'empresas' loop
      begin execute format('delete from public.%I where empresa_id=%s', t, ${empresaB}); exception when others then null; end;
    end loop;
    for t in select c.table_name from information_schema.columns c join information_schema.tables x
      on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE'
      where c.table_schema='public' and c.column_name='empresa_id' and c.table_name<>'empresas' loop
      execute format('delete from public.%I where empresa_id=%s', t, ${empresaB});
    end loop;
    delete from public.empresas where id=${empresaB};
  end $$`)
  sql(`delete from public.usuarios where email='${EMAIL_B}'; delete from auth.users where email='${EMAIL_B}'`)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [url, method, body])
const abrir = async (page, path) => { const r = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 300000 }); return { status: r?.status() ?? 0, path: new URL(page.url()).pathname, texto: await page.locator('body').innerText() } }
const menu = (page) => page.evaluate(() => [...document.querySelectorAll('aside a[href], nav a[href]')].map((a) => new URL(a.href).pathname))

try {
  // ── Empresa B pelo cadastro de verdade ──────────────────────────────────────
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono B', nomeEmpresa: 'Empresa B e2e', plano: 'starter', segmento: 'imobiliaria', // inativo desde 20261117000100: cai no padrão
  }) })
  const regJ = await reg.json().catch(() => ({}))
  empresaB = regJ.empresaId ?? null
  confere(reg.status === 200 && empresaB, `cadastro da empresa B: ${reg.status} ${JSON.stringify(regJ)}`)
  if (!empresaB) throw new Error('sem empresa B')
  sql(`update empresa_menu set itens = jsonb_set(itens, '{base,habilitados}', '["/dashboard","/leads","/clientes","/comunicacao","/tarefas","/agenda","/imoveis","/executivo","/simular-financiamento","/ranking","/financeiro","/relatorios","/chat","/gestao-leads"]'::jsonb) where empresa_id=${empresaB}`)

  const pA = await entrar(E.dono)
  const pB = await entrar(EMAIL_B)

  // ── 1. Em preparação: fora do menu e sem tela, mesmo ligado na base/superadmin ─
  sql(`update empresa_menu set itens = jsonb_set(coalesce(itens,'{}'::jsonb), '{superadmin}', coalesce(itens->'superadmin','{}'::jsonb) || '{"habilitados":["/orcamentos/cotacao","/agenda","/imoveis","/kds","/ranking"]}'::jsonb) where empresa_id=1`)
  for (const [p, quem] of [[pA, 'A'], [pB, 'B']]) {
    await abrir(p, '/dashboard')
    const m = await menu(p)
    const vazou = ['/agenda', '/imoveis', '/executivo', '/simular-financiamento', '/ranking', '/kds', '/cardapio', '/avaliacoes'].filter((h) => m.includes(h))
    confere(vazou.length === 0, `${quem}: nenhum módulo em preparação no menu (${vazou.join(',') || 'nenhum'})`)
    const ag = await abrir(p, '/agenda')
    confere(/em preparação/i.test(ag.texto) && !/Novo compromisso|Nova visita/.test(ag.texto), `${quem}: /agenda mostra a vitrine "Em preparação"`)
    const im = await abrir(p, '/imoveis')
    confere(im.path !== '/imoveis' || /em preparação/i.test(im.texto), `${quem}: /imoveis não abre (foi para ${im.path})`)
    const rk = await abrir(p, '/ranking')
    confere(rk.path !== '/ranking' || /em preparação/i.test(rk.texto), `${quem}: /ranking não abre (foi para ${rk.path})`)
  }
  let r = await api(pB, '/api/ranking/metas', 'POST', { escopo: 'pessoa', tipo: 'vendas', alvo: 1, periodo: '2026-11' })
  confere(r.status === 403 && r.json?.code === 'modulo_desligado', `B: API do Ranking (em preparação) 403: ${r.status}`)
  r = await api(pB, '/api/imob/negocios', 'POST', {})
  confere(r.status === 403 && r.json?.code === 'modulo_desligado', `B: API do Imóveis (em preparação, ligado pelo preset) 403: ${r.status}`)

  // ── 2. Trava de módulo nas APIs: A ligado passa, B desligado 403 ──────────────
  r = await api(pB, '/api/reservas', 'POST', {})
  confere(r.status === 403 && r.json?.code === 'modulo_desligado', `B sem Estoque: /api/reservas 403 (${r.status})`)
  r = await api(pA, '/api/reservas', 'POST', {})
  confere(r.status !== 403, `A com Estoque: /api/reservas passa da trava (${r.status})`)
  r = await api(pB, '/api/orcamentos', 'POST', {})
  confere(r.status === 403, `B sem Orçamentos: /api/orcamentos 403 (${r.status})`)
  r = await api(pB, '/api/contrato-modelo', 'GET')
  confere(r.status === 403, `B sem PDV: /api/contrato-modelo 403 (${r.status})`)

  // ── 3. Seções de Configurações de módulo ─────────────────────────────────────
  for (const [secao, a, b] of [['troca', 200, 404], ['contrato', 200, 404], ['documentos', 200, 404], ['cardapio', 404, 404], ['agendamento', 404, 404], ['taxas', 200, 200]]) {
    const ra = await abrir(pA, `/configuracoes/${secao}`)
    const rb = await abrir(pB, `/configuracoes/${secao}`)
    confere(ra.status === a, `A: /configuracoes/${secao} → ${ra.status} (esperado ${a})`)
    confere(rb.status === b, `B: /configuracoes/${secao} → ${rb.status} (esperado ${b})`)
  }
  await abrir(pB, '/configuracoes/taxas')
  const itensB = await pB.evaluate(() => [...document.querySelectorAll('a[href^="/configuracoes/"]')].map((a) => new URL(a.href).pathname))
  confere(!itensB.some((h) => /\/(troca|contrato|documentos|cardapio|agendamento|portais)$/.test(h)), `B: menu de Configurações sem seção de módulo desligado (${itensB.filter((h) => /troca|contrato|documentos/.test(h)).join(',') || 'ok'})`)

  // ── 4. Tela pública por token: só com o módulo ligado na empresa dona do link ─
  const cols = sql(`select string_agg(column_name, ',') from information_schema.columns where table_schema='public' and table_name='orcamentos_orcamentos' and is_nullable='NO' and column_default is null`)
  console.log('  (orcamentos_orcamentos, obrigatórias sem padrão:', cols || 'nenhuma', ')')
  for (const emp of [1, empresaB]) {
    const tok = sql(`insert into orcamentos_orcamentos (empresa_id, cliente_nome) values (${emp}, 'Cliente e2e') returning token`)
    orcTokens.push(tok)
  }
  const pubA = await fetch(`${BASE}/orcamento/${orcTokens[0]}`)
  const pubB = await fetch(`${BASE}/orcamento/${orcTokens[1]}`)
  confere(pubA.status === 200, `link público do orçamento de A (Orçamentos ligado): ${pubA.status}`)
  confere(pubB.status === 404, `link público do orçamento de B (Orçamentos desligado): ${pubB.status}`)
  const apiB = await fetch(`${BASE}/api/orcamento/${orcTokens[1]}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'aprovar' }) })
  confere(apiB.status === 404, `API pública do orçamento de B: ${apiB.status}`)

  // ── 5. Rotas que saíram ──────────────────────────────────────────────────────
  const pr = await abrir(pA, '/produtos')
  confere(pr.path === '/catalogo', `/produtos leva ao Catálogo (${pr.path})`)
  const eq = await abrir(pA, '/equipe')
  confere(eq.path === '/configuracoes/usuarios', `/equipe leva a Configurações → Usuários (${eq.path})`)

  // ── 6. Isolamento básico entre A e B pelas rotas ─────────────────────────────
  const leadA = sql(`select id from negocios where empresa_id=1 order by id desc limit 1`)
  r = await api(pB, `/api/leads/${leadA}/canais`, 'GET')
  confere(r.status === 404 || r.status === 403, `B não lê os canais de um lead de A (${r.status})`)
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 400))
} finally {
  await browser.close()
  try {
    if (orcTokens.length) sql(`delete from orcamentos_orcamentos where token in (${orcTokens.map((t) => `'${t}'`).join(',')})`)
    sql(`update empresa_menu set itens = ${menuAntes ? `'${menuAntes.replace(/'/g, "''")}'::jsonb` : 'itens'} where empresa_id=1`)
    apagarB()
    const sobra = sql(`select count(*) from empresas where nome='Empresa B e2e'`) + '/' + sql(`select count(*) from auth.users where email='${EMAIL_B}'`)
    confere(sobra === '0/0', `limpeza: empresa B e login apagados (${sobra}); menu de A devolvido`)
  } catch (e) { falha('limpeza: ' + String(e).slice(0, 300)) }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
