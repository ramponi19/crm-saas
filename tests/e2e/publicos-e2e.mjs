// PÚBLICOS (módulo, 12/11/2026) — app LOCAL :3010 + Supabase LOCAL. Dono e vendedores das DUAS lojas.
// Cria a própria cena (contatos, negócios, etiquetas, públicos, automações e uma transmissão de TESTE)
// e desfaz no fim; liga os módulos Públicos e Transmissão só durante o teste (o estado de antes volta).
// Cobre: módulo desligado (API 403, Transmissão e Automatize sem o opcional), prévia e criação com
// conta na hora, só negócio ativo, alcance por loja e quem grava, "entrou no público" pela rodada de
// hora em hora (só quem entrou dispara), editar o filtro sem disparar, "atualizar agora" com disparo,
// espera + saiu do público = pulada, módulo desligado não dispara, religar o gatilho = ponto de partida,
// transmissão agendada refeita pelo público, apagar (recusado com agendada; leva as automações), telas.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = `host=127.0.0.1 port=${process.env.DB_PORT ?? 54322} dbname=postgres user=postgres password=postgres`
// SQL pela entrada padrão: acento no -c quebra o psql do Windows.
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const sqlErro = (q) => { try { sql(q); return null } catch (e) { return String(e.stderr || e.message) } }
const CRON = 'cron-local-de-teste'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()

