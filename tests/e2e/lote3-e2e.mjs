// Lote 3 — app LOCAL :3010 contra o Supabase LOCAL:
//  (A) /comunicacao desenha a mensagem de anúncio com o cartão (nunca o JSON cru);
//  (B) automação: Desativar com a linha apagada por trás avisa "Nada foi gravado"; o normal grava.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const T = Date.now()
const conv = sql(`select id from conversas where filial_id=3 and empresa_id=1 and canal_id is not null order by ultima_mensagem_at desc nulls last limit 1`)
const anuncio = JSON.stringify({ titulo: `AD TESTE ${T} - iPhone`, corpo: 'Corpo do anuncio de teste', url: null, plataforma: 'instagram', anuncio_id: '123456' }).replace(/'/g, "''")
const idAn = sql(`insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, canal_id, direcao, conteudo, tipo, origem, lida)
  select empresa_id, filial_id, id, contato_id, canal_id, 'recebida', '${anuncio}', 'anuncio', 'instagram', true from conversas where id=${conv} returning id`).split('\n')[0]
const novaAuto = () => sql(`insert into automacoes (empresa_id, etapa_slug, gatilho, acao, ativo, config) values (1, 'novo', 'entrou_na_etapa', 'notificar_gestor', true, '{"teste":"${T}"}') returning id`).split('\n')[0]
if (sql(`select count(*) from automacoes where empresa_id=1`) !== '0') throw new Error('o teste B precisa de 0 automações no local')
const autom = novaAuto()
console.log('conversa', conv, 'mensagem de anúncio', idAn, 'automação', autom)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
try {
  // A
  await page.goto(`${BASE}/comunicacao?c=${conv}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !/Carregando mensagens/.test(document.body.innerText), null, { timeout: 30000 })
  await espera(800)
  const bolha = page.locator(`[data-mensagem-id="${idAn}"]`)
  const txt = (await bolha.count()) ? await bolha.innerText() : ''
  confere(/Veio de anúncio/i.test(txt) && txt.includes(`AD TESTE ${T}`) && txt.includes('ID da campanha: 123456'), `cartão de anúncio na Inbox: "${txt.replace(/\n/g, ' | ').slice(0, 110)}"`)
  confere(!txt.includes('{"titulo"') && !/Abrir arquivo/.test(txt), 'sem JSON cru e sem "Abrir arquivo"')
  // B
  await page.goto(`${BASE}/configuracoes?aba=automacoes`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Desativar' }).first().waitFor({ timeout: 20000 })
  sql(`delete from automacoes where id=${autom}`)
  await page.getByRole('button', { name: 'Desativar' }).first().click()
  await espera(1500)
  const t = await toasts(page)
  confere(t.some((x) => /Nada foi gravado/.test(x)), `desativar automação apagada por trás avisa (${JSON.stringify(t).slice(0, 100)})`)
  const autom2 = novaAuto()
  await page.goto(`${BASE}/configuracoes?aba=automacoes`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Desativar' }).first().waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: 'Desativar' }).first().click()
  await espera(1500)
  confere(sql(`select ativo from automacoes where id=${autom2}`) === 'f', 'desativar normal grava (ativo = false)')
  sql(`delete from automacoes where id=${autom2}`)
} finally {
  sql(`delete from mensagens where id=${idAn}`)
  sql(`delete from automacoes where config->>'teste' = '${T}'`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
