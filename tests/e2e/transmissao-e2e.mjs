// TRANSMISSÃO — app LOCAL :3010 (bash tools/dev-local.sh) + Supabase LOCAL + Edge LOCAL (deno, este
// script sobe em :8000) + Graph FALSA (este script, :54999) que só aceita número de teste 5519900….
// Nada sai para cliente: a empresa, as lojas, os usuários, os contatos e o modelo são DE TESTE,
// criados aqui num banco local vazio ou não, e apagados no fim (hard_delete_empresa).
//
// Cobre: módulo (vitrine desligado, Central instala, trava na API); prévia (aptos e quem fica
// fora: opt-out, bloqueado, sem telefone, mesmo modelo em 7 dias — inclusive pelo Automatize);
// tela do dono (filtro → prévia → disparar); teto por hora (o excedente espera, não some);
// cron (pg_cron → /api/cron/automacoes), idempotente; entregue/lida pelo webhook de status;
// resposta → envio marcado + card com a origem "transmissão"; pausar/retomar (a Edge recusa em voo);
// horário de atendimento; encerrar; loja sem WhatsApp; vendedor vê e não dispara (API e RLS);
// vendedor de outra loja não vê; Edge sem chave de serviço = 401.
//
//   node tests/e2e/transmissao-e2e.mjs
import { chromium } from 'playwright-core'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'

const BASE = 'http://localhost:3010', SENHA = 'teste-local-22', CRON = 'cron-local-de-teste'
const EDGE = 'http://127.0.0.1:8000', GRAPH_PORTA = 54999, APP_SECRET = 'segredo-e2e-transmissao'
const CHAVE_CANAL = 'e2e0'.repeat(16) // a mesma de tools/dev-local.sh (só de teste)
const SEGREDO_EDGE = 'edge-interna-local-de-teste' // o mesmo de tools/dev-local.sh (só de teste)
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = `host=127.0.0.1 port=${process.env.DB_PORT ?? 54322} dbname=postgres user=postgres password=postgres`
const env = Object.fromEntries(fs.readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) { console.error('RECUSADO: status.local.env não é o Supabase local'); process.exit(2) }

// O SQL vai pela entrada padrão: no Windows, acento no argumento chega ao psql na página de código errada.
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const um = (q) => sql(q).split('\n')[0]
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()
const fone = (n) => `5519900${String(T).slice(-3)}${String(n).padStart(3, '0')}`

// ── Graph FALSA: só número de teste; guarda o que recebeu ─────────────────────
const graph = []
const servidorGraph = createServer((req, res) => {
  let b = ''
  req.on('data', (c) => { b += c })
  req.on('end', () => {
    const j = (() => { try { return JSON.parse(b) } catch { return {} } })()
    res.setHeader('Content-Type', 'application/json')
    // Só o envio conta (POST …/messages); perfil e mídia, se a Edge pedir, recebem vazio.
    if (req.method !== 'POST' || !String(req.url).endsWith('/messages')) { res.end('{}'); return }
    graph.push({ url: req.url, auth: req.headers.authorization, ...j })
    if (!String(j.to ?? '').startsWith('5519900')) { res.statusCode = 400; res.end(JSON.stringify({ error: { code: 131026, message: 'número fora do teste' } })); return }
    res.end(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: `wamid.E2E${T}.${graph.length}` }] }))
  })
}).listen(GRAPH_PORTA)

// ── Edge LOCAL no deno ────────────────────────────────────────────────────────
const edge = spawn('deno', ['run', '--allow-net', '--allow-env', '--allow-read', 'supabase/functions/webhook-leads/index.ts'], {
  env: {
    ...process.env, SUPABASE_URL: env.API_URL, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: env.ANON_KEY, EDGE_INTERNAL_SECRET: SEGREDO_EDGE,
    META_GRAPH_BASE: `http://127.0.0.1:${GRAPH_PORTA}`, META_APP_SECRET: APP_SECRET, WEBHOOK_VERIFY_TOKEN: 'e2e', CHANNEL_ENCRYPTION_KEY: CHAVE_CANAL,
  }, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32',
})
let logEdge = ''
edge.stdout.on('data', (d) => { logEdge += d }); edge.stderr.on('data', (d) => { logEdge += d })
for (let i = 0; i < 60; i++) { try { await fetch(EDGE, { method: 'OPTIONS' }); break } catch { await espera(1000) } }

