// Views lote 1 — app LOCAL :3010 contra o Supabase LOCAL, com as 8 views JÁ derrubadas no local.
//  (A) transferir unidade Mogi -> Jaguariúna grava as 2 linhas em estoque_movimentacoes, e o Histórico do /estoque as mostra (embed produto + usuário)
//  (B) unidade: editar e salvar grava; salvar com a unidade fora da vista avisa "Nada foi gravado"; remover grava ativo=false
//  (C) /catalogo abre com subcategoria (embed estoque_subcategorias)
//  (D) /estoque/imei registra consulta em estoque_imei_consultas e a lista mostra
//  (E) webhook de pagamento lê financeiro_webhook_eventos sem erro (ref desconhecida = naoEncontrada)
//  (F) nenhuma das 8 views existe mais no local
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
const T = Date.now()

// (F) antes de tudo
const VIEWS = ['pre_vendas', 'movimentacao_estoque', 'veiculo_dados', 'subcategorias_produtos', 'imei_consultas', 'payment_webhook_eventos', 'fipe_consultas', 'fipe_referencia']
confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${VIEWS.map((v) => `'${v}'`).join(',')})`) === '0', 'as 8 views não existem no local')

sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const unid = sql(`select u.id from estoque_unidades u join estoque_produtos p on p.id=u.produto_id where u.empresa_id=1 and u.filial_id=3 and u.ativo and u.status='disponivel' order by u.id desc limit 1`)
const foto = sql(`select row_to_json(u)::text from estoque_unidades u where id=${unid}`)
const snap = JSON.parse(foto)
const movMax = sql(`select coalesce(max(id),0) from estoque_movimentacoes`)
const imeiMax = sql(`select coalesce(max(id),0) from estoque_imei_consultas`)
const subcat = sql(`select s.nome from estoque_produtos p join estoque_subcategorias s on s.id=p.subcategoria_id where p.empresa_id=1 and p.ativo limit 1`)
console.log('unidade', unid, 'produto', snap.produto_id, 'subcategoria', subcat || '(nenhum produto com subcategoria)')

const restaura = () => sql(`update estoque_unidades set filial_id=${snap.filial_id ?? 'null'}, status=${snap.status ? `'${snap.status}'` : 'null'}, ativo=${snap.ativo}, observacoes=${snap.observacoes == null ? 'null' : `'${String(snap.observacoes).replace(/'/g, "''")}'`}, recebido_em=${snap.recebido_em ? `'${snap.recebido_em}'` : 'null'}, recebido_por=${snap.recebido_por ? `'${snap.recebido_por}'` : 'null'} where id=${unid}`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
try {
  // (A) transferir — no modo Rede (com loja escolhida o UPDATE cai na RLS: defeito antigo, anotado)
  sql(`update usuarios set filial_atual_id=null where id='${DONO}'`)
  const r = await page.evaluate(async ([id, obs]) => {
    const res = await fetch('/api/estoque/transferir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id], filialDestino: 6, observacoes: obs }) })
    return { status: res.status, json: await res.json().catch(() => null) }
  }, [Number(unid), `TESTE VIEWS ${T}`])
  confere(r.status === 200, `transferir responde 200 (${r.status} ${JSON.stringify(r.json).slice(0, 120)})`)
  const movs = sql(`select string_agg(tipo_movimento||'@'||filial_id, ',' order by id) from estoque_movimentacoes where id>${movMax} and observacoes like '%TESTE VIEWS ${T}%'`)
  confere(movs === 'transferencia_saida@3,transferencia_entrada@6', `2 linhas em estoque_movimentacoes (${movs})`)
  confere(!r.json?.aviso, 'sem aviso de histórico não gravado')
  await page.goto(`${BASE}/estoque`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Histórico/ }).click().catch(async () => page.getByText('Histórico', { exact: true }).first().click())
  await espera(800)
  const corpo = await page.locator('body').innerText()
  confere(corpo.includes(`TESTE VIEWS ${T}`), 'Histórico do /estoque (Rede) mostra a transferência')
  const nomeProd = sql(`select nome from estoque_produtos where id=${snap.produto_id}`)
  const linhaHist = page.locator('tr', { hasText: `TESTE VIEWS ${T}` }).first()
  const txtHist = (await linhaHist.count()) ? await linhaHist.innerText() : ''
  confere(txtHist.includes(nomeProd), `a linha do histórico traz o produto pelo embed ("${txtHist.replace(/\s+/g, ' ').slice(0, 110)}")`)
  restaura()
  sql(`delete from estoque_movimentacoes where id>${movMax} and observacoes like '%TESTE VIEWS ${T}%'`)
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)

  // (B) unidade-modal
  const abrirUnidade = async () => {
    await page.goto(`${BASE}/estoque`, { waitUntil: 'networkidle' })
    const busca = page.getByPlaceholder(/Buscar/i).first()
    if (snap.imei && (await busca.count())) { await busca.fill(snap.imei); await espera(600) }
    await page.locator('tr', { hasText: nomeProd }).first().click()
    await page.getByRole('dialog').waitFor({ timeout: 15000 })
    const titulo = await page.getByRole('dialog').innerText()
    return titulo.includes(`#${unid}`)
  }
  confere(await abrirUnidade(), `modal abriu a unidade #${unid}`)
  await page.getByRole('button', { name: 'Editar' }).click()
  const obs = page.getByRole('dialog').locator('textarea').first()
  await obs.fill(`OBS TESTE ${T}`)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await espera(1500)
  confere(sql(`select observacoes from estoque_unidades where id=${unid}`) === `OBS TESTE ${T}`, 'salvar unidade grava')
  confere((await toasts(page)).some((x) => /Unidade atualizada/.test(x)), 'toast "Unidade atualizada"')
  restaura()

  await abrirUnidade()
  await page.getByRole('button', { name: 'Editar' }).click()
  await page.getByRole('dialog').locator('textarea').first().fill(`OBS FORA ${T}`)
  sql(`update estoque_unidades set filial_id=6 where id=${unid}`) // sai da vista de quem está em Mogi
  await page.getByRole('button', { name: 'Salvar' }).click()
  await espera(1500)
  const t1 = await toasts(page)
  confere(t1.some((x) => /Nada foi gravado/.test(x)), `salvar com a unidade fora da vista avisa (${JSON.stringify(t1).slice(0, 120)})`)
  confere(sql(`select coalesce(observacoes,'') from estoque_unidades where id=${unid}`) !== `OBS FORA ${T}`, 'e não gravou')
  restaura()

  await abrirUnidade()
  await page.getByRole('button', { name: 'Remover' }).first().click()
  await page.getByRole('alertdialog').or(page.getByRole('dialog').last()).getByRole('button', { name: 'Remover' }).last().click()
  await espera(1500)
  confere(sql(`select ativo from estoque_unidades where id=${unid}`) === 'f', 'remover grava ativo=false')
  confere((await toasts(page)).some((x) => /Removido do estoque/.test(x)), 'toast "Removido do estoque"')
  restaura()

  // (C) catálogo
  const rc = await page.goto(`${BASE}/catalogo`, { waitUntil: 'networkidle' })
  confere(rc.status() === 200, `/catalogo 200`)
  if (subcat) confere((await page.locator('body').innerText()).includes(subcat), `catálogo mostra a subcategoria "${subcat}"`)

  // (D) check IMEI
  const base14 = String(35000000000000 + (T % 1e13)).slice(0, 14)
  let soma = 0
  for (let i = 0; i < 14; i++) { let d = Number(base14[i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 } soma += d }
  const imei = base14 + String((10 - (soma % 10)) % 10)
  await page.goto(`${BASE}/estoque/imei`, { waitUntil: 'networkidle' })
  const campo = page.locator('input').filter({ hasNot: page.locator('[type=hidden]') }).first()
  await campo.fill(imei)
  await espera(400)
  await page.getByRole('button', { name: /Registrar consulta/ }).click()
  await espera(1500)
  confere(sql(`select count(*) from estoque_imei_consultas where id>${imeiMax} and imei='${imei}'`) === '1', `consulta de IMEI gravada em estoque_imei_consultas (${imei})`)
  await page.reload({ waitUntil: 'networkidle' })
  confere((await page.locator('body').innerText()).replace(/\D/g, '').includes(imei), 'lista de consultas mostra o IMEI')
  sql(`delete from estoque_imei_consultas where id>${imeiMax} and imei='${imei}'`)

  // (E) webhook
  const w = await page.evaluate(async () => {
    const res = await fetch('/api/payments/webhook/mercadopago', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: 'teste-views-inexistente' } }) })
    return { status: res.status, json: await res.json().catch(() => null) }
  })
  confere(w.status === 200 && (w.json?.naoEncontrada || w.json?.ignorado), `webhook: ${w.status} ${JSON.stringify(w.json)}`)
} finally {
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  restaura()
  sql(`delete from estoque_movimentacoes where id>${movMax} and observacoes like '%TESTE VIEWS ${T}%'`)
  sql(`delete from estoque_imei_consultas where id>${imeiMax}`)
  const depois = sql(`select row_to_json(u)::text from estoque_unidades u where id=${unid}`)
  const d = JSON.parse(depois)
  for (const k of ['filial_id', 'status', 'ativo', 'observacoes', 'recebido_em', 'recebido_por']) if (JSON.stringify(d[k]) !== JSON.stringify(snap[k])) falha(`unidade não voltou igual em ${k}: ${d[k]} x ${snap[k]}`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
