// Item 4 (05/11/2026): dependências entre módulos — app LOCAL :3010, Supabase LOCAL, empresa 1 (JM), dono.
// Rodar: node tests/e2e/dependencias-e2e.mjs (ver tests/e2e/LEIA-ME.md)
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const MODS = `'estoque','pdv','assistencia','avaliacoes'`
const ativo = (m) => sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='${m}'),'sem linha')`)

// Foto das linhas de empresa_modulos da JM para devolver no fim.
sql(`drop table if exists public._e2e_mod; create table public._e2e_mod as select * from empresa_modulos where empresa_id=1 and modulo in (${MODS})`)
const pedidosAntes = sql(`select count(*) from modulo_pedidos where empresa_id=1`)
console.log('antes:', sql(`select string_agg(modulo||'='||ativo, ' ' order by modulo) from empresa_modulos where empresa_id=1 and modulo in (${MODS})`))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])
const tile = (chave) => page.locator(`#modulo-${chave}`)
try {
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])

  // 1. Estoque com PDV e Assistência ligados: não desinstala, e diz quem usa.
  await page.goto(BASE + '/modulos', { waitUntil: 'networkidle' })
  const tEst = await tile('estoque').innerText()
  confere(/Usado por PDV, Assistência/.test(tEst), `tile do Estoque diz quem usa (${tEst.replace(/\n/g, ' | ').slice(0, 120)})`)
  confere(await tile('estoque').getByRole('button', { name: 'Desinstalar' }).isDisabled(), 'botão Desinstalar do Estoque desligado')
  let r = await api('/api/modulos/instalar', 'POST', { chave: 'estoque', instalar: false })
  confere(r.status === 409 && /usado por PDV, Assistência/.test(r.json?.error ?? ''), `API recusa desinstalar Estoque: ${r.status} ${r.json?.error}`)
  confere(ativo('estoque') !== 'false', 'Estoque segue ligado no banco')

  // 2. Tira Assistência e PDV (sem dependente: passam); aí o Estoque sai.
  r = await api('/api/modulos/instalar', 'POST', { chave: 'assistencia', instalar: false })
  confere(r.status === 200, `desinstalar Assistência: ${r.status}`)
  r = await api('/api/modulos/instalar', 'POST', { chave: 'estoque', instalar: false })
  confere(r.status === 409 && /usado por PDV:/.test(r.json?.error ?? ''), `Estoque ainda preso só pelo PDV: ${r.json?.error}`)
  r = await api('/api/modulos/instalar', 'POST', { chave: 'pdv', instalar: false })
  confere(r.status === 200, `desinstalar PDV: ${r.status}`)
  await page.goto(BASE + '/modulos', { waitUntil: 'networkidle' })
  confere(!(await tile('estoque').getByRole('button', { name: 'Desinstalar' }).isDisabled()), 'sem dependente, o Desinstalar do Estoque liga')
  await tile('estoque').getByRole('button', { name: 'Desinstalar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Desinstalar' }).click(); await espera(2000)
  confere(ativo('estoque') === 'false', 'Estoque desinstalado pela tela')

  // 3. PDV sem Estoque: a tela avisa, confirma e liga os dois.
  await page.goto(BASE + '/modulos', { waitUntil: 'networkidle' })
  const tPdv = await tile('pdv').innerText()
  confere(/Liga junto: Estoque/.test(tPdv), `tile do PDV avisa "Liga junto: Estoque" (${tPdv.replace(/\n/g, ' | ').slice(0, 100)})`)
  confere(/Liga junto: Estoque/.test(await tile('assistencia').innerText()), 'tile da Assistência também avisa')
  await tile('pdv').getByRole('button', { name: 'Instalar' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor({ timeout: 10000 })
  const textoDlg = await dlg.innerText()
  confere(/Vai ligar também: Estoque/.test(textoDlg), `confirmação diz o que liga junto (${textoDlg.replace(/\n/g, ' | ').slice(0, 140)})`)
  await dlg.getByRole('button', { name: 'Instalar tudo' }).click(); await espera(2500)
  const t = await toasts(page)
  confere(t.some((x) => /PDV instalado, com Estoque/.test(x)), `toast: ${JSON.stringify(t).slice(0, 100)}`)
  confere(ativo('estoque') === 'true' && ativo('pdv') === 'true', `banco: estoque=${ativo('estoque')} pdv=${ativo('pdv')}`)
  const ordem = sql(`select string_agg(modulo, ',' order by instalado_em) from empresa_modulos where empresa_id=1 and modulo in ('estoque','pdv')`)
  confere(ordem === 'estoque,pdv', `Estoque gravado antes do PDV (${ordem})`)
  // O menu já mostra os dois e a trava abre o /pdv.
  const g = await page.goto(BASE + '/pdv', { waitUntil: 'networkidle' })
  confere(g.status() === 200 && new URL(page.url()).pathname === '/pdv', `/pdv abre depois de instalar (${page.url()})`)

  // 4. Assistência volta pela API, sem nada junto (Estoque já está ligado).
  r = await api('/api/modulos/instalar', 'POST', { chave: 'assistencia', instalar: true })
  confere(r.status === 200 && Array.isArray(r.json?.junto) && r.json.junto.length === 0, `Assistência instala sem junto: ${r.status} ${JSON.stringify(r.json?.junto)}`)
  // 5. Módulo em preparação (Avaliação, que requer PDV) segue sem instalar.
  r = await api('/api/modulos/instalar', 'POST', { chave: 'avaliacoes', instalar: true })
  confere(r.status === 409, `Avaliação (em preparação) não instala: ${r.status}`)
  // 6. Pedido de módulo que não é pago segue recusado (nenhum pago tem requisito hoje).
  r = await api('/api/modulos/pedido', 'POST', { chave: 'pdv' })
  confere(r.status === 409, `pedido de PDV (não pago) recusado: ${r.status}`)
  confere(sql(`select count(*) from modulo_pedidos where empresa_id=1`) === pedidosAntes, 'nenhum pedido criado')
} catch (e) {
  falha('exceção: ' + String(e).slice(0, 200))
} finally {
  await browser.close()
  sql(`delete from empresa_modulos where empresa_id=1 and modulo in (${MODS}); insert into empresa_modulos select * from public._e2e_mod; drop table public._e2e_mod`)
  console.log('devolvido:', sql(`select string_agg(modulo||'='||ativo, ' ' order by modulo) from empresa_modulos where empresa_id=1 and modulo in (${MODS})`))
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