// ── Cenário ───────────────────────────────────────────────────────────────────
const cifrar = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(CHAVE_CANAL, 'hex'), iv); const e = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), e.toString('base64')].join('.') }
async function usuarioAuth(email, nome) {
  const r = await fetch(`${env.API_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA, email_confirm: true, user_metadata: { nome } }),
  })
  const j = await r.json(); if (!j.id) throw new Error(`usuário ${email}: ${JSON.stringify(j)}`); return j.id
}
const E = um(`insert into empresas (nome, slug, plano, status) values ('TESTE Transmissão ${T}', 'teste-tx-${T}', 'pro', 'ativo') returning id`)
const LA = um(`insert into filiais (empresa_id, nome, matriz) values (${E}, 'Loja A ${T}', true) returning id`)
const LB = um(`insert into filiais (empresa_id, nome, matriz) values (${E}, 'Loja B ${T}', false) returning id`)
const U = {
  dono: await usuarioAuth(`dono.tx.${T}@teste.local`, 'Dono TX'),
  vendA: await usuarioAuth(`venda.tx.${T}@teste.local`, 'Vendedor A TX'),
  vendB: await usuarioAuth(`vendb.tx.${T}@teste.local`, 'Vendedor B TX'),
}
sql(`insert into empresa_usuarios (empresa_id, usuario_id, role, ativo, filial_id) values
  (${E}, '${U.dono}', 'owner', true, null), (${E}, '${U.vendA}', 'vendedor', true, ${LA}), (${E}, '${U.vendB}', 'vendedor', true, ${LB})`)
const F = um(`insert into funis (empresa_id, nome, padrao, interno) values (${E}, 'Vendas', true, false) returning id`)
const etapa = (slug, label, tipo, ordem) => um(`insert into funil_etapas (empresa_id, funil_id, slug, label, tipo, ordem, cor, probabilidade, campos_obrigatorios, ativo)
  values (${E}, ${F}, '${slug}', '${label}', '${tipo}', ${ordem}, '#7FB0E8', 0, '[]', true) returning id`)
const ET = { novo: etapa('novo', 'Novo', 'normal', 1), proposta: etapa('proposta', 'Proposta', 'negociacao', 2), ganho: etapa('ganho', 'Ganho', 'ganho', 3), perdido: etapa('perdido', 'Perdido', 'perdido', 4) }
const M = um(`insert into modelos_mensagem (empresa_id, nome, idioma, categoria, corpo, status) values (${E}, 'tx_e2e_${T}', 'pt_BR', 'MARKETING', 'Oi {{1}}, chegou novidade na loja.', 'aprovado') returning id`)
const MP = um(`insert into modelos_mensagem (empresa_id, nome, idioma, categoria, corpo, status) values (${E}, 'tx_e2e_pendente_${T}', 'pt_BR', 'MARKETING', 'Oi', 'pendente') returning id`)
const PHONE = `PHONE_E2E_${T}`
const CANAL = um(`insert into canais (empresa_id, filial_id, tipo, external_id, waba_id, nome_exibicao, access_token_enc, status, via, conectado_em)
  values (${E}, ${LA}, 'whatsapp', '${PHONE}', 'WABA_E2E', 'WhatsApp Loja A', '${cifrar('token-falso-e2e')}', 'ativo', 'pagina', now()) returning id`)
sql(`insert into configuracoes_sistema (empresa_id, chave, valor) values (${E}, 'horario_comercial', '{"inicio":"00:00","fim":"23:59","dias":[0,1,2,3,4,5,6]}')`)
// A lista do menu que o cadastro grava (a trava de rota do proxy só barra empresa que tem uma).
sql(`insert into empresa_menu (empresa_id, itens) values (${E}, '{"base":{"habilitados":["/dashboard","/tarefas","/comunicacao","/leads","/clientes"]}}')`)

/** contato + negócio + conversa (última mensagem há `dias`). */
function pessoa(n, nome, { loja = LA, et = 'proposta', status = 'aberto', dias = 40, telefone = true, optOut = false, bloqueado = false } = {}) {
  const f = fone(n)
  const c = um(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, origem, tipo, ativo, opt_out_em)
    values (${E}, ${loja}, '${nome} ${T}', ${telefone ? `'${f}'` : 'null'}, ${telefone ? `'+${f}'` : 'null'}, 'whatsapp', 'pessoa', ${!bloqueado}, ${optOut ? 'now()' : 'null'}) returning id`)
  const neg = um(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, perdido_em, dados)
    values (${E}, ${loja}, ${c}, ${F}, ${ET[et]}, '${status}', ${status === 'ganho' ? "now() - interval '60 days'" : 'null'}, ${status === 'perdido' ? "now() - interval '60 days'" : 'null'}, '{"_lead":{"ativo":true}}') returning id`)
  if (dias != null) sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id, ultima_mensagem_at) values (${E}, ${loja}, ${c}, ${loja === LA ? CANAL : 'null'}, now() - interval '${dias} days')`)
  return { c, neg, fone: f, nome: `${nome} ${T}` }
}
const P = {
  ana: pessoa(1, 'Ana'), bia: pessoa(2, 'Bia'), caio: pessoa(3, 'Caio'), dora: pessoa(4, 'Dora'), edu: pessoa(5, 'Edu', { dias: null }), // Edu: nunca conversou
  bruno: pessoa(6, 'Bruno', { dias: 2 }), // falou há 2 dias: fora do "sem mensagem há 30"
  carla: pessoa(7, 'Carla', { optOut: true }), davi: pessoa(8, 'Davi', { bloqueado: true }), eva: pessoa(9, 'Eva', { telefone: false }),
  fabio: pessoa(10, 'Fabio'), hugo: pessoa(11, 'Hugo', { loja: LB }), // Hugo: Loja B
  gabi: pessoa(12, 'Gabi', { et: 'perdido', status: 'perdido', dias: 60 }), igor: pessoa(13, 'Igor', { et: 'perdido', status: 'perdido', dias: 60 }),
  jade: pessoa(14, 'Jade', { et: 'perdido', status: 'perdido', dias: 60 }), lia: pessoa(15, 'Lia', { et: 'ganho', status: 'ganho', dias: 60 }),
}
// Fabio recebeu ESTE modelo pelo Automatize há 3 dias.
const AUTO = um(`insert into automacoes (empresa_id, etapa_slug, etapa_id, gatilho, acao, modelo_id, ativo, config) values (${E}, 'proposta', ${ET.proposta}, 'entrou_na_etapa', 'enviar_modelo', ${M}, false, '{}') returning id`)
sql(`insert into automacao_execucoes (empresa_id, filial_id, automacao_id, negocio_id, contato_id, acao, modelo_id, status, executada_em)
     values (${E}, ${LA}, ${AUTO}, ${P.fabio.neg}, ${P.fabio.c}, 'enviar_modelo', ${M}, 'executada', now() - interval '3 days')`)
