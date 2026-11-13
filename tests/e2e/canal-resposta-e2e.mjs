// POR ONDE RESPONDER (13/11/2026, itens 3 e 4 do levantamento de multinúmero) — app LOCAL :3010 +
// Supabase LOCAL. A Edge NÃO roda local (sem edge-runtime e sem token da Meta): o envio é
// interceptado no navegador e o teste confere O QUE o card/a Comunicação pediram à Edge (ação +
// canalId). A conferência do canal pela Edge tem teste Deno próprio (canal-resposta.test.ts).
// Cria a própria cena (contatos, negócios, conversas, mensagens e um 2º WhatsApp de TESTE) e desfaz.
// Cobre: origem "WhatsApp", "Loja física" e vazia com conversa de WhatsApp saem pelo canal da
// conversa; dois números na mesma loja (pré-seleção no do cliente, troca no "Responder por");
// rótulo por mensagem; card sem conversa avisa ANTES e grava anotação; vendedor de outra loja não
// resolve o card; Comunicação manda o canal da conversa.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = `host=127.0.0.1 port=${process.env.DB_PORT ?? 54322} dbname=postgres user=postgres password=postgres`
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()

const uid = (email) => sql(`select id from auth.users where email='${email}'`)
const DONO = uid(E.dono), VM = uid(E.vend_mogi), VJ = uid(E.vend_jag)
const lojaDe = (u) => sql(`select filial_id from empresa_usuarios where empresa_id=1 and usuario_id='${u}'`)
const MOGI = lojaDe(VM), JAG = lojaDe(VJ)
// Vendedor de Jaguariúna de teste está INATIVO na cópia: ativo só aqui, só no banco local.
const vjAtivoAntes = sql(`select ativo from empresa_usuarios where empresa_id=1 and usuario_id='${VJ}'`)
sql(`update empresa_usuarios set ativo=true where empresa_id=1 and usuario_id='${VJ}'`)
const filialDonoAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
const WA_MOGI = sql(`select id from canais where empresa_id=1 and tipo='whatsapp' and filial_id=${MOGI} and status='ativo' order by conectado_em desc limit 1`)
const WA_JAG = sql(`select id from canais where empresa_id=1 and tipo='whatsapp' and filial_id=${JAG} and status='ativo' order by conectado_em desc limit 1`)
console.log('lojas', MOGI, JAG, '| WhatsApp Mogi', WA_MOGI, '| WhatsApp Jag', WA_JAG)
confere(WA_MOGI && WA_JAG, 'um WhatsApp ativo em cada loja na cópia local')
// Segundo número de TESTE em Jaguariúna, conectado DEPOIS (o "mais recente" de antes).
const WA_JAG2 = sql(`insert into canais (empresa_id, filial_id, tipo, external_id, waba_id, nome_exibicao, status, conectado_em)
  values (1, ${JAG}, 'whatsapp', 'teste-e2e-${T}', 'waba-teste', '+55 19 90000-1111 · Teste', 'ativo', now()) returning id`).split('\n')[0]

const funil = sql(`select id from funis where empresa_id=1 and padrao order by id limit 1`)
const etapa = sql(`select id from funil_etapas where empresa_id=1 and funil_id=${funil} and ativo and coalesce(tipo,'') not in ('ganho','perdido') order by ordem limit 1`)
const slugEtapa = sql(`select slug from funil_etapas where id=${etapa}`)
const criados = { contatos: [], canais: [WA_JAG2] }
let n = 0
function cena(loja, origem, conversas) {
  n++
  const fone = `55199007${String(1000 + n)}`
  const orig = origem == null ? 'null' : `'${origem}'`
  const c = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo, origem) values (1, ${loja}, 'Canal e2e ${n} ${T}', '${fone}', '+${fone}', 'pessoa', ${orig}) returning id`).split('\n')[0]
  criados.contatos.push(c)
  const neg = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, dados) values (1, ${loja}, ${c}, ${funil}, ${etapa}, null, '{"_lead":{"kanban_status":"${slugEtapa}","ativo":true}}') returning id`).split('\n')[0]
  const conv = {}
  for (const { canal, horas } of conversas) {
    const cv = sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id) values (1, ${loja}, ${c}, ${canal}) returning id`).split('\n')[0]
    sql(`insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, origem, canal_id, created_at)
      values (1, ${loja}, ${cv}, ${c}, 'recebida', 'oi do e2e ${n}', 'whatsapp', ${canal}, now() - interval '${horas} hours')`)
    conv[canal] = cv
  }
  return { c, neg, conv }
}
const C_WHATS = cena(JAG, 'WhatsApp', [{ canal: WA_JAG, horas: 1 }])
const C_LOJA = cena(MOGI, 'Loja física', [{ canal: WA_MOGI, horas: 2 }])
const C_NULA = cena(JAG, null, [{ canal: WA_JAG, horas: 3 }])
const C_DOIS = cena(JAG, 'whatsapp', [{ canal: WA_JAG2, horas: 30 }, { canal: WA_JAG, horas: 1 }])
const C_SEM = cena(MOGI, 'manual', [])
console.log('negócios', [C_WHATS, C_LOJA, C_NULA, C_DOIS, C_SEM].map((x) => x.neg).join(','))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(180000)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
  // O envio à Edge fica no navegador: guarda o pedido e responde 200.
  const pedidos = []
  await page.route('**/functions/v1/webhook-leads**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') pedidos.push({ acao: new URL(req.url()).searchParams.get('action'), corpo: JSON.parse(req.postData() || '{}') })
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: '{"ok":true}' })
  })
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  return { ctx, page, pedidos }
}
const api = (page, url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, j: await r.json().catch(() => null) } }, url)
const loja = (page, id) => page.evaluate(async (f) => (await fetch('/api/filial/selecionar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filialId: f }) })).status, Number(id))

async function abrirCard(page, neg) {
  await page.goto(`${BASE}/leads?lead=${neg}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => /Responder por|nenhum canal desta loja/.test(document.body.innerText), null, { timeout: 300000 })
}
async function responder(page, pedidos, texto) {
  const antes = pedidos.length
  const campo = page.locator('textarea').last()
  await campo.fill(texto)
  await campo.press('Enter')
  await page.waitForFunction((t) => document.body.innerText.includes(t), texto, { timeout: 60000 })
  await page.waitForTimeout(1500)
  return pedidos.slice(antes)
}

