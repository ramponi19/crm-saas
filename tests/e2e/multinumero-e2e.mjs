// MAIS DE UM NÚMERO POR LOJA (23/11/2026, itens 1, 5 e 6) — app LOCAL :3010 + Supabase LOCAL com a
// migração 20261123000100 aplicada. Cria um 2º WhatsApp de TESTE em Jaguariúna, um modelo de TESTE
// aprovado só nele, e desfaz tudo no fim. A Edge não roda local: o envio da Transmissão não é
// disparado (a conferência da Edge tem teste Deno); aqui vale o que o app e o banco decidem.
// Cobre: tela de Canais com os dois números (item 1); /api/modelos pelo número escolhido e recusa
// de número de outra loja (item 6); Transmissão exige escolher o número, grava canal_id, o gatilho
// recusa número de outra loja e o transmissao_montar confere o modelo NO número (item 5).
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = `host=127.0.0.1 port=${process.env.DB_PORT ?? 54322} dbname=postgres user=postgres password=postgres`
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const sqlErro = (q) => { try { sql(q); return null } catch (e) { return String(e.stderr || e.message) } }
const comoRls = (uid, q) => sql(`begin; set local role authenticated; set local request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; ${q}; rollback;`)
const comoRlsErro = (uid, q) => { try { comoRls(uid, q); return null } catch (e) { return String(e.stderr || e.message) } }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()

const uid = (email) => sql(`select id from auth.users where email='${email}'`)
const DONO = uid(E.dono)
const MOGI = 3, JAG = 6
const WA_MOGI = sql(`select id from canais where empresa_id=1 and tipo='whatsapp' and filial_id=${MOGI} and status='ativo' order by conectado_em desc limit 1`)
const WA_JAG = sql(`select id from canais where empresa_id=1 and tipo='whatsapp' and filial_id=${JAG} and status='ativo' order by conectado_em desc limit 1`)
const WABA_JAG2 = `waba-teste-${T}`
const WA_JAG2 = sql(`insert into canais (empresa_id, filial_id, tipo, external_id, waba_id, nome_exibicao, status, conectado_em, access_token_enc)
  values (1, ${JAG}, 'whatsapp', 'teste-e2e-${T}', '${WABA_JAG2}', '+55 19 90000-1111 · Teste', 'ativo', now() - interval '1 day', null) returning id`).split('\n')[0]
console.log('WhatsApp Mogi', WA_MOGI, '| Jag', WA_JAG, '| Jag 2 (teste)', WA_JAG2)
confere(WA_MOGI && WA_JAG && WA_JAG2, 'dois números em Jaguariúna (um de teste) e um em Mogi')

// Modelo de TESTE aprovado SÓ no número de teste.
const MODELO = sql(`insert into modelos_mensagem (empresa_id, nome, idioma, categoria, corpo, status)
  values (1, 'teste_multinumero_${T}', 'pt_BR', 'MARKETING', 'Oi! Teste do multinumero.', 'aprovado') returning id`).split('\n')[0]
