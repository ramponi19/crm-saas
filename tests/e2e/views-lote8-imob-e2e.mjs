// Views lote 8 — o cliente com o módulo Imóveis LIGADO (só no local, empresa 1).
// Pré: empresa_modulos (1,'imoveis') ativo e os 6 campos do módulo criados (aoInstalarModulo).
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE L8I ${T}`
const criados = []; let imovelId = null
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
confere(sql(`select count(*) from campos_personalizados where empresa_id=1 and modulo_dono='imoveis' and ativo`) === '6', 'os 6 campos do módulo Imóveis existem')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])
try {
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  await page.goto(BASE + '/clientes', { waitUntil: 'networkidle', timeout: 240000 })
  confere((await page.content()).includes('Gerencie seus clientes e leads'), 'com o Imóveis ligado, /clientes é a tela da imobiliária')

  // criar pela ficha da imobiliária
  await page.getByRole('button', { name: 'Novo cliente' }).first().click()
  const dlg = page.getByRole('dialog'); await dlg.waitFor()
  await dlg.getByLabel('Nome completo').fill(MK)
  await dlg.getByLabel('CPF').fill('529.982.247-25')
  await dlg.getByLabel('Telefone').fill('(19) 9' + String(T).slice(-8))
  await dlg.getByLabel('Corretor responsável').selectOption(DONO)
  await dlg.getByLabel('Tipo de cliente').selectOption('locacao')
  await dlg.getByLabel('Valor pretendido (R$)').fill('450.000')
  await dlg.getByLabel('Região de interesse').fill('Centro')
  await dlg.getByLabel('Status de aprovação').selectOption('em_analise')
  await dlg.locator('input[type="checkbox"]').check()
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })
  const d = sql(`select id||'|'||(dados->>'tipo_negocio')||'|'||(dados->'valor_pretendido')||'|'||(dados->>'regiao_interesse')||'|'||(dados->>'status_aprovacao')||'|'||(dados->>'corretor_id')||'|'||(dados->'proprietario')||'|'||(dados->'_cliente')::text from contatos where nome='${MK}'`).split('|')
  criados.push(Number(d[0]))
  confere(d[1] === 'locacao' && d[2] === '450000' && d[3] === 'Centro' && d[4] === 'em_analise' && d[5] === DONO && d[6] === 'true',
    `campos do módulo em dados (${d.slice(1, 7).join(', ')})`)
  confere(!/tipo_negocio|status_aprovacao|corretor_id|proprietario|tipo_cliente/.test(d[7]), `a marca _cliente não guarda campo (${d[7]})`)

  // a lista e a ficha leem pela camada
  await page.waitForTimeout(800)
  const linha = page.locator('tr', { hasText: MK }).first()
  const txt = await linha.innerText()
  confere(txt.includes('Locação') && txt.includes('Proprietário') && txt.includes('Em Análise'), `lista mostra tipo, papel e status (${txt.replace(/\s+/g, ' ').slice(0, 120)})`)
  await linha.click(); await dlg.waitFor()
  confere((await dlg.innerText()).includes('Locação'), 'a ficha abre com o tipo de negócio')
  await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' }).catch(() => {})

  // gatilho do imóvel marca o proprietário em contatos.dados
  const outro = (await api('/api/clientes', 'POST', { nome: `${MK} B`, telefone: '(11) 97' + String(T).slice(-7) })).json?.cliente
  criados.push(outro.id)
  confere(sql(`select coalesce(dados->>'proprietario','-') from contatos where id=${outro.id}`) === 'false', 'cliente novo nasce sem o papel de proprietário')
  imovelId = sql(`insert into imoveis_imoveis (empresa_id, titulo, proprietario_id) values (1, '${MK} imovel', ${outro.id}) returning id`).split('\n')[0]
  confere(sql(`select dados->>'proprietario' from contatos where id=${outro.id}`) === 'true', 'salvar imóvel apontando para o cliente marca proprietário (marcar_cliente_proprietario novo)')

  // fundir pela tela, e desfazer pelo aviso
  await page.goto(BASE + '/clientes', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Fundir Leads' }).click()
  const fm = page.getByRole('dialog'); await fm.waitFor()
  await fm.getByPlaceholder(/Buscar por nome/).fill(MK)
  await fm.getByRole('button', { name: new RegExp(`^${MK}\\b(?! B)`) }).first().click()
  await fm.getByPlaceholder(/Buscar por nome/).fill(`${MK} B`)
  await fm.getByRole('button', { name: new RegExp(`${MK} B`) }).first().click()
  await fm.getByLabel(/digite o nome/).fill(`${MK} B`)
  await fm.getByRole('button', { name: 'Confirmar Fusão' }).click()
  await page.waitForTimeout(1500)
  confere(sql(`select count(*) from contatos where id=${outro.id}`) === '0' && sql(`select proprietario_id from imoveis_imoveis where id=${imovelId}`) === String(d[0]), 'fundir pela tela: o B sai e o imóvel passa para o principal')
  const t = await toasts(page)
  confere(t.some((x) => x.includes('Cadastros unificados') && x.includes('Desfazer')), `aviso com Desfazer (${t.join(' / ').slice(0, 120)})`)
  await page.locator('[data-sonner-toast] button', { hasText: 'Desfazer' }).first().click()
  await page.waitForTimeout(1500)
  confere((await toasts(page)).some((x) => x.includes('Fusão desfeita')), 'desfazer pelo aviso')
  confere(sql(`select count(*) from contatos where id=${outro.id}`) === '1' && sql(`select proprietario_id from imoveis_imoveis where id=${imovelId}`) === String(outro.id), 'o B volta, com o imóvel dele')

  // campos do módulo no card: visíveis com o módulo ligado, fora com ele desligado
  const lead = sql(`select n.id from negocios n where n.empresa_id=1 and n.filial_id=3 order by n.id desc limit 1`)
  const com = await api(`/api/leads/${lead}/card`)
  confere((com.json?.campos ?? []).some((c) => c.chave === 'tipo_negocio') && !(com.json?.campos ?? []).some((c) => c.chave === 'corretor_id' || c.chave === 'tipo_cliente'), 'card com Imóveis: tem tipo de negócio; corretor e tipo do cliente ficam na tela de Clientes')
  sql(`update empresa_modulos set ativo=false where empresa_id=1 and modulo='imoveis'`)
  const sem = await api(`/api/leads/${lead}/card`)
  confere(sem.status === 200 && !(sem.json?.campos ?? []).some((c) => c.chave === 'tipo_negocio' || c.chave === 'status_aprovacao'), 'card sem Imóveis: nenhum campo do módulo')
  await page.goto(BASE + '/clientes', { waitUntil: 'networkidle' })
  confere(!(await page.content()).includes('Gerencie seus clientes e leads'), 'sem Imóveis, /clientes volta à tela do varejo')
} catch (e) {
  falha('exceção: ' + String(e?.stack ?? e).slice(0, 400))
} finally {
  if (imovelId) sql(`delete from imoveis_imoveis where id=${imovelId}`)
  for (const id of criados) sql(`delete from contatos where id=${id}`)
  sql(`delete from contato_fusoes where contato_principal_id = any(array[${criados.join(',') || 0}]::bigint[])`)
  console.log('sobrou do teste:', sql(`select count(*) from contatos where nome like 'TESTE L8I%'`))
  await browser.close()
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
