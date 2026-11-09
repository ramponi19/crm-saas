// Inbox única (/comunicacao) — ponta a ponta no app LOCAL (:3010) contra o Supabase LOCAL.
// uso: node inbox-e2e.mjs <usuarios.json> <saida.json> <pasta-fotos>
// Confere na tela E no banco (psql local, com a RLS do usuário): lista por loja, filtros,
// sino = banco, marcar lida com a aba à vista, nota, tarefa, card, "também em",
// tempo real com 3 abas e uma assinatura por aba. Nada de produção: só 127.0.0.1.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const [arqU, arqSaida, fotos] = process.argv.slice(2)
const BASE = 'http://localhost:3010'
const SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const IDS = { dono: 'a632db2c-c42b-4973-8008-2d5ca2dbf479', 'vend-mogi': 'dd2ae788-0e28-47af-86e2-73a15d1d600f', 'vend-jag': '67065f4d-c70a-4f44-8e6e-430841f0ce19' }
const usuarios = JSON.parse(fs.readFileSync(arqU, 'utf8'))
fs.mkdirSync(fotos, { recursive: true })

const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
/** Consulta com a RLS do usuário (o dono na loja `loja`). Volta a loja do dono no fim (rollback). */
const comoUsuario = (uid, loja, q) => sql(`begin;
${loja ? `update public.usuarios set filial_atual_id = ${loja} where id = '${uid}';` : ''}
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub','${uid}','role','authenticated')::text, true); end $$;
set local role authenticated;
${q};
rollback;`)

