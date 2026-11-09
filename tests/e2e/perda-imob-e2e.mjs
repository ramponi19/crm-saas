// Ficha do cliente da imobiliária: mover para a etapa de PERDA pede o motivo (o mesmo
// modal do quadro), grava status/motivo/data e cancelar não mexe na etapa. LOCAL, empresa 1.
//   node tests/e2e/perda-imob-e2e.mjs
// Liga o módulo Imóveis na empresa 1 só durante o teste (volta ao estado de antes) e
// apaga o cliente e o lead que criou, passe ou falhe.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), MK = `TESTE PERDA IMOB ${T}`
let contatoId = null

const moduloAntes = sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='imoveis'), 'nenhum')`)
if (moduloAntes === 'nenhum') sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo) values (1, 'imoveis', 'addon', true)`)
else sql(`update empresa_modulos set ativo=true where empresa_id=1 and modulo='imoveis'`)
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const motivo = sql(`select id||'|'||label from motivos_perda where empresa_id=1 and ativo order by ordem limit 1`).split('|')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
const movers = []
page.on('request', (r) => { if (r.url().includes('/api/leads/mover')) movers.push(JSON.parse(r.postData() || '{}')) })
try {
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])

  // Cenário: um cliente novo, colocado no funil pela própria ficha.
  const criado = await page.evaluate(async (nome) => {
    const r = await fetch('/api/clientes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome, telefone: '(19) 98' + String(Date.now()).slice(-7) }) })
    return (await r.json()).cliente
  }, MK)
  contatoId = criado?.id ?? null
  confere(contatoId != null, `cliente de teste criado (${contatoId})`)

  await page.goto(BASE + '/clientes', { waitUntil: 'networkidle', timeout: 240000 })
  await page.locator('tr', { hasText: MK }).first().click()
  const ficha = page.getByRole('dialog').first(); await ficha.waitFor()
  await ficha.getByRole('button', { name: 'Colocar no funil' }).click()
  await ficha.getByRole('button', { name: 'Perdido', exact: true }).waitFor({ timeout: 20000 })
  const leadId = Number(sql(`select dados->'_cliente'->>'lead_id' from contatos where id=${contatoId}`))
  confere(leadId > 0, `lead criado e vinculado (${leadId})`)
  const etapaAntes = sql(`select status||'|'||coalesce(motivo_perda_id::text,'-') from negocios where id=${leadId}`)

  // 1. Clicar em Perdido abre a pergunta do motivo, sem gravar nada ainda.
  movers.length = 0
  await ficha.getByRole('button', { name: 'Perdido', exact: true }).click()
  // O Modal não tem nome acessível: acha pelo título.
  const pergunta = page.getByRole('dialog').filter({ hasText: 'Por que perdeu este lead?' })
  await pergunta.waitFor({ timeout: 10000 }).then(() => ok('Perdido abre "Por que perdeu este lead?"'), () => falha('o modal do motivo não abriu'))
  confere(movers.length === 0, 'nada foi enviado antes do motivo')

  // 2. Cancelar não mexe na etapa.
  await pergunta.getByRole('button', { name: 'Cancelar' }).click()
  await pergunta.waitFor({ state: 'hidden' })
  await page.waitForTimeout(500)
  confere(movers.length === 0 && sql(`select status||'|'||coalesce(motivo_perda_id::text,'-') from negocios where id=${leadId}`) === etapaAntes,
    `cancelar não move (${etapaAntes})`)

  // 3. Com motivo e justificativa: grava perda com motivo e data.
  await ficha.getByRole('button', { name: 'Perdido', exact: true }).click()
  await pergunta.waitFor()
  confere(await pergunta.getByRole('button', { name: 'Marcar como perdido' }).isDisabled(), 'sem motivo o botão fica desligado')
  await pergunta.getByLabel('Motivo').selectOption(motivo[0])
  await pergunta.getByLabel('Justificativa').fill('comprou com outra imobiliária')
  await pergunta.getByRole('button', { name: 'Marcar como perdido' }).click()
  await pergunta.waitFor({ state: 'hidden', timeout: 15000 })
  await page.waitForTimeout(800)
  const depois = sql(`select status||'|'||coalesce(motivo_perda_id::text,'-')||'|'||(perdido_em is not null) from negocios where id=${leadId}`).split('|')
  confere(depois[0] === 'perdido' && depois[1] === motivo[0] && depois[2] === 'true', `negócio perdido com motivo "${motivo[1]}" e data (${depois.join(', ')})`)
  confere(movers.at(-1)?.motivo_perda_id === Number(motivo[0]) && !!movers.at(-1)?.justificativa, 'a ficha mandou motivo e justificativa para /api/leads/mover')
  const toasts = await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
  confere(toasts.some((t) => t.includes('marcado como perdido')), `aviso de sucesso (${toasts.join(' / ')})`)
  confere(await ficha.getByRole('button', { name: 'Perdido', exact: true }).evaluate((b) => b.className.includes('bg-ink')), 'a faixa mostra Perdido como etapa atual')
} catch (e) {
  falha('erro: ' + String(e).slice(0, 300))
} finally {
  await browser.close()
  if (contatoId != null) {
    const lead = sql(`select coalesce(dados->'_cliente'->>'lead_id','') from contatos where id=${contatoId}`)
    if (lead) sql(`delete from negocios where id=${lead}`)
    sql(`delete from contatos where id=${contatoId}`)
  }
  if (moduloAntes === 'nenhum') sql(`delete from empresa_modulos where empresa_id=1 and modulo='imoveis'`)
  else sql(`update empresa_modulos set ativo=${moduloAntes} where empresa_id=1 and modulo='imoveis'`)
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
  process.exit(falhas.length ? 1 : 0)
}
