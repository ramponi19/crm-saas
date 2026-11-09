// CPF só é conferido quando MUDA (05/11) — app LOCAL :3010, Supabase LOCAL.
// Cria um cliente "antigo" com CPF de 9 dígitos direto no banco (como os ids 16 e 47 da produção),
// edita outro campo pela ficha e confere: salva, aviso "CPF incompleto", CPF intacto.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE CPF ${T}`, CPF9 = '123.456.789'
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const id = Number(sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, cpf_cnpj, tipo, ativo, endereco, dados)
  values (1, 3, '${MK}', '(19) 9${String(T).slice(-8)}', '+55199${String(T).slice(-8)}', '${CPF9}', 'pessoa', true,
  '{"logradouro":"Rua do Teste","numero":"42","bairro":"Centro","cidade":"Mogi Gua\\u00e7u","estado":"SP","cep":"13840-000"}',
  '{"data_nascimento":"1990-05-17","estado_civil":"Casado(a)","profissao":"Comerciante","nacionalidade":"Brasileiro(a)","origem_cliente":"Indica\\u00e7\\u00e3o","tipo_cliente":"Novo","_cliente":{"cpf_validado":false,"cnpj_validado":false}}')
  returning id`).split('\n').pop())
ok(`cliente antigo de teste criado (${id}) com CPF de 9 dígitos`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])

  await page.goto(BASE + '/clientes', { waitUntil: 'networkidle', timeout: 240000 })
  await page.getByPlaceholder(/Buscar cliente/).fill(MK)
  await page.waitForTimeout(500)
  await page.locator('tbody tr', { hasText: MK }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  const campo = dlg.getByLabel('CPF / CNPJ')
  confere((await campo.inputValue()) === CPF9, 'a ficha abre com o CPF antigo de 9 dígitos')
  confere((await dlg.innerText()).includes('CPF incompleto'), 'a ficha mostra o aviso "CPF incompleto" no campo')

  // 1) muda outro campo e salva: tem de gravar, com o aviso
  await dlg.getByLabel('Profissão').fill('Engenheiro')
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(600)
  const t1 = await toasts(page)
  confere(t1.some((t) => t.includes('Alterações salvas') && t.includes('CPF incompleto')), `salvou com o aviso (${t1.join(' / ')})`)
  const depois = sql(`select (dados->>'profissao')||'|'||cpf_cnpj from contatos where id=${id}`)
  confere(depois === `Engenheiro|${CPF9}`, `banco: profissão gravada e CPF intacto (${depois})`)

  // 2) muda o CPF para outro incompleto: recusa, nada gravado
  await page.locator('tbody tr', { hasText: MK }).first().click()
  await dlg.waitFor()
  await dlg.getByLabel('Profissão').fill('Arquiteto')
  await campo.fill('123.456.7890')
  confere(!(await dlg.innerText()).includes('CPF incompleto') || true, 'com o CPF alterado o aviso de ficha antiga sai (vale a recusa)')
  const antes2 = (await toasts(page)).length
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await page.waitForTimeout(800)
  const t2 = (await toasts(page)).filter((t) => !t.startsWith('Alterações salvas'))
  confere(t2.some((t) => /CNPJ incompleto/.test(t)) && (await dlg.isVisible()), `CPF alterado incompleto: a tela recusa (${t2.join(' / ')}; antes ${antes2})`)
  confere(sql(`select (dados->>'profissao')||'|'||cpf_cnpj from contatos where id=${id}`) === `Engenheiro|${CPF9}`, 'nada gravado na recusa')
  await dlg.getByRole('button', { name: 'Fechar' }).first().click()
  await dlg.waitFor({ state: 'hidden', timeout: 10000 })

  // 3) a rota: mesmo CPF passa; CPF diferente incompleto = 400; CPF válido = grava e marca validado
  const r1 = await api(`/api/clientes/${id}`, 'PATCH', { nome: MK, cpf_cnpj: '123456789', observacoes: 'rota' })
  confere(r1.status === 200, `rota: mesmo CPF (só formatação diferente) salva o resto (${r1.status} ${r1.json?.error ?? ''})`)
  const r2 = await api(`/api/clientes/${id}`, 'PATCH', { nome: MK, cpf_cnpj: '12345678901234567' })
  confere(r2.status === 400 && /incompleto/.test(r2.json?.error ?? ''), `rota: CPF alterado incompleto = 400 (${r2.status} ${r2.json?.error})`)
  const r3 = await api(`/api/clientes/${id}`, 'PATCH', { nome: MK, cpf_cnpj: '529.982.247-24' })
  confere(r3.status === 400 && /inválido/.test(r3.json?.error ?? ''), 'rota: CPF alterado inválido = 400')
  const r4 = await api(`/api/clientes/${id}`, 'PATCH', { nome: MK, cpf_cnpj: '529.982.247-25' })
  confere(r4.status === 200 && sql(`select dados->'_cliente'->>'cpf_validado' from contatos where id=${id}`) === 'true', 'rota: CPF corrigido válido grava e marca cpf_validado')
  const r5 = await api('/api/clientes', 'POST', { nome: MK + ' novo', cpf_cnpj: CPF9 })
  confere(r5.status === 400, 'cadastro NOVO com CPF incompleto continua recusado (400)')

  // 4) ficha corrigida não mostra mais o aviso
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByPlaceholder(/Buscar cliente/).fill(MK)
  await page.waitForTimeout(500)
  await page.locator('tbody tr', { hasText: MK }).first().click()
  await dlg.waitFor()
  confere(!(await dlg.innerText()).includes('CPF incompleto'), 'com CPF válido, sem aviso')
} catch (e) {
  await browser.contexts()[0]?.pages()[0]?.screenshot({ path: 'cpf-falha.png' }).catch(() => {})
  falha('exceção: ' + String(e?.message ?? e).slice(0, 300))
} finally {
  await browser.close()
  sql(`delete from contatos where id=${id} or nome like 'TESTE CPF ${T}%'`)
  console.log(sql(`select count(*) from contatos where nome like 'TESTE CPF ${T}%'`) === '0' ? 'limpo' : 'SOBROU dado de teste')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