const uid = (email) => sql(`select id from auth.users where email='${email}'`)
const DONO = uid(E.dono), VM = uid(E.vend_mogi), VJ = uid(E.vend_jag)
const lojaDe = (u) => sql(`select filial_id from empresa_usuarios where empresa_id=1 and usuario_id='${u}'`)
const MOGI = lojaDe(VM), JAG = lojaDe(VJ)
const vjAtivoAntes = sql(`select ativo from empresa_usuarios where empresa_id=1 and usuario_id='${VJ}'`)
sql(`update empresa_usuarios set ativo=true where empresa_id=1 and usuario_id='${VJ}'`)
const modAntes = sql(`select coalesce(string_agg(modulo || '=' || ativo, ','), '') from empresa_modulos where empresa_id=1 and modulo in ('publicos','transmissao')`)
const ligar = (modulo, ativo) => sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo) values (1, '${modulo}', 'plano', ${ativo}) on conflict (empresa_id, modulo) do update set ativo = excluded.ativo`)
ligar('transmissao', true); ligar('publicos', false)
const filialDonoAntes = sql(`select coalesce(filial_atual_id::text, 'null') from usuarios where id='${DONO}'`)
sql(`update usuarios set filial_atual_id=${MOGI} where id='${DONO}'`)
console.log('dono', DONO.slice(0, 8), '| vend Mogi', VM.slice(0, 8), 'loja', MOGI, '| vend Jag', VJ.slice(0, 8), 'loja', JAG, '| módulos antes:', modAntes || '(nenhum)')
const funil = sql(`select id from funis where empresa_id=1 and padrao order by id limit 1`)
const etapa = sql(`select id from funil_etapas where empresa_id=1 and funil_id=${funil} and ativo and coalesce(tipo,'') not in ('ganho','perdido') order by ordem limit 1`)
const slugEtapa = sql(`select slug from funil_etapas where id=${etapa}`)

const X = sql(`insert into etiquetas (empresa_id, nome, cor) values (1, 'Pub X ${T}', 'azul') returning id`).split('\n')[0]
const Y = sql(`insert into etiquetas (empresa_id, nome, cor) values (1, 'Pub Y ${T}', 'verde') returning id`).split('\n')[0]
const novo = (n, loja, ativo = true) => {
  const c = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo) values (1, ${loja}, 'Pub ${n} ${T}', '55199007${String(7000 + n)}', '+55199007${String(7000 + n)}', 'pessoa') returning id`).split('\n')[0]
  const neg = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, dados) values (1, ${loja}, ${c}, ${funil}, ${etapa}, null, '{"_lead":{"kanban_status":"${slugEtapa}","ativo":${ativo}}}') returning id`).split('\n')[0]
  return { c, neg }
}
// M1, M2: com X desde o início. M4: com X, mas o negócio está INATIVO. J1: com X, em Jaguariúna.
// M3, M6, M7, M8, MA: entram depois. M5: só com Y (passa a valer quando a regra muda). Todos sem dono.
const M1 = novo(1, MOGI), M2 = novo(2, MOGI), M3 = novo(3, MOGI), M4 = novo(4, MOGI, false), M5 = novo(5, MOGI)
const M6 = novo(6, MOGI), M7 = novo(7, MOGI), M8 = novo(8, MOGI), J1 = novo(9, JAG), MA = novo(10, MOGI)
const TODOS = [M1, M2, M3, M4, M5, M6, M7, M8, J1, MA]
const negs = TODOS.map((x) => x.neg).join(','), cons = TODOS.map((x) => x.c).join(',')
const etq = (x, ...ids) => sql(`update contatos set etiqueta_ids = '{${ids.join(',')}}'::bigint[] where id=${x.c}`)
etq(M1, X); etq(M2, X); etq(M4, X); etq(J1, X); etq(M5, Y)
console.log('negócios', negs, '| etiquetas X', X, 'Y', Y)

const membros = (p) => sql(`select coalesce(string_agg(contato_id::text, ',' order by contato_id), '') from publicos_membros where publico_id=${p}`)
const so = (...xs) => xs.map((x) => Number(x.c)).sort((a, b) => a - b).join(',')
const execs = (auto) => sql(`select coalesce(string_agg(negocio_id || ':' || status || coalesce(':' || motivo, ''), ' | ' order by negocio_id), '') from automacao_execucoes where automacao_id=${auto}`)
const cron = () => fetch(`${BASE}/api/cron/automacoes`, { headers: { Authorization: `Bearer ${CRON}` } }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  // Servidor de dev frio: a 1ª visita de cada rota compila (minutos com a máquina apertada).
  ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(180000)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 160)))
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, metodo = 'GET', corpo) => page.evaluate(async ([u, m, c]) => {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: c ? JSON.stringify(c) : undefined })
  return { status: r.status, j: await r.json().catch(() => ({})) }
}, [url, metodo, corpo])
const pub = (page, corpo) => api(page, '/api/publicos', 'POST', corpo)

let P, PJ, A1, A2, TX, dono, vm, vj
try {
  dono = await entrar(E.dono); vm = await entrar(E.vend_mogi); vj = await entrar(E.vend_jag)

  // ── 1. Módulo desligado ─────────────────────────────────────────────────────────────────────────
  const off = await api(dono, '/api/publicos')
  confere(off.status === 403 && off.j.code === 'modulo_desligado', `desligado: /api/publicos 403 (${off.status} ${off.j.code})`)
  const autoOff = await api(dono, '/api/automatize')
  confere(autoOff.status === 200 && autoOff.j.porPublico === null && autoOff.j.publicos === null, 'desligado: Automatize sem a seção de público')
  const txOff = await api(dono, '/api/transmissao')
  confere(txOff.status === 200 && txOff.j.publicos === null, 'desligado: Transmissão sem "usar público salvo"')
  const gOff = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'entrou_no_publico', publico_id: 1, acao: 'criar_tarefa', titulo: `x ${T}` })
  confere(gOff.status === 403, `desligado: gatilho "entrou no público" recusado (${gOff.status})`)
  ligar('publicos', true)

  // ── 2. Prévia, criar (conta na hora, só negócio ativo), loja, quem grava ─────────────────────────
  const filtroX = { etiquetas_com: [Number(X)] }
  const prev = await pub(dono, { op: 'previa', filial_id: MOGI, filtro: filtroX })
  confere(prev.status === 200 && prev.j.previa.total === 2, `prévia Mogi com X = 2 (M1, M2; M4 inativo e J1 de Jaguariúna fora): ${JSON.stringify(prev.j.previa ?? prev.j)}`)
  const semLoja = await pub(dono, { op: 'criar', nome: `Sem loja ${T}`, filtro: filtroX })
  confere(semLoja.status === 400, `rede com 2 lojas: público sem loja recusado (${semLoja.j.error})`)
  const cP = await pub(dono, { op: 'criar', nome: `Pub Mogi ${T}`, filial_id: MOGI, filtro: filtroX })
  P = cP.j.id
  confere(cP.status === 200 && cP.j.total === 2 && cP.j.calculado_em, `cria P (${P}) e conta na hora: ${cP.j.total}`)
  confere(membros(P) === so(M1, M2), `membros de P = M1, M2 (${membros(P)})`)
  const dupl = await pub(dono, { op: 'criar', nome: `pub mogi ${T}`, filial_id: MOGI, filtro: {} })
  confere(dupl.status === 400 && /mesmo nome|Já existe/.test(dupl.j.error ?? ''), `nome repetido na loja recusado (${dupl.j.error})`)
  // Dono com a loja Mogi escolhida só alcança Mogi (a regra da Transmissão); na rede inteira, as duas.
  const fora = await pub(dono, { op: 'criar', nome: `Pub Jag ${T}`, filial_id: JAG, filtro: filtroX })
  confere(fora.status === 400 && /Loja inválida/.test(fora.j.error ?? ''), `dono em Mogi não cria em Jaguariúna (${fora.j.error})`)
  sql(`update usuarios set filial_atual_id=null where id='${DONO}'`)
  const cPJ = await pub(dono, { op: 'criar', nome: `Pub Jag ${T}`, filial_id: JAG, filtro: filtroX })
  sql(`update usuarios set filial_atual_id=${MOGI} where id='${DONO}'`)
  PJ = cPJ.j.id
  confere(cPJ.status === 200 && cPJ.j.total === 1 && membros(PJ) === so(J1), `dono na rede: público de Jaguariúna = J1 (${PJ ? membros(PJ) : JSON.stringify(cPJ.j)})`)
  const vCria = await pub(vm, { op: 'criar', nome: `Vend ${T}`, filial_id: MOGI, filtro: {} })
  confere(vCria.status === 403, `vendedor não cria público (${vCria.status})`)
  const vmLista = await api(vm, '/api/publicos'), vjLista = await api(vj, '/api/publicos')
  confere(vmLista.j.publicos?.some((p) => p.id === P) && !vmLista.j.publicos?.some((p) => p.id === PJ), 'vendedor de Mogi vê o de Mogi e não o de Jaguariúna')
  confere(vjLista.j.publicos?.some((p) => p.id === PJ) && !vjLista.j.publicos?.some((p) => p.id === P), 'vendedor de Jaguariúna vê o de Jaguariúna e não o de Mogi')
  confere(sqlErro(`set role authenticated; set request.jwt.claims='{"sub":"${VM}","role":"authenticated"}'; select count(*) from publicos_membros`) !== null, 'sessão não lê publicos_membros (só serviço)')
  confere(sqlErro(`set role authenticated; set request.jwt.claims='{"sub":"${DONO}","role":"authenticated"}'; select * from publicos_recalcular(${P}, true)`) !== null, 'sessão não chama publicos_recalcular')
  const txOn = await api(dono, '/api/transmissao')
  confere(Array.isArray(txOn.j.publicos) && txOn.j.publicos.some((p) => p.id === P), 'ligado: Transmissão oferece o público salvo')

  // ── 3. Gatilho "entrou no público": criar = ponto de partida; só quem entra dispara ─────────────
  const vAuto = await api(vm, '/api/automatize', 'POST', { op: 'criar', gatilho: 'entrou_no_publico', publico_id: P, acao: 'criar_tarefa', titulo: `x ${T}` })
  confere(vAuto.status === 403, `vendedor não cria automação (${vAuto.status})`)
  const a1 = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'entrou_no_publico', publico_id: P, acao: 'criar_tarefa', titulo: `PUB ENTROU {{nome}} ${T}` })
  A1 = a1.j.id
  confere(a1.status === 200 && A1 && execs(A1) === '', `automação A1 (${A1}) criada; ninguém de quem já estava disparou`)
  const ga = await api(dono, '/api/automatize')
  confere(ga.j.porPublico?.some((a) => a.id === A1 && a.publico_id === P), 'Automatize lista A1 em "Quando entra no público"')
  etq(M3, X)
  const r1 = await cron()
  confere(r1.status === 200 && r1.j.publicos?.entraram >= 1, `rodada: ${JSON.stringify(r1.j.publicos)}`)
  confere(membros(P) === so(M1, M2, M3), `M3 entrou (${membros(P)})`)
  confere(execs(A1) === `${M3.neg}:executada`, `só M3 disparou, e a fila rodou na mesma rodada (${execs(A1)})`)
  confere(sql(`select count(*) from tarefas where negocio_id=${M3.neg} and titulo like 'PUB ENTROU Pub 3 ${T}%'`) === '1', 'tarefa de M3 com {{nome}}')
  const r2 = await cron()
  confere(r2.status === 200 && execs(A1) === `${M3.neg}:executada`, 'rodada seguinte: ninguém dispara de novo')
  const calcPJ = sql(`select calculado_em from publicos where id=${PJ}`)
  await cron()
  confere(sql(`select calculado_em from publicos where id=${PJ}`) === calcPJ, 'rodada não reconta o público sem gatilho nem agendada (PJ)')

  // ── 4. Editar o filtro: reconta na hora sem disparar ─────────────────────────────────────────────
  const ed = await pub(dono, { op: 'editar', id: P, filtro: { etiquetas_com: [Number(X), Number(Y)] } })
  confere(ed.status === 200 && ed.j.recontou, 'editar filtro (X ou Y): recontou')
  confere(membros(P) === so(M1, M2, M3, M5), `M5 passou a valer pela regra nova (${membros(P)})`)
  confere(!execs(A1).includes(`${M5.neg}:`), 'M5 não disparou (regra nova não é "entrar")')
  await cron()
  confere(!execs(A1).includes(`${M5.neg}:`), 'nem na rodada seguinte')
  const soNome = await pub(dono, { op: 'editar', id: P, nome: `Pub Mogi ${T} (renomeado)` })
  confere(soNome.status === 200 && soNome.j.recontou === false, 'renomear não reconta')

  // ── 5. "Atualizar agora": reconta COM disparo ────────────────────────────────────────────────────
  etq(M6, Y)
  const at = await pub(dono, { op: 'atualizar', id: P })
  confere(at.status === 200 && at.j.entraram === 1 && at.j.agendadas === 1, `atualizar: M6 entrou (${JSON.stringify(at.j)})`)
  confere(execs(A1).includes(`${M6.neg}:executada`), `Atualizar: M6 executou NA HORA, sem esperar a rodada (${execs(A1)})`)
  confere(sql(`select count(*) from tarefas where negocio_id=${M6.neg} and responsavel_id is null`) === '1', 'tarefa de M6 sem responsável (negócio sem dono)')

  // ── 5b. Tarefa de negócio sem dono: "atribuir a" na automação; sem ninguém, a loja vê ────────────
  const ruim = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'entrou_no_publico', publico_id: P, acao: 'criar_tarefa', titulo: `x ${T}`, responsavel_sem_dono: '00000000-0000-0000-0000-000000000000' })
  confere(ruim.status === 400, `"atribuir a" de quem não é da equipe: recusado (${ruim.j.error})`)
  const a3 = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'entrou_no_publico', publico_id: P, acao: 'criar_tarefa', titulo: `PUB SEM DONO {{nome}} ${T}`, responsavel_sem_dono: VM })
  const A3 = a3.j.id
  confere(a3.status === 200 && sql(`select config->>'responsavel_sem_dono' from automacoes where id=${A3}`) === VM, 'A3 grava "se sem dono, atribuir ao vendedor de Mogi"')
  etq(MA, X)
  const atA = await pub(dono, { op: 'atualizar', id: P })
  confere(atA.j.entraram === 1, `MA entrou (${JSON.stringify(atA.j)})`)
  const tarefasMA = sql(`select coalesce(string_agg(split_part(titulo, ' ', 2) || ':' || coalesce(responsavel_id::text, 'ninguem'), ' | ' order by titulo), '') from tarefas where negocio_id=${MA.neg}`)
  confere(tarefasMA === `ENTROU:ninguem | SEM:${VM}`, `MA: A1 sem responsável, A3 para o vendedor de Mogi (${tarefasMA})`)
  await vm.goto(`${BASE}/tarefas`, { waitUntil: 'networkidle' })
  await vm.waitForSelector('[data-tarefa-sem-responsavel]', { timeout: 300000 }).catch(() => {})
  const telaVM = await vm.locator('body').innerText().catch(() => '')
  confere(telaVM.includes(`PUB ENTROU Pub 10 ${T}`) && telaVM.includes(`PUB SEM DONO Pub 10 ${T}`) && await vm.locator('[data-tarefa-sem-responsavel]').count() >= 1,
    'vendedor de Mogi vê em Tarefas a sem responsável (com o selo) e a atribuída a ele')
  await vj.goto(`${BASE}/tarefas`, { waitUntil: 'networkidle' })
  const telaVJ = await vj.locator('body').innerText().catch(() => '')
  confere(!telaVJ.includes(`Pub 10 ${T}`), 'vendedor de Jaguariúna não vê as tarefas de Mogi')
  await api(dono, '/api/automatize', 'POST', { op: 'ligar', tipo: 'automacao', id: A3, ativo: false })

  // ── 6. Espera + saiu do público = pulada ─────────────────────────────────────────────────────────
  const a2 = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'entrou_no_publico', publico_id: P, acao: 'criar_tarefa', titulo: `PUB 2 DIAS ${T}`, espera_dias: 2 })
  A2 = a2.j.id
  confere(a2.status === 200 && execs(A2) === '', `A2 (espera 2 dias, ${A2}) criada sem disparar (já havia gatilho ligado)`)
  etq(M7, X)
  await cron()
  confere(execs(A2) === `${M7.neg}:agendada`, `M7 entrou: A2 agendada para daqui a 2 dias (${execs(A2)})`)
  sql(`update automacao_execucoes set agendada_para = now() - interval '1 minute' where automacao_id=${A2}`)
  etq(M7)
  await cron()
  confere(execs(A2) === `${M7.neg}:pulada:saiu do público`, `M7 saiu antes da espera: pulada (${execs(A2)})`)

  // ── 7. Módulo desligado: nada dispara, a fila pula ───────────────────────────────────────────────
  etq(M8, X)
  sql(`insert into automacao_execucoes (empresa_id, filial_id, automacao_id, negocio_id, contato_id, acao, status, agendada_para) values (1, ${MOGI}, ${A1}, ${M1.neg}, ${M1.c}, 'criar_tarefa', 'agendada', now() - interval '1 minute')`)
  ligar('publicos', false)
  const r3 = await cron()
  confere(r3.status === 200 && !membros(P).split(',').includes(String(M8.c)), `desligado: a rodada não reconta (${JSON.stringify(r3.j.publicos)})`)
  confere(execs(A1).includes(`${M1.neg}:pulada:módulo Públicos desligado`), 'desligado: execução pendente pulada com o motivo')
  const offAt = await pub(dono, { op: 'atualizar', id: P })
  confere(offAt.status === 403, `desligado: API recusa (${offAt.status})`)
  ligar('publicos', true)

  // ── 8. Desligar e religar o gatilho: religar = ponto de partida ──────────────────────────────────
  for (const a of [A1, A2]) await api(dono, '/api/automatize', 'POST', { op: 'ligar', tipo: 'automacao', id: a, ativo: false })
  const antesM8 = execs(A1)
  await api(dono, '/api/automatize', 'POST', { op: 'ligar', tipo: 'automacao', id: A1, ativo: true })
  confere(membros(P).split(',').includes(String(M8.c)) && execs(A1) === antesM8, 'religar A1: M8 (entrou com tudo desligado) vira ponto de partida, sem disparo')
  await cron()
  confere(execs(A1) === antesM8, 'rodada depois de religar: M8 não dispara')

  // ── 9. Transmissão agendada refeita pelo público; a regra é a mesma da Transmissão ───────────────
  const modelo = sql(`select id from modelos_mensagem where empresa_id=1 order by id limit 1`)
  if (!modelo) falha('sem modelo na empresa 1 local para a transmissão de teste')
  else {
    TX = sql(`insert into transmissoes (empresa_id, filial_id, nome, modelo_id, filtro, publico_id, status, agendada_para) values (1, ${MOGI}, 'Pub TX ${T}', ${modelo}, '{}', ${P}, 'agendada', now() + interval '1 day') returning id`).split('\n')[0]
    const n = sql(`select transmissao_remontar(${TX})`)
    const lista = sql(`select coalesce(string_agg(contato_id::text, ',' order by contato_id), '') from transmissao_envios where transmissao_id=${TX}`)
    confere(lista === membros(P) && Number(n) === membros(P).split(',').length, `remontar: lista = membros do público (${n}: ${lista})`)
    confere(sql(`select filtro = (select filtro from publicos where id=${P}) from transmissoes where id=${TX}`) === 't', 'remontar: a transmissão guarda o filtro do público')
    confere(!lista.split(',').includes(String(M4.c)), 'negócio inativo fora da transmissão também')
    const apagaAg = await pub(dono, { op: 'apagar', id: P })
    confere(apagaAg.status === 409, `apagar com transmissão agendada: recusado (${apagaAg.j.error})`)
    sql(`update transmissoes set status='encerrada' where id=${TX}`)
  }

  // ── 10. Telas ────────────────────────────────────────────────────────────────────────────────────
  // O passo 7 desligou e religou o módulo pelo banco; a trava de rota do proxy guarda os módulos da
  // empresa por 60 s (TTL_MODULOS_MS): antes disso a tela ainda cairia na vitrine.
  await new Promise((r) => setTimeout(r, 65000))
  await dono.goto(`${BASE}/publicos`, { waitUntil: 'networkidle' })
  await dono.waitForSelector(`[data-publico-linha="${P}"]`, { timeout: 300000 }).then(() => ok('tela /publicos lista P'), () => falha('tela /publicos sem P'))
  const linha = await dono.locator(`[data-publico-linha="${P}"]`).innerText().catch(() => '')
  confere(/atualizado (agora|há \d+ min)/.test(linha) && linha.includes('de hora em hora'), `linha diz de quando é a conta: "${linha.replace(/\s+/g, ' ').slice(0, 160)}"`)
  confere(linha.includes(sql(`select total from publicos where id=${P}`)), 'linha mostra o total')
  await dono.locator(`[data-publico-linha="${P}"] [data-publico-editar]`).click()
  await dono.waitForSelector('[data-publico-form] [data-previa-total]', { timeout: 120000 })
  await dono.waitForFunction(() => /\d/.test(document.querySelector('[data-previa-total]')?.textContent ?? ''), null, { timeout: 120000 }).catch(() => {})
  confere((await dono.locator('[data-previa-total]').innerText()).trim() === sql(`select total from publicos where id=${P}`), 'editar: prévia = total')
  await vm.goto(`${BASE}/publicos`, { waitUntil: 'networkidle' })
  await vm.waitForSelector(`[data-publico-linha="${P}"]`, { timeout: 300000 }).catch(() => {})
  confere(await vm.locator(`[data-publico-linha="${P}"]`).count() === 1 && await vm.locator('[data-publico-editar]').count() === 0 && await vm.locator('[data-novo-publico]').count() === 0, 'vendedor vê e não edita')
  await dono.goto(`${BASE}/transmissao`, { waitUntil: 'networkidle' })
  await dono.getByRole('button', { name: 'Nova transmissão' }).click()
  await dono.waitForSelector('[data-transmissao-form] [data-usar-publico]', { timeout: 120000 }).then(() => ok('Transmissão: campo "Usar público salvo"'), () => falha('Transmissão sem "Usar público salvo"'))
  // O bloco de etiquetas aparece quando a lista de etiquetas chega (busca à parte).
  await dono.waitForSelector('[data-transmissao-form] [data-filtro-etiquetas-transmissao]', { timeout: 60000 })
    .then(() => ok('Transmissão: filtro livre continua (componente compartilhado)'), () => falha('Transmissão: filtro livre sem o bloco de etiquetas'))

  // ── 11. Apagar: leva as automações ───────────────────────────────────────────────────────────────
  const apaga = await pub(dono, { op: 'apagar', id: P })
  confere(apaga.status === 200 && sql(`select count(*) from automacoes where id in (${A1}, ${A2})`) === '0' && sql(`select count(*) from publicos_membros where publico_id=${P}`) === '0', 'apagar P: leva A1, A2 e os membros')
  confere(!TX || sql(`select publico_id is null from transmissoes where id=${TX}`) === 't', 'transmissão feita com P fica, sem o vínculo')
  P = null
} catch (e) {
  falha('erro: ' + (e?.stack ?? e))
} finally {
  sql(`delete from tarefas where negocio_id in (${negs})`)
  sql(`delete from automacao_execucoes where negocio_id in (${negs})`)
  sql(`delete from automacoes where empresa_id=1 and config->>'titulo' like '%${T}%'`)
  if (TX) sql(`delete from transmissoes where id=${TX}`)
  sql(`delete from publicos where empresa_id=1 and nome like '%${T}%'`)
  sqlErro(`delete from eventos where tipo='publicos.rodada' and empresa_id=1 and (dados->>'entraram')::int < 10`)
  sql(`delete from negocios where id in (${negs})`)
  sql(`delete from contatos where id in (${cons})`)
  sql(`delete from etiquetas where empresa_id=1 and nome like '%${T}%'`)
  sql(`update empresa_usuarios set ativo=${vjAtivoAntes === 't' ? 'true' : 'false'} where empresa_id=1 and usuario_id='${VJ}'`)
  sql(`update usuarios set filial_atual_id=${filialDonoAntes} where id='${DONO}'`)
  sql(`delete from empresa_modulos where empresa_id=1 and modulo in ('publicos','transmissao')`)
  for (const par of modAntes ? modAntes.split(',') : []) { const [m, a] = par.split('='); ligar(m, a === 't' || a === 'true') }
  await browser.close()
  const sobra = sql(`select (select count(*) from publicos where nome like '%${T}%') + (select count(*) from contatos where nome like 'Pub % ${T}') + (select count(*) from etiquetas where nome like '%${T}%')`)
  confere(sobra === '0', 'limpeza: nada de teste sobrou')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
