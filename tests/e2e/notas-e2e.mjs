// Notas editáveis pelo autor (feat/inbox-notas) — app LOCAL :3010 contra o Supabase LOCAL.
// Dono escreve, edita e apaga; vendedor da mesma loja vê a nota SEM Editar/Apagar;
// nota apagada por trás (outra aba) -> salvar avisa e não finge que gravou.
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
const verifica = (c, m) => (c ? ok(m) : falha(m))

async function entrar(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
  return page
}
async function abrirConversa(page, conv) {
  await page.goto(`${BASE}/comunicacao?c=${conv}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !/Carregando mensagens/.test(document.body.innerText), null, { timeout: 30000 })
  await espera(500)
}
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))

sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const conv = sql(`select id from conversas where filial_id=3 and empresa_id=1 and canal_id is not null order by ultima_mensagem_at desc nulls last limit 1`)
console.log('conversa', conv)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const dono = await entrar(browser, E.dono)
await abrirConversa(dono, conv)

// 1. dono grava
const texto = `nota e2e notas ${Date.now()}`
await dono.getByRole('button', { name: 'Nota interna' }).click()
await dono.fill('textarea', texto)
await dono.getByRole('button', { name: 'Salvar nota' }).click()
await dono.waitForSelector(`[data-nota-id]:has-text("${texto}")`, { timeout: 10000 })
const id = sql(`select id from eventos where tipo='conversa.nota' and dados->>'texto'='${texto}' and por_usuario='${DONO}'`)
verifica(/^\d+$/.test(id), `dono gravou a nota (eventos ${id})`)
const bolha = dono.locator(`[data-nota-id="${id}"]`)
verifica(await bolha.getByRole('button', { name: 'Editar' }).count() === 1 && await bolha.getByRole('button', { name: 'Apagar' }).count() === 1, 'dono vê Editar e Apagar na própria nota')

// 2. vendedor da mesma loja: vê a nota, sem botões
const vend = await entrar(browser, E.vend_mogi)
await abrirConversa(vend, conv)
const bv = vend.locator(`[data-nota-id="${id}"]`)
verifica(await bv.count() === 1, 'vendedor da loja vê a nota')
verifica(await bv.getByRole('button', { name: 'Editar' }).count() === 0 && await bv.getByRole('button', { name: 'Apagar' }).count() === 0, 'vendedor NÃO vê Editar/Apagar na nota do dono')
// 3. dono edita
await bolha.getByRole('button', { name: 'Editar' }).click()
const editado = texto + ' (editada)'
await bolha.locator('textarea').fill(editado)
await bolha.getByRole('button', { name: 'Salvar' }).click()
await espera(1500)
verifica(sql(`select dados->>'texto' from eventos where id=${id}`) === editado, 'edição gravada no banco')
verifica((await bolha.innerText()).includes('editada'), 'bolha mostra "· editada"')
await abrirConversa(vend, conv)
verifica((await vend.locator(`[data-nota-id="${id}"]`).innerText()).includes('(editada)'), 'vendedor vê o texto editado ao reabrir')

// 4. nota apagada por trás (outra aba): salvar avisa e NÃO finge que gravou
await abrirConversa(dono, conv)
await dono.locator(`[data-nota-id="${id}"]`).getByRole('button', { name: 'Editar' }).click()
const copia = sql(`select row_to_json(e)::text from eventos e where id=${id}`)
sql(`delete from eventos where id=${id}`)
await dono.locator(`[data-nota-id="${id}"] textarea`).fill('não deve gravar')
await dono.locator(`[data-nota-id="${id}"]`).getByRole('button', { name: 'Salvar' }).click()
await espera(1500)
const t1 = await toasts(dono)
verifica(t1.some((t) => /Não foi possível editar/.test(t)), `editar nota sumida avisa (${JSON.stringify(t1).slice(0, 120)})`)
verifica(sql(`select count(*) from eventos where id=${id}`) === '0', 'nada foi gravado')
sql(`insert into eventos select * from json_populate_record(null::eventos, '${copia.replace(/'/g, "''")}')`)

// 5. dono apaga
await abrirConversa(dono, conv)
await dono.locator(`[data-nota-id="${id}"]`).getByRole('button', { name: 'Apagar' }).click()
await dono.getByRole('button', { name: 'Apagar' }).last().click()
await espera(1500)
verifica(sql(`select count(*) from eventos where id=${id}`) === '0', 'nota apagada no banco')
verifica(await dono.locator(`[data-nota-id="${id}"]`).count() === 0, 'nota sumiu da tela do dono')
await abrirConversa(vend, conv)
verifica(await vend.locator(`[data-nota-id="${id}"]`).count() === 0, 'nota sumiu para o vendedor')

await browser.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