console.log(`cenário: empresa ${E}, lojas ${LA}/${LB}, modelo ${M}, canal ${CANAL}`)

// ── Navegador e chamadas ─────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, corpo) => page.evaluate(async ([u, c]) => { const r = await fetch(u, c ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) } : undefined); return { status: r.status, j: await r.json().catch(() => ({})) } }, [url, corpo])
const tx = (page, corpo) => api(page, '/api/transmissao', corpo)
const cron = async () => { const r = await fetch(`${BASE}/api/cron/automacoes`, { headers: { Authorization: `Bearer ${CRON}` } }); return { s: r.status, j: await r.json().catch(() => ({})) } }
const envios = (t) => sql(`select string_agg(c.nome || ':' || e.status, ' | ' order by c.nome) from transmissao_envios e join contatos c on c.id = e.contato_id where e.transmissao_id = ${t}`)
const conta = (t, st) => Number(um(`select count(*) from transmissao_envios where transmissao_id = ${t} and status = '${st}'`))
const esperaAte = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await espera(500) } return false }
async function webhook(value) {
  const corpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'WABA_E2E', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: PHONE }, ...value } }] }] })
  const sig = crypto.createHmac('sha256', APP_SECRET).update(corpo).digest('hex')
  const r = await fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': `sha256=${sig}` }, body: corpo })
  return r.status
}
const FOTOS = `${import.meta.dirname}/../../.gate`; fs.mkdirSync(FOTOS, { recursive: true })
const FILTRO1 = { etapa_ids: [Number(ET.proposta)], sem_mensagem_ha_dias: 30 }