try {
  // ── Dono (as duas lojas) ────────────────────────────────────────────────
  sql(`update usuarios set filial_atual_id=${JAG} where id='${DONO}'`)
  const d = await entrar(E.dono)
  const rotuloJag = sql(`select nome_exibicao from canais where id=${WA_JAG}`).split('·')[0].replace(/\D/g, '').slice(-4)

  // Resolvedor pela rota: origem não entra.
  // O dono enxerga a loja selecionada no topo (RLS): troca antes de cada consulta.
  for (const [nome, x, canal, lj] of [['WhatsApp', C_WHATS, WA_JAG, JAG], ['Loja física', C_LOJA, WA_MOGI, MOGI], ['vazia', C_NULA, WA_JAG, JAG]]) {
    await loja(d.page, lj)
    const r = await api(d.page, `/api/leads/${x.neg}/canais`)
    confere(r.status === 200 && String(r.j?.sugerido?.canalId) === String(canal) && r.j?.motivo === 'ultima_recebida',
      `rota: origem ${nome} → canal ${canal} pela última recebida (${r.status} ${r.j?.sugerido?.canalId} ${r.j?.motivo})`)
  }
  await loja(d.page, MOGI)
  const sem = await api(d.page, `/api/leads/${C_SEM.neg}/canais`)
  await loja(d.page, JAG)
  confere(sem.j?.motivo === 'sem_canal' && sem.j?.sugerido === null, `rota: card sem conversa → sem canal (${sem.j?.motivo})`)

  // Card com origem "WhatsApp": sai pelo WhatsApp da conversa.
  await abrirCard(d.page, C_WHATS.neg)
  const txt = await d.page.evaluate(() => document.body.innerText)
  confere(txt.includes(`WhatsApp ·${rotuloJag}`), `card: "Responder por WhatsApp ·${rotuloJag}" e rótulo na mensagem`)
  let p = await responder(d.page, d.pedidos, `resposta e2e A ${T}`)
  confere(p.length === 1 && p[0].acao === 'send' && String(p[0].corpo.canalId) === String(WA_JAG),
    `card origem "WhatsApp": envio pela Edge, ação send, canal ${WA_JAG} (${JSON.stringify(p.map((x) => [x.acao, x.corpo.canalId]))})`)
  confere(sql(`select count(*) from mensagens where contato_id=${C_WHATS.c} and canal_id is null and direcao='enviada'`) === '0', 'card origem "WhatsApp": nada virou anotação')

  // Origem vazia (Jaguariúna).
  await abrirCard(d.page, C_NULA.neg)
  p = await responder(d.page, d.pedidos, `resposta e2e B ${T}`)
  confere(p.length === 1 && p[0].acao === 'send' && String(p[0].corpo.canalId) === String(WA_JAG), `card origem vazia: send pelo canal ${WA_JAG}`)

  // Dois números na mesma loja: pré-seleciona o do cliente (não o conectado por último); troca.
  await abrirCard(d.page, C_DOIS.neg)
  const sel = d.page.locator('select[aria-label="Responder por"]')
  confere(await sel.count() === 1, 'dois números na loja: aparece o seletor "Responder por"')
  confere(await sel.inputValue() === String(WA_JAG), `pré-selecionado o número em que o cliente escreveu por último (${await sel.inputValue()})`)
  const opcoes = await sel.locator('option').allInnerTexts()
  confere(opcoes.length === 2 && opcoes.some((o) => o.includes('·1111')), `opções: ${opcoes.join(' | ')}`)
  const corpo = await d.page.evaluate(() => document.body.innerText)
  confere(corpo.includes('WhatsApp ·1111') && corpo.includes(`WhatsApp ·${rotuloJag}`), 'rótulo de cada mensagem mostra o número dela')
  if (process.env.FOTOS) await d.page.screenshot({ path: `${process.env.FOTOS}/card-dois-numeros.png` })
  p = await responder(d.page, d.pedidos, `resposta e2e C ${T}`)
  confere(p.length === 1 && String(p[0].corpo.canalId) === String(WA_JAG), 'envio pelo pré-selecionado')
  await sel.selectOption(String(WA_JAG2))
  await d.page.waitForTimeout(500)
  confere(/mais de 24h que o cliente não escreve no WhatsApp ·1111/.test(await d.page.evaluate(() => document.body.innerText)), 'trocar para o número sem conversa recente mostra o aviso de 24 h DAQUELE número')
  p = await responder(d.page, d.pedidos, `resposta e2e D ${T}`)
  confere(p.length === 1 && String(p[0].corpo.canalId) === String(WA_JAG2), `envio pelo escolhido à mão (${p[0]?.corpo.canalId})`)

  // Card sem conversa: aviso ANTES de escrever; grava anotação, não chama a Edge.
  confere(await loja(d.page, MOGI) === 200, 'dono troca para Mogi')
  await abrirCard(d.page, C_SEM.neg)
  confere(/não tem conversa em nenhum canal desta loja/.test(await d.page.evaluate(() => document.body.innerText)), 'card sem conversa: aviso de anotação aparece antes de enviar')
  if (process.env.FOTOS) await d.page.screenshot({ path: `${process.env.FOTOS}/card-sem-canal.png` })
  p = await responder(d.page, d.pedidos, `anotacao e2e ${T}`)
  confere(p.length === 0, 'card sem conversa: nenhuma chamada à Edge')
  confere(sql(`select count(*) from mensagens where contato_id=${C_SEM.c} and canal_id is null and origem='manual' and direcao='enviada'`) === '1', 'card sem conversa: gravou 1 anotação (origem manual, sem canal)')

  // Origem "Loja física" (Mogi).
  await abrirCard(d.page, C_LOJA.neg)
  p = await responder(d.page, d.pedidos, `resposta e2e E ${T}`)
  confere(p.length === 1 && p[0].acao === 'send' && String(p[0].corpo.canalId) === String(WA_MOGI), `card origem "Loja física": send pelo canal ${WA_MOGI}`)

  // Comunicação: manda o canal da conversa.
  await d.page.goto(`${BASE}/comunicacao?c=${C_LOJA.conv[WA_MOGI]}`, { waitUntil: 'networkidle' })
  const campo = d.page.locator('textarea[placeholder="Escreva a resposta…"]')
  await campo.waitFor({ timeout: 300000 })
  const antes = d.pedidos.length
  await campo.fill(`comunicacao e2e ${T}`); await campo.press('Enter')
  await d.page.waitForTimeout(2500)
  p = d.pedidos.slice(antes)
  confere(p.length === 1 && p[0].acao === 'send' && String(p[0].corpo.canalId) === String(WA_MOGI), `Comunicação: send com o canal da conversa (${JSON.stringify(p.map((x) => x.corpo.canalId))})`)
  await d.ctx.close()

  // ── Vendedores: cada um só resolve a própria loja ───────────────────────
  const vm = await entrar(E.vend_mogi)
  const deJag = await api(vm.page, `/api/leads/${C_WHATS.neg}/canais`)
  confere(deJag.status === 404, `vendedor de Mogi não resolve card de Jaguariúna (${deJag.status})`)
  const daMogi = await api(vm.page, `/api/leads/${C_LOJA.neg}/canais`)
  confere(String(daMogi.j?.sugerido?.canalId) === String(WA_MOGI), 'vendedor de Mogi resolve o card dele')
  await vm.ctx.close()
  const vj = await entrar(E.vend_jag)
  const r = await api(vj.page, `/api/leads/${C_DOIS.neg}/canais`)
  confere(r.status === 200 && r.j?.canais?.filter((c) => c.podeResponder).length === 2, `vendedor de Jaguariúna vê os dois números da loja (${r.j?.canais?.length})`)
  await vj.ctx.close()
} catch (e) {
  falha('exceção: ' + String(e?.stack ?? e).slice(0, 400))
} finally {
  await browser.close()
  const cs = criados.contatos.join(',')
  if (cs) {
    sql(`delete from mensagens where contato_id in (${cs}); delete from conversas where contato_id in (${cs}); delete from negocio_historico where negocio_id in (select id from negocios where contato_id in (${cs})); delete from negocios where contato_id in (${cs}); delete from contato_identidades where contato_id in (${cs}); delete from contatos where id in (${cs});`)
  }
  sql(`delete from canais where id in (${criados.canais.join(',')})`)
  sql(`update empresa_usuarios set ativo=${vjAtivoAntes === 't'} where empresa_id=1 and usuario_id='${VJ}'`)
  sql(`update usuarios set filial_atual_id=${filialDonoAntes} where id='${DONO}'`)
  const sobra = sql(`select (select count(*) from contatos where nome like 'Canal e2e %${T}') + (select count(*) from canais where external_id='teste-e2e-${T}')`)
  confere(sobra === '0', `limpeza: nada sobrou (${sobra})`)
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