const out = []
const falhas = []
const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const ok = (m) => console.log('ok  ', m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function entrar(ctx, u) {
  const page = await ctx.newPage()
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', u.email)
  await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
  return page
}
const idsDaLista = (page) => page.evaluate(() => [...document.querySelectorAll('[data-conversa-id]')].map((e) => Number(e.getAttribute('data-conversa-id'))))
async function esperarLista(page) {
  await page.waitForFunction(() => !/Carregando conversas/.test(document.body.innerText), null, { timeout: 30000 })
  await espera(400)
}
const tituloN = (page) => page.evaluate(() => Number((document.title.match(/^\((\d+)\)/) ?? [])[1] ?? 0))

const browser = await chromium.launch({ channel: 'msedge', headless: true })

// ── Números do banco que o Lucas pediu ──────────────────────────────────────
const base = {
  contatos_negocios_2_lojas: sql(`select count(*) from (select contato_id from negocios where empresa_id=1 and filial_id in (3,6) group by 1 having count(distinct filial_id)=2) x`),
  contatos_conversas_2_lojas: sql(`select count(*) from (select contato_id from conversas where empresa_id=1 and filial_id in (3,6) group by 1 having count(distinct filial_id)=2) x`),
  nao_lidas_fora_da_loja: sql(`select count(*) from conversas c join mensagens m on m.conversa_id=c.id and m.direcao='recebida' and not m.lida where c.empresa_id=1 and m.filial_id is distinct from c.filial_id`),
}
console.log('base', base)
out.push({ base })

for (const u of usuarios) {
  const uid = IDS[u.nome]
  const lojas = u.papel === 'owner' ? [3, 6] : [u.lojas[0].id]
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } })
  const page = await entrar(ctx, u)
  const erros = []
  const leiturasViews = []
  page.on('pageerror', (e) => erros.push('pageerror: ' + String(e).slice(0, 160)))
  page.on('response', (r) => { if (r.status() >= 500) erros.push(`${r.status()} ${r.url().slice(0, 120)}`) })
  page.on('request', (r) => { if (/\/rest\/v1\/(lead_mensagens|leads)\?/.test(r.url()) && /comunicacao/.test(page.url())) leiturasViews.push(r.url().replace(/^.*\/rest\/v1\//, '').slice(0, 90)) })

  for (const loja of lojas) {
    const linha = { usuario: u.nome, loja, checagens: {} }
    if (u.papel === 'owner') {
      const r = await page.evaluate(async (id) => (await fetch('/api/filial/selecionar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filialId: id }) })).status, loja)
      if (r !== 200) falha(`${u.nome}: trocar para loja ${loja} deu ${r}`)
      sql(`update public.usuarios set filial_atual_id=${loja} where id='${uid}'`)
    }
    const sufixo = `${u.nome}@${loja}`
    const t0 = Date.now()
    await page.goto(BASE + '/comunicacao', { waitUntil: 'networkidle' })
    await esperarLista(page)
    linha.checagens.abrir_ms = Date.now() - t0
    await page.screenshot({ path: `${fotos}/${sufixo}-1-lista.png` })

    // (1) Lista só da loja
    const ids = await idsDaLista(page)
    linha.checagens.itens = ids.length
    if (ids.length) {
      const fora = sql(`select count(*) from conversas where id in (${ids.join(',')}) and filial_id is distinct from ${loja}`)
      fora === '0' ? ok(`${sufixo}: ${ids.length} conversas, todas da loja`) : falha(`${sufixo}: ${fora} conversas de outra loja na lista`)
      const ordem = sql(`select string_agg(id::text, ',' order by ultima_mensagem_at desc, id desc) from (select id, ultima_mensagem_at from conversas where id in (${ids.join(',')})) x`)
      ordem === ids.join(',') ? ok(`${sufixo}: ordem por última mensagem`) : falha(`${sufixo}: ordem da lista diferente do banco`)
    } else falha(`${sufixo}: lista vazia`)

    // (2) Sino e título = banco (conversas com não lida, pela RLS do usuário)
    await espera(1200)
    const naTela = await tituloN(page)
    const noBanco = Number(comoUsuario(uid, u.papel === 'owner' ? loja : null, `select count(*) from conversas where nao_lidas > 0`))
    linha.checagens.sino = { tela: naTela, banco: noBanco }
    naTela === noBanco ? ok(`${sufixo}: sino ${naTela} = banco`) : falha(`${sufixo}: sino ${naTela} x banco ${noBanco}`)

    // (3) Filtros
    for (const [rotulo, acao, conferir] of [
      ['whatsapp', () => page.getByRole('button', { name: 'WhatsApp', exact: true }).click(), (l) => `select count(*) from conversas c left join canais ca on ca.id=c.canal_id where c.id in (${l}) and ca.tipo is distinct from 'whatsapp'`],
      ['nao_lidas', () => page.selectOption('select[aria-label="Situação"]', 'nao_lidas'), (l) => `select count(*) from conversas where id in (${l}) and nao_lidas = 0`],
      ['aguardando', () => page.selectOption('select[aria-label="Situação"]', 'aguardando'), (l) => `select count(*) from conversas where id in (${l}) and not (ultima_recebida_at is not null and (ultima_enviada_at is null or ultima_recebida_at > ultima_enviada_at))`],
    ]) {
      await page.goto(BASE + '/comunicacao', { waitUntil: 'networkidle' }); await esperarLista(page)
      await acao(); await espera(300); await esperarLista(page)
      const l = await idsDaLista(page)
      if (!l.length) { linha.checagens[rotulo] = 0; console.log(`--  ${sufixo}: filtro ${rotulo} vazio`); continue }
      const errados = sql(conferir(l.join(',')))
      linha.checagens[rotulo] = l.length
      errados === '0' ? ok(`${sufixo}: filtro ${rotulo} (${l.length})`) : falha(`${sufixo}: filtro ${rotulo} com ${errados} fora`)
    }
    // não lidas: o total da 1ª página bate com o banco (até 40)
    const totNL = Number(comoUsuario(uid, u.papel === 'owner' ? loja : null, `select count(*) from conversas where nao_lidas > 0 and ultima_mensagem_at is not null`))
    if (linha.checagens.nao_lidas !== Math.min(40, totNL)) falha(`${sufixo}: 1ª página de não lidas ${linha.checagens.nao_lidas}, banco ${totNL}`)

    // responsável = o próprio (vendedor) / um vendedor (dono)
    const resp = u.papel === 'owner' ? sql(`select responsavel_id from negocios where filial_id=${loja} and responsavel_id is not null group by 1 order by count(*) desc limit 1`) : uid
    await page.goto(BASE + '/comunicacao?resp=' + resp, { waitUntil: 'networkidle' }); await esperarLista(page)
    const lr = await idsDaLista(page)
    if (lr.length) {
      const semResp = sql(`select count(*) from conversas c where c.id in (${lr.join(',')}) and not exists (select 1 from negocios n where n.contato_id=c.contato_id and n.filial_id=${loja} and n.responsavel_id='${resp}')`)
      semResp === '0' ? ok(`${sufixo}: filtro responsável (${lr.length})`) : falha(`${sufixo}: filtro responsável com ${semResp} fora`)
    } else console.log(`--  ${sufixo}: filtro responsável vazio`)

    // busca pelo nome do 1º contato com nome
    const alvo = sql(`select c.id || '|' || ct.nome from conversas c join contatos ct on ct.id=c.contato_id where c.filial_id=${loja} and length(ct.nome) > 4 and ct.nome ~ '^[A-Za-z]' order by c.ultima_mensagem_at desc nulls last limit 1`).split('|')
    await page.goto(BASE + '/comunicacao', { waitUntil: 'networkidle' }); await esperarLista(page)
    await page.fill('input[placeholder^="Buscar"]', alvo[1].split(' ')[0]); await espera(900); await esperarLista(page)
    const lb = await idsDaLista(page)
    lb.includes(Number(alvo[0])) ? ok(`${sufixo}: busca "${alvo[1].split(' ')[0]}" achou a conversa`) : falha(`${sufixo}: busca não achou a conversa ${alvo[0]}`)

    // (4) Abrir conversa com não lida → marca lida (aba à vista)
    const comNL = sql(`select id from conversas where filial_id=${loja} and nao_lidas > 0 and canal_id is not null order by ultima_mensagem_at desc limit 1`)
    if (comNL) {
      const antes = sql(`select nao_lidas from conversas where id=${comNL}`)
      await page.goto(`${BASE}/comunicacao?c=${comNL}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-linha-do-tempo] [data-mensagem-id]', { timeout: 20000 })
      await espera(1500)
      const depois = sql(`select nao_lidas from conversas where id=${comNL}`)
      depois === '0' ? ok(`${sufixo}: abrir a conversa ${comNL} marcou ${antes} como lidas`) : falha(`${sufixo}: conversa ${comNL} ficou com ${depois} não lidas`)
      await page.screenshot({ path: `${fotos}/${sufixo}-2-conversa.png` })
    }

    // (5) Conversa longa: 200 + anteriores
    const longa = sql(`select conversa_id from mensagens where filial_id=${loja} group by 1 having count(*) > 230 order by count(*) desc limit 1`)
    if (longa) {
      await page.goto(`${BASE}/comunicacao?c=${longa}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-mensagem-id]', { timeout: 20000 })
      const n1 = await page.locator('[data-mensagem-id]').count()
      await page.getByRole('button', { name: 'Ver mensagens anteriores' }).click()
      await page.waitForFunction((n) => document.querySelectorAll('[data-mensagem-id]').length > n, n1, { timeout: 15000 })
      const msgs = await page.evaluate(() => [...document.querySelectorAll('[data-mensagem-id]')].map((e) => Number(e.getAttribute('data-mensagem-id'))))
      const repetidas = msgs.length - new Set(msgs).size
      n1 === 200 && repetidas === 0 ? ok(`${sufixo}: conversa ${longa} abriu com 200, anteriores → ${msgs.length}, 0 repetidas`) : falha(`${sufixo}: conversa longa abriu com ${n1}, ${repetidas} repetidas`)
    }

    // (6) Nota, (7) tarefa, (8) card — numa conversa da loja com canal
    const conv = comNL || sql(`select id from conversas where filial_id=${loja} and canal_id is not null order by ultima_mensagem_at desc limit 1`)
    await page.goto(`${BASE}/comunicacao?c=${conv}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-linha-do-tempo]', { timeout: 20000 }); await espera(800)
    const textoNota = `nota e2e ${sufixo} ${Date.now()}`
    await page.getByRole('button', { name: 'Nota interna' }).click()
    await page.fill('textarea', textoNota)
    await page.getByRole('button', { name: 'Salvar nota' }).click()
    await page.waitForSelector('[data-nota-id]', { timeout: 10000 })
    const notaNoBanco = sql(`select count(*) from eventos where tipo='conversa.nota' and entidade_id=${conv} and dados->>'texto'='${textoNota}' and por_usuario='${uid}'`)
    notaNoBanco === '1' ? ok(`${sufixo}: nota gravada em eventos`) : falha(`${sufixo}: nota não gravada (${notaNoBanco})`)
    // a nota aparece para o colega da mesma loja (RLS de eventos)
    sql(`delete from eventos where tipo='conversa.nota' and dados->>'texto'='${textoNota}'`)

    await page.getByRole('button', { name: 'Tarefa' }).click()
    const tituloTarefa = `tarefa e2e ${sufixo} ${Date.now()}`
    await page.fill('input[placeholder^="O que fazer"]', tituloTarefa)
    await page.getByRole('button', { name: 'Criar tarefa' }).click()
    await espera(1500)
    const tarefa = sql(`select negocio_id || '|' || coalesce(filial_id::text,'-') || '|' || (contato_id is not null) from tarefas where titulo='${tituloTarefa}'`)
    tarefa && tarefa.split('|')[1] === String(loja) ? ok(`${sufixo}: tarefa criada (negócio ${tarefa.split('|')[0]}, loja ${loja})`) : falha(`${sufixo}: tarefa ${tarefa || 'não criada'}`)
    sql(`delete from tarefas where titulo='${tituloTarefa}'`)

    await page.getByRole('button', { name: 'Abrir card' }).click()
    const card = await page.waitForSelector('text=HISTÓRICO DE MENSAGENS', { timeout: 20000 }).then(() => true).catch(() => false)
    card ? ok(`${sufixo}: card do lead abriu a partir da conversa`) : falha(`${sufixo}: card não abriu`)
    await page.screenshot({ path: `${fotos}/${sufixo}-3-card.png` })
    await page.keyboard.press('Escape'); await espera(400)

    // (9) "também em <outra loja>"
    const dupla = sql(`select c.id from conversas c where c.filial_id=${loja} and exists (select 1 from conversas d where d.contato_id=c.contato_id and d.filial_id is distinct from c.filial_id and d.filial_id is not null) order by c.ultima_mensagem_at desc nulls last limit 1`)
    if (dupla) {
      await page.goto(`${BASE}/comunicacao?c=${dupla}`, { waitUntil: 'networkidle' })
      const tem = await page.waitForSelector('[data-tambem-em]', { timeout: 10000 }).then((e) => e.innerText()).catch(() => null)
      tem ? ok(`${sufixo}: conversa ${dupla} mostra "${tem}"`) : falha(`${sufixo}: conversa ${dupla} sem "também em"`)
    }

    // (10) Vendedor: conversa da outra loja não abre
    if (u.papel !== 'owner') {
      const outra = sql(`select id from conversas where filial_id is distinct from ${loja} and filial_id is not null order by id desc limit 1`)
      await page.goto(`${BASE}/comunicacao?c=${outra}`, { waitUntil: 'networkidle' })
      const aviso = await page.waitForSelector('text=não está na loja selecionada', { timeout: 10000 }).then(() => true).catch(() => false)
      aviso ? ok(`${sufixo}: conversa ${outra} de outra loja → aviso, sem conteúdo`) : falha(`${sufixo}: conversa de outra loja abriu`)
    }
    linha.erros = erros.splice(0)
    out.push(linha)
  }

  // (11) Tempo real com 3 abas abertas: uma assinatura por aba, sino e lista sem recarregar
  const loja = lojas[lojas.length - 1]
  const abas = []
  for (const rota of ['/comunicacao', '/leads', '/dashboard']) {
    const p = await ctx.newPage()
    const topicos = []
    p.on('websocket', (ws) => ws.on('framesent', (f) => {
      try { const m = JSON.parse(typeof f.payload === 'string' ? f.payload : f.payload.toString()); const ev = Array.isArray(m) ? m[3] : m.event; const tp = String(Array.isArray(m) ? m[2] : m.topic); if (ev === 'phx_join' && !tp.startsWith('phoenix')) topicos.push(tp) } catch {}
    }))
    await p.goto(BASE + rota, { waitUntil: 'networkidle' })
    await espera(2500)
    abas.push({ rota, p, topicos })
  }
  const conv = sql(`select id from conversas where filial_id=${loja} and canal_id is not null and contato_id is not null order by ultima_mensagem_at desc limit 1`)
  const antesTitulo = await Promise.all(abas.map((a) => tituloN(a.p)))
  const inserida = sql(`insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, canal_id, direcao, conteudo, tipo, origem, lida)
    select empresa_id, filial_id, id, contato_id, canal_id, 'recebida', 'teste tempo real e2e', 'texto', (select origem from mensagens where conversa_id=${conv} order by id desc limit 1), false from conversas where id=${conv} returning id`).split('\n')[0]
  await espera(4000)
  const depoisTitulo = await Promise.all(abas.map((a) => tituloN(a.p)))
  const nlConv = sql(`select nao_lidas from conversas where id=${conv}`)
  const badge = await abas[0].p.evaluate((id) => document.querySelector(`[data-conversa-id="${id}"] [data-nao-lidas]`)?.getAttribute('data-nao-lidas') ?? null, conv)
  const noTopo = await abas[0].p.evaluate(() => Number(document.querySelector('[data-conversa-id]')?.getAttribute('data-conversa-id')))
  const tr = {
    usuario: u.nome, loja, conversa: conv, mensagem: inserida,
    titulo_antes: antesTitulo, titulo_depois: depoisTitulo,
    badge_na_lista: badge, nao_lidas_banco: nlConv, conversa_no_topo: noTopo === Number(conv),
    canais_por_aba: abas.map((a) => ({ rota: a.rota, topicos: [...new Set(a.topicos)] })),
  }
  console.log('tempo real', JSON.stringify(tr))
  const subiu = depoisTitulo.every((d, i) => d >= antesTitulo[i]) && depoisTitulo.some((d, i) => d !== antesTitulo[i] || antesTitulo[i] > 0)
  badge === nlConv && tr.conversa_no_topo ? ok(`${u.nome}: mensagem nova subiu a conversa ${conv} com ${badge} não lidas, sem recarregar`) : falha(`${u.nome}: tempo real na lista (badge ${badge}, banco ${nlConv}, topo ${tr.conversa_no_topo})`)
  subiu ? ok(`${u.nome}: título das 3 abas ${antesTitulo} → ${depoisTitulo}`) : falha(`${u.nome}: título não mudou ${antesTitulo} → ${depoisTitulo}`)
  for (const a of tr.canais_por_aba) {
    const hub = a.topicos.filter((t) => /empresa_/.test(t))
    hub.length === 1 ? ok(`${u.nome} ${a.rota}: 1 assinatura do hub (${a.topicos.length} tópicos no total: ${a.topicos.map((t) => t.replace(/^realtime:/, '').replace(/_[a-z0-9]{6}$/, '')).join(', ')})`) : falha(`${u.nome} ${a.rota}: ${hub.length} assinaturas do hub`)
  }
  sql(`delete from mensagens where id=${inserida}`)
  out.push({ tempoReal: tr })
  if (leiturasViews.length) falha(`${u.nome}: /comunicacao leu views: ${[...new Set(leiturasViews)].join(' | ')}`)
  else ok(`${u.nome}: /comunicacao sem leitura de leads/lead_mensagens no navegador`)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(arqSaida, JSON.stringify({ falhas, out }, null, 1))
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
