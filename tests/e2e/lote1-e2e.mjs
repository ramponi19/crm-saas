// Lote 1 (fix/linhas-lote-1) — app LOCAL :3010 contra o Supabase LOCAL.
// Tarefa apagada "por trás" (outra aba): concluir e excluir AVISAM e não fingem que gravaram.
// E o caminho normal continua: concluir e excluir de verdade.
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
const negocio = sql(`select id from negocios where empresa_id=1 and filial_id=3 order by id desc limit 1`)
const nova = (titulo) => sql(`insert into tarefas (empresa_id, filial_id, negocio_id, titulo, tipo, concluida, responsavel_id, vencimento) values (1, 3, ${negocio}, '${titulo}', 'outro', false, '${DONO}', '2020-01-01T12:00:00Z') returning id`).split('\n')[0]
const a = nova(`LOTE1 sumida ${T}`), b = nova(`LOTE1 normal ${T}`), c = nova(`LOTE1 apagar ${T}`)
console.log('tarefas', a, b, 'negócio', negocio)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
page.on('dialog', (d) => d.accept())
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
await page.goto(BASE + '/tarefas', { waitUntil: 'networkidle' })
await page.waitForSelector(`text=LOTE1 sumida ${T}`, { timeout: 20000 })

const linha = (titulo) => page.getByText(titulo, { exact: true }).locator('xpath=ancestor::div[.//button[@aria-label="Excluir" or normalize-space()="Excluir"] and .//button[contains(@aria-label,"Concluir") or contains(@title,"Concluir")]][1]')

// 1. concluir tarefa que sumiu por trás → avisa, não risca
const copia = sql(`select row_to_json(t)::text from tarefas t where id=${a}`)
sql(`delete from tarefas where id=${a}`)
await linha(`LOTE1 sumida ${T}`).getByRole('button', { name: 'Concluir tarefa' }).click()
await espera(1500)
let t = await toasts(page)
confere(t.some((x) => /Nada foi gravado/.test(x)), `concluir tarefa sumida avisa (${JSON.stringify(t).slice(0, 110)})`)
confere(await page.locator(`text=LOTE1 sumida ${T}`).count() >= 1, 'a tarefa não foi tirada da lista como se tivesse concluído')

// 2. excluir tarefa que sumiu por trás → avisa, continua na lista
const antesExc = (await toasts(page)).filter((x) => /Nada foi gravado/.test(x)).length
await espera(4500)
await linha(`LOTE1 sumida ${T}`).getByRole('button', { name: 'Excluir' }).click()
await espera(1500)
t = await toasts(page)
confere(t.filter((x) => /Nada foi gravado/.test(x)).length > 0 && await page.locator(`text=LOTE1 sumida ${T}`).count() >= 1, `excluir tarefa sumida avisa e a tarefa fica (${JSON.stringify(t).slice(0, 110)})`)
sql(`insert into tarefas select * from json_populate_record(null::tarefas, '${copia.replace(/'/g, "''")}')`)

// 3. caminho normal: concluir e excluir de verdade (página recarregada: a tarefa reposta volta)
await page.goto(BASE + '/tarefas', { waitUntil: 'networkidle' }); await espera(800)
await linha(`LOTE1 normal ${T}`).getByRole('button', { name: 'Concluir tarefa' }).click()
await espera(1500)
confere(sql(`select concluida from tarefas where id=${b}`) === 't', 'concluir de verdade grava')
await linha(`LOTE1 apagar ${T}`).getByRole('button', { name: 'Excluir' }).click()
await espera(1500)
confere(sql(`select count(*) from tarefas where id=${c}`) === '0' && await page.locator(`text=LOTE1 apagar ${T}`).count() === 0, 'excluir de verdade apaga e some da lista')

sql(`delete from tarefas where titulo like 'LOTE1 % ${T}'`)
await browser.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