let dono
try {
  dono = await entrar(`dono.tx.${T}@teste.local`)

  // ── 1. Módulo: desligado = vitrine + API travada; a Central instala ─────────
  let r = await tx(dono)
  confere(r.status === 403 && r.j.code === 'modulo_desligado', `desligado: API 403 modulo_desligado (${r.status})`)
  await dono.goto(BASE + '/transmissao', { waitUntil: 'networkidle' })
  const vitrineEm = Date.now() // a trava do proxy guarda 'desligado' por 1 min para quem não instalou
  confere((await dono.content()).includes('montada por filtro'), 'desligado: a rota mostra a vitrine')
  r = await api(dono, '/api/modulos/instalar', { chave: 'transmissao', instalar: true })
  confere(r.status === 200, `Central instala (HTTP ${r.status} ${JSON.stringify(r.j).slice(0, 120)})`)
  confere(um(`select ativo from empresa_modulos where empresa_id=${E} and modulo='transmissao'`) === 't', 'empresa_modulos ativo')
  await dono.goto(BASE + '/modulos', { waitUntil: 'networkidle' })
  confere(await dono.getByText('Transmissão', { exact: true }).count() > 0, 'tile na Central')

  // ── 2. Prévia ─────────────────────────────────────────────────────────────
  r = await tx(dono, { op: 'previa', filial_id: Number(LA), filtro: FILTRO1, modelo_id: Number(M) })
  const pv = r.j.previa ?? {}
  confere(r.status === 200 && pv.aptos === 5 && pv.opt_out === 1 && pv.bloqueado === 1 && pv.sem_telefone === 1 && pv.modelo_7_dias === 1 && pv.total === 9,
    `prévia: ${JSON.stringify({ ...pv, amostra: undefined })} (5 aptos; fora: opt-out, bloqueado, sem telefone, Automatize há 3 dias; Bruno e Hugo nem entram)`)
  r = await tx(dono, { op: 'previa', filial_id: Number(LA), filtro: { sem_mensagem_ha_dias: 30, com_mensagem_nos_dias: 10 }, modelo_id: Number(M) })
  confere(r.status === 400, `filtro impossível: 400 (${r.j.error})`)
  r = await tx(dono, { op: 'previa', filtro: FILTRO1, modelo_id: Number(M) })
  confere(r.status === 400, 'duas lojas e sem loja: 400')
  r = await tx(dono, { op: 'criar', nome: 'x', filial_id: Number(LA), modelo_id: Number(MP), parametros: [], filtro: {} })
  confere(r.status === 400 && /aprovado/.test(r.j.error), `modelo não aprovado é recusado (${r.j.error})`)
  r = await tx(dono, { op: 'teto', teto_hora: 3 })
  confere(r.status === 200, 'teto por hora = 3')

  // ── 3. Tela do dono: filtro → prévia → disparar ───────────────────────────
  await dono.goto(BASE + '/transmissao', { waitUntil: 'networkidle' })
  await dono.getByRole('button', { name: 'Nova transmissão' }).click()
  await dono.getByLabel('Nome (só para a loja)').fill(`TX1 ${T}`)
  await dono.getByLabel('Loja (o WhatsApp que envia)').selectOption(String(LA))
  await dono.getByLabel('Modelo aprovado').selectOption(String(M))
  confere(await dono.locator('[data-modelo-corpo]').innerText() === 'Oi {{1}}, chegou novidade na loja.', 'o corpo do modelo aparece')
  confere(await dono.getByLabel('Modelo aprovado').locator(`option[value="${MP}"]`).count() === 0, 'modelo pendente não é oferecido')
  await dono.getByLabel('Variável {{1}}').fill('{{nome}}')
  await dono.locator(`[data-filtro-etapa="${ET.proposta}"]`).click()
  await dono.getByLabel('Sem mensagem há mais de (dias)').fill('30')
  confere(await esperaAte(async () => (await dono.locator('[data-previa-aptos]').innerText()).trim() === '5'), `prévia na tela: ${await dono.locator('[data-previa-aptos]').innerText()} recebem`)
  confere(/4 ficam fora/.test(await dono.locator('[data-previa-fora]').innerText()), 'a tela diz quem fica fora e por quê')
  await dono.screenshot({ path: FOTOS + '/transmissao-1-nova.png', fullPage: true })
  await dono.locator('[data-disparar]').click()
  await dono.getByRole('button', { name: 'Disparar', exact: true }).last().click()
  const TX1 = await (async () => { await esperaAte(async () => !!um(`select id from transmissoes where empresa_id=${E} and nome='TX1 ${T}'`)); return um(`select id from transmissoes where empresa_id=${E} and nome='TX1 ${T}'`) })()
  confere(/^\d+$/.test(TX1), `TX1 criada pela tela (${TX1})`)
  confere(await esperaAte(() => conta(TX1, 'enviada') === 3), `primeiro lote na hora, até o teto: ${envios(TX1)}`)
  await espera(1500)
  confere(conta(TX1, 'enviada') === 3 && conta(TX1, 'pendente') === 2 && conta(TX1, 'pulada') === 4, `teto 3: 3 enviadas, 2 esperando, 4 fora (${envios(TX1)})`)
  confere(graph.length === 3 && graph.every((g) => g.to.startsWith('5519900') && g.type === 'template' && g.template?.name === `tx_e2e_${T}` && g.auth === 'Bearer token-falso-e2e'),
    `Graph falsa recebeu 3 modelos, só números de teste, pelo token da Loja A`)
  confere(graph.every((g) => g.url.includes(`/${PHONE}/messages`)), 'saiu pelo número da Loja A')
  const msgAna = um(`select m.origem || '|' || m.status_entrega || '|' || m.conteudo from transmissao_envios e join mensagens m on m.id = e.mensagem_id where e.transmissao_id=${TX1} and e.contato_id=${P.ana.c}`)
  confere(msgAna === `transmissao|enviada|Oi Ana ${T}, chegou novidade na loja.`, `mensagem na conversa com origem transmissão e o nome trocado: ${msgAna}`)
  const motivos = sql(`select string_agg(distinct motivo, ' / ') from transmissao_envios where transmissao_id=${TX1} and status='pulada'`)
  confere(/opt-out/.test(motivos) && /bloqueado/.test(motivos) && /sem telefone/.test(motivos) && /7 dias/.test(motivos), `motivos de quem ficou fora: ${motivos}`)

  // ── 4. Cron: teto segura, a hora seguinte manda o resto; idempotente ──────
  let c1 = await cron()
  confere(c1.s === 200 && conta(TX1, 'enviada') === 3, `cron com o teto cheio não manda (${JSON.stringify(c1.j.transmissoes?.rodadas ?? c1.j)})`)
  sql(`update transmissao_envios set enviada_em = enviada_em - interval '61 minutes' where transmissao_id=${TX1} and status='enviada'`)
  c1 = await cron()
  confere(conta(TX1, 'enviada') === 5 && um(`select status from transmissoes where id=${TX1}`) === 'concluida', `uma hora depois o cron manda o resto e conclui (${envios(TX1)})`)
  const antes = graph.length; await cron()
  confere(graph.length === antes, 'rodar o cron de novo não manda de novo')
  confere(Number(um(`select count(*) from eventos where empresa_id=${E} and tipo='transmissao.rodada'`)) >= 2, 'rodadas registradas em eventos')
  confere((await fetch(`${BASE}/api/cron/automacoes`)).status === 401, 'cron sem segredo: 401')

  // ── 5. Entregue e lida pelo webhook de status da Meta ─────────────────────
  const wam = (ct) => um(`select m.external_id from transmissao_envios e join mensagens m on m.id = e.mensagem_id where e.transmissao_id=${TX1} and e.contato_id=${ct}`)
  const agoraS = Math.floor(Date.now() / 1000)
  let st = await webhook({ statuses: [{ id: wam(P.ana.c), status: 'delivered', timestamp: String(agoraS), recipient_id: P.ana.fone }, { id: wam(P.bia.c), status: 'read', timestamp: String(agoraS), recipient_id: P.bia.fone }] })
  confere(st === 200, `webhook de status: ${st}`)
  const num = () => sql(`select row_to_json(x)::text from transmissao_numeros(array[${TX1}]::bigint[]) x`)
  confere(await esperaAte(() => /"entregues":2/.test(num()) && /"lidas":1/.test(num())), `números: ${num()}`)

  // ── 6. Resposta: o envio marca e o card ganha a origem transmissão ────────
  st = await webhook({ contacts: [{ profile: { name: 'Ana' }, wa_id: P.ana.fone }], messages: [{ from: P.ana.fone, id: `wamid.IN${T}a`, timestamp: String(agoraS), type: 'text', text: { body: 'quero saber mais' } }] })
  confere(st === 200, `resposta da Ana chegou (${st})`)
  confere(await esperaAte(() => !!um(`select respondida_em from transmissao_envios where transmissao_id=${TX1} and contato_id=${P.ana.c}`)), 'envio da Ana marcado como respondido')
  const dadosAna = um(`select dados->'_transmissao'->>'nome' from negocios where id=${P.ana.neg}`)
  confere(dadosAna === `TX1 ${T}`, `card da Ana com a transmissão: ${dadosAna}`)
  confere(um(`select count(*) from negocio_historico where negocio_id=${P.ana.neg} and acao='respondeu_transmissao'`) === '1', 'histórico do negócio: respondeu à transmissão')
  await webhook({ contacts: [{ profile: { name: 'Bruno' }, wa_id: P.bruno.fone }], messages: [{ from: P.bruno.fone, id: `wamid.IN${T}b`, timestamp: String(agoraS), type: 'text', text: { body: 'oi' } }] })
  await espera(1500)
  confere(um(`select coalesce(dados->>'_transmissao','') from negocios where id=${P.bruno.neg}`) === '', 'quem não recebeu e escreveu não ganha a marca')
  confere(/"respondidas":1/.test(num()), 'respondidas = 1')
  await dono.goto(`${BASE}/leads?lead=${P.ana.neg}`, { waitUntil: 'networkidle' })
  confere(await esperaAte(async () => (await dono.locator(`[data-transmissao-card="${TX1}"]`).count()) === 1, 30000), 'o card da Ana mostra "origem: transmissão"')
  await dono.screenshot({ path: FOTOS + '/transmissao-3-card.png' })
  await dono.goto(`${BASE}/transmissao?id=${TX1}`, { waitUntil: 'networkidle' })
  await dono.waitForSelector('[data-numeros]', { timeout: 30000 })
  await dono.screenshot({ path: FOTOS + '/transmissao-2-acompanhamento.png', fullPage: true })
  const tela = async (k) => (await dono.locator(`[data-numero="${k}"]`).innerText()).split('\n')
  confere((await tela('respondidas')).includes('1') && (await tela('lidas')).includes('1') && (await tela('entregues')).includes('2') && (await tela('enviadas')).includes('5'),
    `acompanhamento na tela: enviadas ${await tela('enviadas')} · entregues ${await tela('entregues')} · lidas ${await tela('lidas')} · responderam ${await tela('respondidas')}`)

  // ── 7. A trava de 7 dias vale para a próxima transmissão ──────────────────
  // (sem o "sem mensagem há 30": quem recebeu agora tem mensagem nova na conversa)
  r = await tx(dono, { op: 'previa', filial_id: Number(LA), filtro: { etapa_ids: [Number(ET.proposta)] }, modelo_id: Number(M) })
  confere(r.j.previa?.aptos === 1 && r.j.previa?.modelo_7_dias === 6, `proposta de novo: só o Bruno; 6 com o modelo há menos de 7 dias (5 da TX1 + Automatize) ${JSON.stringify({ ...r.j.previa, amostra: undefined })}`)

  // ── 8. Pausar e retomar (a Edge recusa o que estiver em voo) ──────────────
  sql(`update transmissao_envios set enviada_em = enviada_em - interval '2 hours' where transmissao_id=${TX1}`)
  r = await tx(dono, { op: 'teto', teto_hora: 1 })
  r = await tx(dono, { op: 'criar', nome: `TX2 ${T}`, filial_id: Number(LA), modelo_id: Number(M), parametros: ['{{nome}}'], filtro: { situacoes: ['perdido'] } })
  const TX2 = String(r.j.id)
  r = await tx(dono, { op: 'disparar', id: Number(TX2) })
  confere(r.status === 200 && r.j.contatos === 3, `TX2 (perdidos) disparada: ${r.j.contatos} na lista`)
  confere(await esperaAte(() => conta(TX2, 'enviada') === 1), `teto 1: um sai na hora (${envios(TX2)})`)
  r = await tx(dono, { op: 'pausar', id: Number(TX2) })
  confere(r.status === 200 && um(`select status from transmissoes where id=${TX2}`) === 'pausada', 'pausada')
  sql(`update transmissao_envios set enviada_em = enviada_em - interval '2 hours' where transmissao_id=${TX2}`)
  await cron()
  confere(conta(TX2, 'enviada') === 1 && conta(TX2, 'pendente') === 2, `pausada: o cron não manda (${envios(TX2)})`)
  const emVoo = um(`update transmissao_envios set status='enviando', reservada_em=now() where id = (select id from transmissao_envios where transmissao_id=${TX2} and status='pendente' order by id limit 1) returning id`)
  let ed = await fetch(`${EDGE}?action=send_template_transmissao`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-edge-internal-secret': SEGREDO_EDGE }, body: JSON.stringify({ envioId: Number(emVoo), parametros: ['x'], previa: 'x' }) })
  confere(ed.status === 409, `Edge recusa envio de transmissão pausada (${ed.status})`)
  sql(`update transmissao_envios set status='pendente', reservada_em=null where id=${emVoo}`)
  ed = await fetch(`${EDGE}?action=send_template_transmissao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envioId: Number(emVoo) }) })
  confere(ed.status === 401, `Edge sem o segredo interno: ${ed.status}`)
  ed = await fetch(`${EDGE}?action=send_template_transmissao`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` }, body: JSON.stringify({ envioId: Number(emVoo) }) })
  confere(ed.status === 401, `Edge com a chave de serviço (caminho antigo, fechado): ${ed.status}`)
  ed = await fetch(`${EDGE}?action=send_template_automacao`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-edge-internal-secret': 'errado' }, body: '{}' })
  confere(ed.status === 401, `Automatize com segredo errado: ${ed.status}`)
  ed = await fetch(`${EDGE}?action=send_template_transmissao`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ANON_KEY}` }, body: JSON.stringify({ envioId: Number(emVoo) }) })
  confere(ed.status === 401, `Edge com a chave anônima: ${ed.status}`)
  r = await tx(dono, { op: 'teto', teto_hora: 50 })
  r = await tx(dono, { op: 'retomar', id: Number(TX2) })
  confere(r.status === 200 && await esperaAte(() => um(`select status from transmissoes where id=${TX2}`) === 'concluida'), `retomada: conclui (${envios(TX2)})`)

  // ── 9. Horário de atendimento e encerrar ──────────────────────────────────
  const amanha = (new Date().getUTCDay() + 2) % 7 // um dia que não é hoje no fuso da loja
  sql(`update configuracoes_sistema set valor='{"inicio":"09:00","fim":"10:00","dias":[${amanha}]}' where empresa_id=${E} and chave='horario_comercial'`)
  r = await tx(dono, { op: 'criar', nome: `TX3 ${T}`, filial_id: Number(LA), modelo_id: Number(M), parametros: ['{{nome}}'], filtro: { situacoes: ['ganho'] } })
  const TX3 = String(r.j.id)
  r = await tx(dono, { op: 'disparar', id: Number(TX3) })
  await espera(3000); await cron()
  confere(conta(TX3, 'enviada') === 0 && conta(TX3, 'pendente') === 1, `fora do horário: nada sai, a fila fica (${envios(TX3)})`)
  r = await tx(dono)
  confere(!!r.j.form?.abreEm, `a tela diz quando volta: ${r.j.form?.abreEm}`)
  r = await tx(dono, { op: 'encerrar', id: Number(TX3) })
  confere(r.status === 200 && um(`select status || '|' || (select motivo from transmissao_envios where transmissao_id=${TX3}) from transmissoes where id=${TX3}`) === 'encerrada|transmissão encerrada antes do envio', 'encerrar: o que não saiu fica registrado como não enviado')
  sql(`update configuracoes_sistema set valor='{"inicio":"00:00","fim":"23:59","dias":[0,1,2,3,4,5,6]}' where empresa_id=${E} and chave='horario_comercial'`)

  // ── 10. Loja sem WhatsApp não dispara; agendar ────────────────────────────
  r = await tx(dono, { op: 'criar', nome: `TX4 ${T}`, filial_id: Number(LB), modelo_id: Number(M), parametros: ['{{nome}}'], filtro: {} })
  const TX4 = String(r.j.id)
  r = await tx(dono, { op: 'disparar', id: Number(TX4) })
  confere(r.status === 409 && /WhatsApp/.test(r.j.error), `Loja B sem WhatsApp: ${r.status} ${r.j.error}`)
  r = await tx(dono, { op: 'criar', nome: `TX6 ${T}`, filial_id: Number(LA), modelo_id: Number(M), parametros: ['{{nome}}'], filtro: { etapa_ids: [Number(ET.novo)] } })
  r = await tx(dono, { op: 'disparar', id: Number(r.j.id) })
  confere(r.status === 400 && /ninguém/.test(r.j.error), `lista vazia não dispara: ${r.status} ${r.j.error}`)
  r = await tx(dono, { op: 'criar', nome: `TX5 ${T}`, filial_id: Number(LA), modelo_id: Number(M), parametros: ['{{nome}}'], filtro: { etapa_ids: [Number(ET.proposta)] } })
  const TX5 = String(r.j.id)
  r = await tx(dono, { op: 'disparar', id: Number(TX5), agendar_para: new Date(Date.now() + 3 * 3600_000).toISOString() })
  confere(r.status === 200 && um(`select status from transmissoes where id=${TX5}`) === 'agendada', 'agendada para daqui a 3 h')
  await cron()
  confere(um(`select status from transmissoes where id=${TX5}`) === 'agendada', 'o cron não começa antes da hora')
  sql(`update transmissoes set agendada_para = now() - interval '1 minute' where id=${TX5}`)
  await cron()
  confere(['enviando', 'concluida'].includes(um(`select status from transmissoes where id=${TX5}`)), `chegou a hora: ${um(`select status from transmissoes where id=${TX5}`)}`)

  // ── 11. Vendedor vê o resultado e não dispara; outra loja não vê ──────────
  const vA = await entrar(`venda.tx.${T}@teste.local`)
  r = await tx(vA)
  confere(r.status === 200 && r.j.admin === false && r.j.transmissoes.some((t) => String(t.id) === TX1) && !r.j.form, `vendedor A vê as da loja A (${r.j.transmissoes?.length})`)
  confere(!r.j.transmissoes.some((t) => String(t.id) === TX4), 'vendedor A não vê a da Loja B')
  r = await tx(vA, { op: 'disparar', id: Number(TX4) })
  confere(r.status === 403, `vendedor dispara pela API: ${r.status}`)
  r = await tx(vA, { op: 'previa', filial_id: Number(LA), filtro: {} })
  confere(r.status === 403, `vendedor pede prévia: ${r.status}`)
  // Quem não instalou vê o módulo ligado quando o minuto do cache da trava passa (Central, 22/10).
  await espera(Math.max(0, vitrineEm + 62_000 - Date.now()))
  await vA.goto(BASE + '/transmissao', { waitUntil: 'networkidle' })
  confere(await vA.getByRole('button', { name: 'Nova transmissão' }).count() === 0, 'vendedor não vê "Nova transmissão"')
  await vA.locator(`[data-transmissao-linha="${TX1}"]`).click()
  await vA.waitForSelector('[data-numeros]', { timeout: 30000 })
  confere(await vA.locator('[data-pausar], [data-retomar]').count() === 0, 'vendedor vê o acompanhamento, sem botões')
  const comoVendedor = (q) => sql(`begin; select set_config('request.jwt.claims', json_build_object('sub','${U.vendA}','role','authenticated')::text, true); set local role authenticated; ${q}; rollback;`).split('\n').filter((x) => /^\d+$/.test(x)).pop()
  confere(comoVendedor(`with u as (update transmissoes set status='pausada' where id=${TX1} returning 1) select count(*) from u`) === '0', 'RLS: vendedor não altera transmissão')
  let negou = false
  try { comoVendedor(`select transmissao_montar(${TX4})`) } catch { negou = true }
  confere(negou, 'RLS: vendedor não monta lista')
  negou = false
  try { comoVendedor(`select count(*) from transmissao_reservar(${TX1}, 1)`) } catch { negou = true }
  confere(negou, 'reservar fila: só service_role')
  const vB = await entrar(`vendb.tx.${T}@teste.local`)
  r = await tx(vB)
  confere(r.status === 200 && !r.j.transmissoes.some((t) => String(t.id) === TX1), 'vendedor B não vê a da Loja A')
  r = await api(vB, `/api/transmissao/${TX1}`)
  confere(r.status === 404, `vendedor B abre a da Loja A pelo id: ${r.status}`)

  // ── 12. Nada a número que não é de teste ──────────────────────────────────
  confere(graph.length > 0 && graph.every((g) => String(g.to).startsWith('5519900')), `Graph falsa: ${graph.length} envios, todos para 5519900…`)
} catch (e) {
  falha(`erro: ${e?.stack ?? e}`)
} finally {
  // hard_delete_empresa pede superadmin logado; aqui é o postgres local e tudo cai em cascata.
  try { sql(`delete from empresas where id=${E}`) } catch (e) { console.log('limpeza:', String(e).slice(0, 200)) }
  for (const id of Object.values(U)) {
    await fetch(`${env.API_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } }).catch(() => {})
  }
  const sobra = um(`select count(*) from empresas where id=${E}`)
  console.log(sobra === '0' ? 'limpeza: empresa de teste apagada' : 'limpeza: SOBROU a empresa de teste')
  await browser.close(); servidorGraph.close(); edge.kill()
  fs.mkdirSync(`${import.meta.dirname}/../../.gate`, { recursive: true })
  if (falhas.length) fs.writeFileSync(`${import.meta.dirname}/../../.gate/transmissao-edge.log`, logEdge)
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
