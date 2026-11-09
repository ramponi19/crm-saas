// Views lote 3 (pós-venda + vendas) + TRANSFERÊNCIA com loja escolhida — app LOCAL :3010, Supabase LOCAL, views já derrubadas.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE VIEWS3 ${T}`
const env = Object.fromEntries(readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const VIEWS = ['garantias_assistencias', 'orcamentos', 'servicos_reparo', 'comissoes', 'contrato_documentos', 'contrato_modelos', 'pedidos_compra', 'propostas', 'fichas_financiamento', 'contratos_venda']
confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${VIEWS.map((v) => `'${v}'`).join(',')})`) === '0', 'as 10 views não existem no local')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha(`pageerror (${email}): ` + String(e).slice(0, 160)))
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [url, method, body])
const loja = (page, id) => api(page, '/api/filial/selecionar', 'POST', { filialId: id })

const fotoUnid = (id) => sql(`select row_to_json(u)::text from (select filial_id, status, recebido_em, recebido_por from estoque_unidades where id=${id}) u`)
const restaurar = (id, f) => { const s = JSON.parse(f); sql(`update estoque_unidades set filial_id=${s.filial_id}, status='${s.status}', recebido_em=${s.recebido_em ? `'${s.recebido_em}'` : 'null'}, recebido_por=${s.recebido_por ? `'${s.recebido_por}'` : 'null'} where id=${id}`) }
const movMax = sql(`select coalesce(max(id),0) from estoque_movimentacoes`)
const uMogi = sql(`select id from estoque_unidades where empresa_id=1 and filial_id=3 and ativo and status='disponivel' order by id desc limit 1`)
const uJag = sql(`select id from estoque_unidades where empresa_id=1 and filial_id=6 and ativo and status='disponivel' order by id desc limit 1`)
const fMogi = fotoUnid(uMogi), fJag = uJag ? fotoUnid(uJag) : null
console.log('unidade Mogi', uMogi, 'unidade Jag', uJag || '(nenhuma disponível — cria)')
let uJagCriada = null
const dono = await entrar(E.dono)
const vend = await entrar(E.vend_mogi)
const criados = { proposta: null, doc: null, os: null, pedido: null }
try {
  // ---------- TRANSFERÊNCIA ----------
  await loja(dono, 3)
  let r = await api(dono, '/api/estoque/transferir', 'POST', { ids: [Number(uMogi)], filialDestino: 6, observacoes: MK })
  confere(r.status === 200 && JSON.parse(fotoUnid(uMogi)).filial_id === 6, `dono com Mogi escolhida transfere Mogi -> Jaguariúna (${r.status} ${JSON.stringify(r.json).slice(0, 90)})`)
  confere(sql(`select string_agg(tipo_movimento||'@'||filial_id, ',' order by id) from estoque_movimentacoes where id>${movMax} and observacoes like '%${MK}%'`) === 'transferencia_saida@3,transferencia_entrada@6', 'histórico com saída em Mogi e entrada em Jaguariúna')
  restaurar(uMogi, fMogi)
  let alvoJag = uJag
  if (!alvoJag) {
    uJagCriada = sql(`insert into estoque_unidades (empresa_id, filial_id, produto_id, condicao, tipo, status, ativo, observacoes) select 1, 6, produto_id, condicao, tipo, 'disponivel', true, '${MK}' from estoque_unidades where id=${uMogi} returning id`).split('\n')[0]
    alvoJag = uJagCriada
  }
  const fAlvo = fotoUnid(alvoJag)
  await loja(dono, 6)
  r = await api(dono, '/api/estoque/transferir', 'POST', { ids: [Number(alvoJag)], filialDestino: 3, observacoes: MK })
  confere(r.status === 200 && JSON.parse(fotoUnid(alvoJag)).filial_id === 3, `dono com Jaguariúna escolhida transfere Jaguariúna -> Mogi (${r.status} ${JSON.stringify(r.json).slice(0, 90)})`)
  confere(JSON.parse(fotoUnid(alvoJag)).status === 'pendente', 'chega como pendente (confirma a chegada no destino)')
  restaurar(alvoJag, fAlvo)
  // unidade que a pessoa NÃO enxerga (com Mogi escolhida, uma de Jaguariúna) não viaja
  await loja(dono, 3)
  r = await api(dono, '/api/estoque/transferir', 'POST', { ids: [Number(alvoJag)], filialDestino: 3, observacoes: MK })
  confere(r.status === 404 && JSON.parse(fotoUnid(alvoJag)).filial_id === 6, `unidade fora da vista não é transferida (${r.status} ${r.json?.error})`)
  // destino de outra empresa
  const outra = sql(`select id from filiais where empresa_id<>1 and ativo limit 1`)
  if (outra) { r = await api(dono, '/api/estoque/transferir', 'POST', { ids: [Number(uMogi)], filialDestino: Number(outra) }); confere(r.status === 404 && JSON.parse(fotoUnid(uMogi)).filial_id === 3, `destino de outra empresa = 404 (${r.status})`) }
  // vendedor
  await loja(vend, 3).catch(() => {})
  r = await api(vend, '/api/estoque/transferir', 'POST', { ids: [Number(uMogi)], filialDestino: 6, observacoes: MK })
  confere((r.status === 403 || r.status === 401) && JSON.parse(fotoUnid(uMogi)).filial_id === 3, `vendedor não transfere (${r.status})`)
  await dono.goto(BASE + '/estoque', { waitUntil: 'networkidle' })
  const btnDono = await dono.getByRole('button', { name: /Transferir/i }).count()
  await vend.goto(BASE + '/estoque', { waitUntil: 'networkidle' })
  const btnVend = await vend.getByRole('button', { name: /Transferir/i }).count()
  confere(btnVend === 0, `vendedor não vê o botão Transferir (dono vê ${btnDono}, vendedor ${btnVend})`)
  sql(`delete from estoque_movimentacoes where id>${movMax} and observacoes like '%${MK}%'`)

  // ---------- TELAS ----------
  for (const rota of ['/assistencia', '/garantia', '/compras', '/pdv', '/propostas', '/equipe', '/configuracoes/usuarios', '/configuracoes/documentos', '/orcamentos']) {
    const g = await dono.goto(BASE + rota, { waitUntil: 'networkidle' })
    confere(g.status() === 200, `${rota} 200`)
  }
  // propostas (API)
  r = await api(dono, '/api/propostas', 'POST', { cliente_nome: MK, itens: [{ descricao: 'x', quantidade: 1, valor: 10 }] })
  criados.proposta = r.json?.id ?? sql(`select id from vendas_propostas where cliente_nome='${MK}' limit 1`)
  confere(r.status === 200 && !!criados.proposta, `proposta criada (${r.status})`)
  r = await api(dono, '/api/propostas', 'PATCH', { id: Number(criados.proposta), observacoes: 'obs' })
  confere(r.status === 200 && sql(`select observacoes from vendas_propostas where id=${criados.proposta}`) === 'obs', 'proposta editada')
  r = await api(dono, '/api/propostas', 'DELETE', { id: Number(criados.proposta) })
  confere(r.status === 200, 'proposta apagada')
  r = await api(dono, '/api/propostas', 'PATCH', { id: Number(criados.proposta), observacoes: 'obs2' })
  confere(r.status === 404, `editar proposta apagada = 404 (${r.status})`)
  r = await api(dono, '/api/propostas', 'DELETE', { id: Number(criados.proposta) })
  confere(r.status === 404, `apagar de novo = 404 (${r.status})`)
  // documento de contrato (API)
  r = await api(dono, '/api/contrato-documentos', 'POST', { nome: MK })
  criados.doc = r.json?.id ?? r.json?.documento?.id ?? sql(`select id from vendas_contrato_documentos where nome='${MK}' limit 1`)
  confere(r.status === 200 && !!criados.doc, `documento de contrato criado (${r.status})`)
  r = await api(dono, '/api/contrato-documentos', 'PATCH', { id: Number(criados.doc), nome: MK + ' b' })
  confere(r.status === 200 && sql(`select nome from vendas_contrato_documentos where id=${criados.doc}`) === MK + ' b', 'documento renomeado')
  r = await api(dono, '/api/contrato-documentos', 'GET')
  confere(r.status === 200 && JSON.stringify(r.json).includes(MK + ' b'), 'lista de documentos traz o novo (com versão do modelo)')
  r = await api(dono, '/api/contrato-documentos', 'DELETE', { id: Number(criados.doc) })
  confere(r.status === 200, `documento apagado (${r.status})`)
  r = await api(dono, '/api/contrato-documentos', 'PATCH', { id: Number(criados.doc), nome: 'x' })
  confere(r.status === 404, `renomear documento apagado = 404 (${r.status})`)
  // compras: receber pedido
  criados.pedido = sql(`insert into vendas_pedidos_compra (empresa_id, filial_id, descricao, valor_total, status) values (1, 3, '${MK}', 1, 'pendente') returning id`).split('\n')[0]
  await loja(dono, 3)
  await dono.goto(BASE + '/compras', { waitUntil: 'networkidle' })
  confere((await dono.locator('body').innerText()).includes(MK), 'compras lista o pedido (vendas_pedidos_compra + fornecedor)')
  r = await api(dono, '/api/compras/receber', 'POST', { pedidoId: Number(criados.pedido) })
  confere(r.status === 200 && sql(`select status from vendas_pedidos_compra where id=${criados.pedido}`) === 'recebido', `receber pedido grava (${r.status})`)
  // OS: marcar pronto e salvar
  const cli = sql(`select id from contatos where empresa_id=1 limit 1`)
  criados.os = sql(`insert into assistencia_garantias (empresa_id, filial_id, tipo, protocolo, cliente_id, status, defeito_relatado, token, orcamento_valor) values (1, 3, 'assistencia', '${MK}', ${cli}, 'em_analise', 'teste', 'tok${T}', 100) returning id`).split('\n')[0]
  await dono.goto(BASE + '/assistencia', { waitUntil: 'networkidle' })
  const linhaOs = dono.locator('tr', { hasText: MK }).first()
  confere(await linhaOs.count() > 0, 'assistência lista a OS (assistencia_garantias + embeds)')
  const pub = await dono.goto(`${BASE}/os/tok${T}`, { waitUntil: 'networkidle' })
  confere(pub.status() === 200 && (await dono.locator('body').innerText()).includes(MK), 'página pública da OS abre pelo token')
  await dono.goto(BASE + '/assistencia', { waitUntil: 'networkidle' })
  await dono.locator('tr', { hasText: MK }).first().click()
  await dono.getByRole('dialog').waitFor({ timeout: 10000 })
  const btnPronto = dono.getByRole('dialog').getByRole('button', { name: /pronto/i })
  if (await btnPronto.count()) {
    sql(`update assistencia_garantias set filial_id=6 where id=${criados.os}`)
    const tarefas0 = sql(`select count(*) from tarefas where titulo like '%${MK}%'`)
    await btnPronto.first().click(); await espera(1500)
    confere((await toasts(dono)).some((x) => /Nada foi gravado/.test(x)) && sql(`select count(*) from tarefas where titulo like '%${MK}%'`) === tarefas0, 'marcar pronto com a OS fora da vista avisa e não cria tarefa')
    sql(`update assistencia_garantias set filial_id=3 where id=${criados.os}`)
    await dono.goto(BASE + '/assistencia', { waitUntil: 'networkidle' })
    await dono.locator('tr', { hasText: MK }).first().click(); await dono.getByRole('dialog').waitFor({ timeout: 10000 })
    await dono.getByRole('dialog').getByRole('button', { name: /pronto/i }).first().click(); await espera(1500)
    confere(sql(`select status from assistencia_garantias where id=${criados.os}`) === 'pronto' && sql(`select count(*) from tarefas where titulo like '%${MK}%'`) === '1', 'marcar pronto grava e cria a tarefa de aviso')
  } else falha('botão de marcar pronto não encontrado no modal da OS')
  // fichas de financiamento + orçamento do card (REST com o JWT, os selects do painel)
  const tok = await (await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: E.dono, password: SENHA }) })).json()
  for (const q of ['vendas_fichas_financiamento?select=id,banco,status&limit=2', 'vendas_comissoes?select=id&limit=1', 'vendas_contratos?select=id&limit=1', 'assistencia_servicos?select=id,nome,preco&ativo=eq.true&limit=2', `vendas_contrato_documentos?select=id,nome,contrato_modelos:vendas_contrato_modelos!inner(id)&limit=2`]) {
    const rr = await fetch(`${env.API_URL}/rest/v1/${q}`, { headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${tok.access_token}` } })
    confere(rr.status === 200, `REST ${q.split('?')[0]} ${rr.status}`)
  }
} finally {
  restaurar(uMogi, fMogi)
  if (uJagCriada) sql(`delete from estoque_unidades where id=${uJagCriada}`)
  else if (fJag) restaurar(uJag, fJag)
  sql(`delete from estoque_movimentacoes where id>${movMax} and observacoes like '%${MK}%'`)
  sql(`delete from tarefas where titulo like '%${MK}%'`)
  if (criados.os) sql(`delete from assistencia_garantias where id=${criados.os}`)
  if (criados.pedido) sql(`delete from vendas_pedidos_compra where id=${criados.pedido}`)
  sql(`delete from vendas_propostas where cliente_nome='${MK}'`)
  sql(`delete from vendas_contrato_documentos where nome like '${MK}%'`)
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
