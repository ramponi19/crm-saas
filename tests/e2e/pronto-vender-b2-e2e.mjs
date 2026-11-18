// Bloco 2 da frente "pronto para vender" (17/11/2026): texto de ramo só com o módulo dono ligado.
//   A = empresa 1 (JM): Estoque + "Celulares e aparelhos" (celulares) ligados — tem de ver tudo de celular.
//   B = empresa nova pelo /api/register (CRM geral), com Estoque instalado pela Central e SEM o módulo
//       de celular — tem de ver o Estoque genérico. Apagada no fim.
// Rodar: node tests/e2e/pronto-vender-b2-e2e.mjs (app LOCAL :3010, Supabase LOCAL; ver LEIA-ME.md)
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=' + (process.env.DB_PORT ?? '54322') + ' dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

const EMAIL_B = `dono-b2-${Date.now()}@e2e.test`
let empresaB = null
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
async function entrar(email) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [url, method, body])
const texto = async (page, path) => { const r = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 300000 }); return { status: r?.status() ?? 0, t: await page.locator('body').innerText() } }
const CELULAR = /\bIMEI\b|iPhone|semi-?novo|Bateria/i

try {
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono B2', nomeEmpresa: 'Empresa B2 e2e', telefone: '11999998888', aceite: true,
  }) })
  empresaB = (await reg.json().catch(() => ({}))).empresaId ?? null
  confere(reg.status === 200 && empresaB, `cadastro da empresa B: ${reg.status}`)
  if (!empresaB) throw new Error('sem empresa B')

  const pA = await entrar(E.dono)
  const pB = await entrar(EMAIL_B)
  let r = await api(pB, '/api/modulos/instalar', 'POST', { chave: 'estoque', instalar: true })
  confere(r.status === 200, `B instala o Estoque pela Central: ${r.status} ${r.json?.error ?? ''}`)
  confere(sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=${empresaB} and modulo='celulares'),'sem linha')`) !== 'true', 'B não tem o módulo de celular')

  // Estoque: A vê celular, B vê genérico.
  const eA = await texto(pA, '/estoque')
  confere(/\bIMEI\b/.test(eA.t), 'A (com Celulares): o Estoque mostra IMEI')
  const eB = await texto(pB, '/estoque')
  confere(eB.status === 200, `B: /estoque abre (${eB.status})`)
  confere(!CELULAR.test(eB.t), `B (sem Celulares): o Estoque não fala de celular (${(eB.t.match(CELULAR) ?? [''])[0]})`)
  confere(/N[ºo°] de série/i.test(eB.t) || /Entrada|Estoque/.test(eB.t), 'B: o Estoque está com os textos genéricos')

  // Produtos (catálogo): idem.
  const cB = await texto(pB, '/catalogo')
  confere(!CELULAR.test(cB.t), `B: Produtos sem texto de celular (${(cB.t.match(CELULAR) ?? [''])[0]})`)

  // Seção Troca (de aparelho): do módulo de celular.
  const tA = await texto(pA, '/configuracoes/troca'); const tB = await texto(pB, '/configuracoes/troca')
  confere(tA.status === 200, `A: Configurações → Troca abre (${tA.status})`)
  confere(tB.status === 404, `B: Configurações → Troca não existe (${tB.status})`)

  // Simulador de financiamento: em preparação para todos (Bloco 1); a tela nunca abre com padrão de imóvel.
  const sB = await texto(pB, '/simular-financiamento')
  confere(!/300\.000|360 meses|\bTR\b/.test(sB.t), 'B: simulador sem padrão de imóvel')

  // Gestão de Leads: sem "Corretor" fixo (vocabulário da empresa).
  const gA = await texto(pA, '/gestao-leads')
  confere(!/Corretor:/.test(gA.t), 'A: Gestão de Leads sem "Corretor:" fixo')

  // ⌘K: B sem PDV não recebe "Nova venda no PDV"; A recebe.
  for (const [p, quem, temPdv] of [[pA, 'A', true], [pB, 'B', sql(`select (base->'habilitados') ? '/pdv' from (select itens->'base' base from empresa_menu where empresa_id=${empresaB}) x`) === 't']]) {
    await p.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 300000 })
    await p.keyboard.press('Control+k')
    await p.waitForTimeout(800)
    const tem = await p.getByText('Nova venda no PDV').count()
    confere((tem > 0) === temPdv, `${quem}: ⌘K ${temPdv ? 'oferece' : 'não oferece'} "Nova venda no PDV" (${tem})`)
    await p.keyboard.press('Escape')
  }
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 400))
} finally {
  await browser.close()
  try {
    apagarB()
    const sobra = sql(`select count(*) from empresas where nome='Empresa B2 e2e'`) + '/' + sql(`select count(*) from auth.users where email='${EMAIL_B}'`)
    confere(sobra === '0/0', `limpeza: empresa B e login apagados (${sobra})`)
  } catch (e) { falha('limpeza: ' + String(e).slice(0, 300)) }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