sql(`insert into modelos_mensagem_wabas (modelo_id, empresa_id, waba_id, status) values (${MODELO}, 1, '${WABA_JAG2}', 'aprovado')`)
// Card de Jaguariúna para a rota de modelos (um negócio qualquer da loja, só leitura).
const CARD_JAG = sql(`select id from negocios where empresa_id=1 and filial_id=${JAG} order by id desc limit 1`)
const transmAntes = sql(`select ativo::text from empresa_modulos where empresa_id=1 and modulo='transmissao'`)
const filialDonoAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
const criadas = []

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  // Transmissão ligada só no banco local (o proxy guarda módulos por 60 s: esperar antes da tela).
  sql(`insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'transmissao', true)
       on conflict (empresa_id, modulo) do update set ativo = true`)
  sql(`update usuarios set filial_atual_id=${JAG} where id='${DONO}'`)
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(180000)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', E.dono)
  await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  const api = (url, init) => page.evaluate(async ([u, i]) => {
    const r = await fetch(u, i ? { ...i, headers: { 'Content-Type': 'application/json' } } : undefined)
    return { status: r.status, j: await r.json().catch(() => null) }
  }, [url, init])
  confere((await api('/api/filial/selecionar', { method: 'POST', body: JSON.stringify({ filialId: JAG }) })).status === 200, 'dono em Jaguariúna')

  // ── Item 1: tela de Canais ──
  await page.goto(BASE + '/canais', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-canal-id]', { timeout: 300000 })
  const linhas = await page.$$eval('[data-canal-id]', (els) => els.map((e) => e.getAttribute('data-canal-id')))
  confere(linhas.includes(String(WA_JAG)) && linhas.includes(String(WA_JAG2)), `tela de Canais: os dois WhatsApp de Jaguariúna aparecem (${linhas.join(',')})`)
  const texto = await page.evaluate(() => document.body.innerText)
  // Sem as credenciais da Meta (o local não tem), o botão do WhatsApp fica em "Carregando conector…".
  if (/Conexão indisponível/.test(texto)) {
    confere(/Conectar outra conta/.test(texto), 'botão de somar conta aparece (Instagram); o do WhatsApp não é verificável no local: sem credenciais da Meta')
  } else confere(/Conectar outro número/.test(texto), 'botão "Conectar outro número"')
  confere(/Mais de um número atende a mesma loja/.test(texto), 'aviso de dois números na mesma loja')
  confere(/90000-1111/.test(texto) && /98944-7419|7419/.test(texto), 'cada linha com o seu número')
  confere(!/nasce na loja\s+principal/.test(texto), 'texto antigo ("nasce na loja principal") saiu')
  if (process.env.FOTOS) await page.screenshot({ path: `${process.env.FOTOS}/canais-dois-numeros.png`, fullPage: true })

  // ── Item 6: modelos pelo número escolhido ──
  const m2 = await api(`/api/modelos?negocio=${CARD_JAG}&canal=${WA_JAG2}`)
  confere(m2.status === 200 && (m2.j?.envio?.aprovados ?? []).map(String).includes(String(MODELO)), `modelos do número de teste: inclui o aprovado só nele (${m2.status})`)
  const m1 = await api(`/api/modelos?negocio=${CARD_JAG}&canal=${WA_JAG}`)
  confere(m1.status === 200 && !(m1.j?.envio?.aprovados ?? []).map(String).includes(String(MODELO)), 'modelos do outro número: não inclui')
  const mOutra = await api(`/api/modelos?negocio=${CARD_JAG}&canal=${WA_MOGI}`)
  confere(mOutra.status === 409, `número de outra loja recusado (${mOutra.status} ${mOutra.j?.error ?? ''})`)
  const rotulos = (m2.j?.modelos ?? []).find((m) => String(m.id) === String(MODELO))?.numeros?.map((n) => n.lojas) ?? []
  // A lista de números da tela de modelos só tem canal com token decifrável (o local não tem a chave do cofre).
  if (rotulos.length) confere(rotulos.every((r) => /·\d{4}|·\?/.test(r)), `tela de modelos nomeia o número (${rotulos.join(' | ')})`)
  else console.log('—    tela de modelos nomeia o número: não verificável no local (sem a chave do cofre, nenhum número entra na lista); coberto pelo unitário')

  // ── Item 5: Transmissão ──
  await espera(65000) // TTL dos módulos no proxy
  const g = await api('/api/transmissao')
  confere(g.status === 200 && (g.j?.canais ?? []).some((c) => String(c.id) === String(WA_JAG2)), `GET da Transmissão traz os números (${g.status})`)
  const base = { op: 'criar', nome: `Teste multinumero ${T}`, filial_id: JAG, modelo_id: Number(MODELO), parametros: [], filtro: {} }
  const semNumero = await api('/api/transmissao', { method: 'POST', body: JSON.stringify(base) })
  confere(semNumero.status === 400 && /mais de um número/.test(semNumero.j?.error ?? ''), `criar sem escolher o número: recusado (${semNumero.status})`)
  const noOutro = await api('/api/transmissao', { method: 'POST', body: JSON.stringify({ ...base, canal_id: Number(WA_JAG) }) })
  confere(noOutro.status === 400 && /não está aprovado pela Meta neste número/.test(noOutro.j?.error ?? ''), `modelo não aprovado no número escolhido: recusado (${noOutro.status})`)
  const certo = await api('/api/transmissao', { method: 'POST', body: JSON.stringify({ ...base, canal_id: Number(WA_JAG2) }) })
  confere(certo.status === 200 && certo.j?.id, `criar pelo número de teste (${certo.status} ${certo.j?.error ?? ''})`)
  const TX = certo.j?.id; if (TX) criadas.push(TX)
  confere(TX && sql(`select canal_id from transmissoes where id=${TX}`) === String(WA_JAG2), 'transmissoes.canal_id gravado')
  // Gatilho: número de outra loja / de outra empresa / desconectado.
  confere(/outra loja/.test(sqlErro(`update transmissoes set canal_id=${WA_MOGI} where id=${TX}`) ?? ''), 'gatilho recusa número de outra loja')
  const IG = sql(`select id from canais where empresa_id=1 and tipo='instagram' limit 1`)
  confere(/WhatsApp/.test(sqlErro(`update transmissoes set canal_id=${IG} where id=${TX}`) ?? ''), 'gatilho recusa canal que não é WhatsApp')
  // transmissao_montar confere a aprovação NO número (na sessão do dono, transação desfeita).
  const errAprovado = comoRlsErro(DONO, `select transmissao_montar(${TX})`)
  confere(!/não está aprovado/.test(errAprovado ?? ''), `montar: modelo aprovado no número passa da conferência (${(errAprovado ?? 'ok').split('\n')[0].slice(0, 90)})`)
  sql(`update modelos_mensagem_wabas set status='rejeitado' where modelo_id=${MODELO}`)
  const errReprovado = comoRlsErro(DONO, `select transmissao_montar(${TX})`)
  confere(/não está aprovado no número escolhido/.test(errReprovado ?? ''), 'montar: modelo reprovado no número é recusado')
  sql(`update modelos_mensagem_wabas set status='aprovado' where modelo_id=${MODELO}`)

  // Tela: nova transmissão em Jaguariúna pede o número.
  await page.goto(BASE + '/transmissao', { waitUntil: 'networkidle' })
  const novo = page.getByRole('button', { name: /Nova transmissão/i }).first()
  if (await novo.count()) {
    await novo.click()
    await page.waitForSelector('[data-transmissao-form]', { timeout: 120000 })
    const sel = page.locator('[data-transmissao-form] select').first()
    if (await sel.count()) { try { await sel.selectOption(String(JAG)) } catch { /* loja única no select */ } }
    await page.waitForTimeout(800)
    confere(await page.locator('[data-transmissao-numero]').count() === 1, 'tela: "Número que envia" aparece em Jaguariúna')
    if (process.env.FOTOS) await page.screenshot({ path: `${process.env.FOTOS}/transmissao-numero.png`, fullPage: true })
  } else falha('tela: botão "Nova transmissão" não encontrado')
  await ctx.close()
} catch (e) {
  falha('exceção: ' + String(e?.stack ?? e).slice(0, 400))
} finally {
  await browser.close()
  for (const id of criadas) sql(`delete from transmissao_envios where transmissao_id=${id}; delete from transmissoes where id=${id};`)
  sql(`delete from transmissoes where nome like 'Teste multinumero ${T}%'`)
  sql(`delete from modelos_mensagem_wabas where modelo_id=${MODELO}; delete from modelos_mensagem where id=${MODELO};`)
  sql(`delete from canais where id=${WA_JAG2}`)
  if (transmAntes === '') sql(`delete from empresa_modulos where empresa_id=1 and modulo='transmissao'`)
  else sql(`update empresa_modulos set ativo=${transmAntes === 'true'} where empresa_id=1 and modulo='transmissao'`)
  sql(`update usuarios set filial_atual_id=${filialDonoAntes} where id='${DONO}'`)
  const sobra = sql(`select (select count(*) from canais where external_id='teste-e2e-${T}') + (select count(*) from modelos_mensagem where nome='teste_multinumero_${T}') + (select count(*) from transmissoes where nome like 'Teste multinumero ${T}%')`)
  confere(sobra === '0', `limpeza: nada sobrou (${sobra})`)
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
