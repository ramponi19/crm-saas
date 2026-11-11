// ETIQUETAS (core, 11/11/2026) — app LOCAL :3010 + Supabase LOCAL. Dono e vendedores das DUAS lojas.
// Cria a própria cena (contatos, negócios, conversas, etiquetas e automações de TESTE) e desfaz no fim.
// Cobre: criar/renomear/apagar (só dono/admin), aplicar/tirar no card e em lote no quadro, alcance por
// loja (vendedor de Mogi não etiqueta lead de Jaguariúna e vice-versa), histórico do negócio, filtro
// contém / não contém no quadro, na Comunicação, na busca (⌘K) e na Transmissão (SQL), gatilho
// "recebeu etiqueta" com as travas, fusão de contatos somando etiquetas, validação no banco.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = `host=127.0.0.1 port=${process.env.DB_PORT ?? 54322} dbname=postgres user=postgres password=postgres`
// SQL pela entrada padrão: acento no -c quebra o psql do Windows.
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const sqlErro = (q) => { try { sql(q); return null } catch (e) { return String(e.stderr || e.message) } }
const comoRls = (uid, q) => sql(`set role authenticated; set request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; ${q}`).split('\n').pop()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const CRON = 'cron-local-de-teste'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()

const uid = (email) => sql(`select id from auth.users where email='${email}'`)
const DONO = uid(E.dono), VM = uid(E.vend_mogi), VJ = uid(E.vend_jag)
const lojaDe = (u) => sql(`select filial_id from empresa_usuarios where empresa_id=1 and usuario_id='${u}'`)
const MOGI = lojaDe(VM), JAG = lojaDe(VJ)
// Na cópia de 09/11 o vendedor de Jaguariúna de teste está INATIVO (sem empresa na sessão, não alcança
// nada). Ativo só durante o teste, só no banco local; o estado de antes volta no fim.
const vjAtivoAntes = sql(`select ativo from empresa_usuarios where empresa_id=1 and usuario_id='${VJ}'`)
sql(`update empresa_usuarios set ativo=true where empresa_id=1 and usuario_id='${VJ}'`)
console.log('dono', DONO.slice(0, 8), '| vend Mogi', VM.slice(0, 8), 'loja', MOGI, '| vend Jag', VJ.slice(0, 8), 'loja', JAG)
confere(MOGI && JAG && MOGI !== JAG, `duas lojas (Mogi ${MOGI}, Jaguariúna ${JAG})`)
sql(`update usuarios set filial_atual_id=${MOGI} where id='${DONO}'`)
const funil = sql(`select id from funis where empresa_id=1 and padrao order by id limit 1`)
const etapa = sql(`select id from funil_etapas where empresa_id=1 and funil_id=${funil} and ativo and coalesce(tipo,'') not in ('ganho','perdido') order by ordem limit 1`)
const slugEtapa = sql(`select slug from funil_etapas where id=${etapa}`)
const canalMogi = sql(`select id from canais where empresa_id=1 and filial_id=${MOGI} order by id limit 1`)

const novo = (n, loja) => {
  const c = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo) values (1, ${loja}, 'Etq ${n} ${T}', '55199008${String(7000 + n)}', '+55199008${String(7000 + n)}', 'pessoa') returning id`).split('\n')[0]
  const neg = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, dados) values (1, ${loja}, ${c}, ${funil}, ${etapa}, null, '{"_lead":{"kanban_status":"${slugEtapa}","ativo":true}}') returning id`).split('\n')[0]
  return { c, neg }
}
const M1 = novo(1, MOGI), M2 = novo(2, MOGI), M3 = novo(3, MOGI), J1 = novo(4, JAG)
const TODOS = [M1, M2, M3, J1]
const negs = TODOS.map((x) => x.neg).join(','), cons = TODOS.map((x) => x.c).join(',')
if (canalMogi) {
  for (const x of [M1, M2, M3]) sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id, ultima_mensagem_at, ultima_recebida_at) values (1, ${MOGI}, ${x.c}, ${canalMogi}, now(), now())`)
}
console.log('negócios', negs, '| contatos', cons, '| canal Mogi', canalMogi || '(nenhum)')
const etqDe = (c) => sql(`select etiqueta_ids::text from contatos where id=${c}`)
const hist = (neg) => sql(`select coalesce(string_agg(acao || ':' || coalesce(detalhe->>'nome','') || ':' || coalesce(por_usuario::text,'-') || coalesce(':' || (detalhe->>'motivo'), ''), ' | ' order by id), '') from negocio_historico where negocio_id=${neg} and acao like 'etiqueta_%'`)

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
const aplicar = (page, negocios, etiqueta_id, aplicar = true) => api(page, '/api/leads/etiquetas/aplicar', 'POST', { negocios: negocios.map(Number), etiqueta_id: Number(etiqueta_id), aplicar })

let A, B, dono, vm, vj
try {
  dono = await entrar(E.dono); vm = await entrar(E.vend_mogi); vj = await entrar(E.vend_jag)
  // ── 1. Criar / validar / quem pode ────────────────────────────────────────────────────────────
  const rA = await api(dono, '/api/leads/etiquetas', 'POST', { nome: `  Etq A   ${T} `, cor: 'azul' })
  const rB = await api(dono, '/api/leads/etiquetas', 'POST', { nome: `Etq B ${T}`, cor: 'vermelho' })
  A = rA.j.etiqueta?.id; B = rB.j.etiqueta?.id
  confere(rA.status === 200 && rB.status === 200 && rA.j.etiqueta.nome === `Etq A ${T}`, `dono cria A (${A}, espaços limpos) e B (${B})`)
  const dup = await api(dono, '/api/leads/etiquetas', 'POST', { nome: `ETQ a ${T}`, cor: 'verde' })
  confere(dup.status === 400 || dup.status === 409, `nome repetido em outra caixa recusado (${dup.status}: ${dup.j.error})`)
  confere(sqlErro(`insert into etiquetas (empresa_id, nome) values (1, ' etq b ${T} ')`) !== null, 'banco recusa nome repetido (índice único sem caixa/espaços)')
  confere(sqlErro(`insert into etiquetas (empresa_id, nome, cor) values (1, 'cor ${T}', '#ff0000')`) !== null, 'banco recusa cor fora da paleta')
  const vCria = await api(vm, '/api/leads/etiquetas', 'POST', { nome: `Vend ${T}` })
  const vRen = await api(vm, '/api/leads/etiquetas', 'PATCH', { id: A, nome: 'hack' })
  const vDel = await api(vm, `/api/leads/etiquetas?id=${A}`, 'DELETE')
  confere(vCria.status === 403 && vRen.status === 403 && vDel.status === 403, `vendedor não cria/renomeia/apaga (${vCria.status}/${vRen.status}/${vDel.status})`)
  confere(sqlErro(`set role authenticated; set request.jwt.claims='{"sub":"${VM}","role":"authenticated"}'; insert into etiquetas (empresa_id, nome) values (1, 'rls ${T}')`) !== null, 'RLS barra o insert direto do vendedor')
  confere(comoRls(VM, `with x as (update etiquetas set nome='hack' where id=${A} returning 1) select count(*) from x`) === '0', 'RLS: update direto do vendedor afeta 0 linhas')
  const vLista = await api(vm, '/api/leads/etiquetas')
  confere(vLista.status === 200 && vLista.j.etiquetas.some((e) => e.id === A), 'vendedor lê a lista')

  // ── 2. Card do lead pela tela (dono): aplicar, chip, histórico ───────────────────────────────
  await dono.goto(`${BASE}/leads?lead=${M1.neg}`, { waitUntil: 'networkidle' })
  await dono.waitForSelector('[data-painel-etiquetas]', { timeout: 300000 })
  await dono.locator('[data-painel-etiquetas] [data-escolher-etiqueta]').click()
  await dono.locator(`[data-painel-etiquetas] [data-opcao-etiqueta="${A}"]`).click()
  // A 1ª chamada da rota compila no servidor frio: espera o selo, não um tempo fixo.
  await dono.waitForSelector(`[data-painel-etiquetas] [data-etiqueta="${A}"]`, { timeout: 300000 }).catch(() => {})
  confere(etqDe(M1.c) === `{${A}}`, `card: A aplicada no contato (${etqDe(M1.c)})`)
  confere(await dono.locator(`[data-painel-etiquetas] [data-etiqueta="${A}"]`).count() === 1, 'card: selo de A aparece')
  confere(hist(M1.neg) === `etiqueta_aplicada:Etq A ${T}:${DONO}`, `histórico: ${hist(M1.neg)}`)
  await dono.waitForSelector('[data-historico-negocio] [data-historico-acao="etiqueta_aplicada"]', { timeout: 120000 }).then(() => ok('card: histórico do negócio mostra "Etiqueta aplicada"'), () => falha('card: histórico do negócio sem a linha'))
  const linhaHist = await dono.locator('[data-historico-negocio] [data-historico-acao="etiqueta_aplicada"]').first().innerText().catch(() => '')
  confere(linhaHist.includes(`Etq A ${T}`), `linha do histórico: "${linhaHist.replace(/\s+/g, ' ')}"`)
  await dono.keyboard.press('Escape')

  // ── 3. Alcance por loja (vendedores das duas lojas) ───────────────────────────────────────────
  const vmM2 = await aplicar(vm, [M2.neg], B)
  confere(vmM2.status === 200 && vmM2.j.negocios?.includes(Number(M2.neg)) && etqDe(M2.c) === `{${B}}`, `vendedor de Mogi aplica B no lead de Mogi (${JSON.stringify(vmM2.j)})`)
  const vmJ1 = await aplicar(vm, [J1.neg], B)
  confere(vmJ1.status === 200 && vmJ1.j.alcancados === 0 && etqDe(J1.c) === '{}', `vendedor de Mogi NÃO alcança o lead de Jaguariúna (alcançados ${vmJ1.j.alcancados}, contato ${etqDe(J1.c)})`)
  const vjJ1 = await aplicar(vj, [J1.neg], A)
  confere(vjJ1.status === 200 && etqDe(J1.c) === `{${A}}`, `vendedor de Jaguariúna aplica A no lead dele (${etqDe(J1.c)})`)
  const vjM1 = await aplicar(vj, [M1.neg], B)
  confere(vjM1.j.alcancados === 0 && etqDe(M1.c) === `{${A}}`, 'vendedor de Jaguariúna NÃO alcança o lead de Mogi')
  const vmTira = await aplicar(vm, [M1.neg], A, false)
  confere(vmTira.status === 200 && etqDe(M1.c) === '{}' && hist(M1.neg).endsWith(`etiqueta_tirada:Etq A ${T}:${VM}`), `vendedor tira A (histórico: ${hist(M1.neg)})`)
  const deNovo = await aplicar(vm, [M2.neg], B)
  confere(deNovo.j.negocios?.length === 0 && hist(M2.neg).split(' | ').length === 1, 'aplicar de novo não muda nada nem duplica histórico')
  const inexist = await aplicar(vm, [M2.neg], 99999999)
  confere(inexist.status === 404, `etiqueta inexistente = 404 (${inexist.status})`)

  // ── 4. Lote no quadro (dono, Mogi) ────────────────────────────────────────────────────────────
  await dono.goto(`${BASE}/leads`, { waitUntil: 'networkidle' })
  await dono.waitForSelector(`[data-lead-id="${M1.neg}"]`, { timeout: 300000 })
  await dono.locator('[data-selecionar-cartoes]').click()
  await dono.locator(`[data-lead-id="${M1.neg}"]`).click()
  await dono.locator(`[data-lead-id="${M3.neg}"]`).click()
  confere(await dono.locator('[data-selecionado="true"]').count() === 2, 'quadro: 2 cartões marcados')
  await dono.locator('[data-barra-lote] [data-escolher-etiqueta]').first().click()
  await dono.locator(`[data-barra-lote] [data-opcao-etiqueta="${A}"]`).first().click()
  await espera(2000)
  confere(etqDe(M1.c) === `{${A}}` && etqDe(M3.c) === `{${A}}` && etqDe(M2.c) === `{${B}}`, `lote: A em M1 e M3, M2 intacto (${etqDe(M1.c)} ${etqDe(M3.c)} ${etqDe(M2.c)})`)
  confere(await dono.locator(`[data-lead-id="${M3.neg}"] [data-etiqueta="${A}"]`).count() === 1, 'lote: selo no cartão do quadro na hora')
  await dono.reload({ waitUntil: 'networkidle' })
  await dono.waitForSelector(`[data-lead-id="${M1.neg}"] [data-etiqueta="${A}"]`, { timeout: 300000 }).then(() => ok('quadro recarregado: selo vem do banco'), () => falha('quadro recarregado sem o selo'))

  // ── 5. Filtro no quadro: contém / não contém ─────────────────────────────────────────────────
  await dono.locator('[data-filtro-etiquetas]').click()
  await dono.locator(`[data-filtro-etiqueta="${A}"]`).click()
  await espera(2500)
  const ids = async () => dono.locator('[data-lead-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-lead-id')))
  let naTela = await ids()
  confere(naTela.includes(M1.neg) && naTela.includes(M3.neg) && !naTela.includes(M2.neg), `contém A: M1 e M3, sem M2 (${naTela.length} cartões)`)
  confere(naTela.every((id) => sql(`select (c.etiqueta_ids @> array[${A}::bigint])::text from negocios n join contatos c on c.id=n.contato_id where n.id=${id}`) === 'true'), 'contém A: todo cartão na tela tem A')
  await dono.locator(`[data-filtro-etiqueta="${A}"]`).click()
  await espera(2500)
  naTela = await ids()
  confere(!naTela.includes(M1.neg) && !naTela.includes(M3.neg) && naTela.includes(M2.neg), `não contém A: sai M1/M3, fica M2 (${naTela.length} cartões)`)
  const cont = comoRls(DONO, `select quadro_contagens(${funil}, null, false, null, array[${A}]::bigint[], null)::text`)
  const totalA = Object.values(JSON.parse(cont).etapas).reduce((s, e) => s + e.total, 0)
  confere(totalA === Number(sql(`select count(*) from negocios n join contatos c on c.id=n.contato_id where n.empresa_id=1 and n.filial_id=${MOGI} and n.ativo and coalesce(n.funil_id, ${funil})=${funil} and c.etiqueta_ids @> array[${A}::bigint]`)), `quadro_contagens com A = SQL direto (${totalA})`)
  await dono.locator(`[data-filtro-etiqueta="${A}"]`).click()

  // ── 6. Comunicação ────────────────────────────────────────────────────────────────────────────
  if (canalMogi) {
    const convM1 = sql(`select id from conversas where contato_id=${M1.c}`), convM2 = sql(`select id from conversas where contato_id=${M2.c}`)
    await dono.goto(`${BASE}/comunicacao?et=${A}`, { waitUntil: 'networkidle' })
    await dono.waitForSelector('[data-lista-conversas]', { timeout: 300000 }); await espera(2500)
    const convs = async () => dono.locator('[data-conversa-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-conversa-id')))
    let lista = await convs()
    confere(lista.includes(convM1) && !lista.includes(convM2), `Comunicação contém A: conversa de M1 sim, M2 não (${lista.length})`)
    confere(await dono.locator(`[data-conversa-id="${convM1}"] [data-etiqueta="${A}"]`).count() === 1, 'Comunicação: selo na lista')
    await dono.goto(`${BASE}/comunicacao?etn=${A}`, { waitUntil: 'networkidle' }); await espera(2500)
    lista = await convs()
    confere(!lista.includes(convM1) && lista.includes(convM2), `Comunicação não contém A: M1 sai, M2 fica (${lista.length})`)
    await dono.goto(`${BASE}/comunicacao?filtro=aguardando&et=${A}`, { waitUntil: 'networkidle' }); await espera(2500)
    lista = await convs()
    confere(lista.every((id) => sql(`select (c.etiqueta_ids @> array[${A}::bigint])::text from conversas x join contatos c on c.id=x.contato_id where x.id=${id}`) === 'true'), `aguardando + contém A: só quem tem A (${lista.length})`)
  } else falha('sem canal em Mogi no banco local: Comunicação não testada')

  // ── 7. Busca (⌘K) só com etiqueta ─────────────────────────────────────────────────────────────
  await dono.goto(`${BASE}/leads`, { waitUntil: 'networkidle' })
  await dono.keyboard.press('Control+k')
  await dono.waitForSelector('[data-filtro-etiquetas-linha]', { timeout: 120000 })
  await dono.locator(`[data-filtro-etiquetas-linha] [data-filtro-etiqueta="${A}"]`).click()
  await espera(2500)
  const busca = await dono.locator('[data-idx]').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
  confere(busca.some((t) => t.includes(`Etq 1 ${T}`)) && busca.some((t) => t.includes(`Etq 3 ${T}`)) && !busca.some((t) => t.includes(`Etq 2 ${T}`)), 'busca só com "contém A": M1 e M3, sem M2')
  await dono.keyboard.press('Escape')

  // ── 8. Transmissão (a função do público) ──────────────────────────────────────────────────────
  const pub = (f) => sql(`select coalesce(string_agg(contato_id::text, ',' order by contato_id), '') from transmissao_publico(1, ${MOGI}, '${JSON.stringify(f)}'::jsonb, null) where contato_id in (${cons})`)
  confere(pub({ etiquetas_com: [A] }) === [M1.c, M3.c].sort((a, b) => a - b).join(','), `Transmissão contém A: ${pub({ etiquetas_com: [A] })}`)
  confere(pub({ etiquetas_sem: [A] }) === M2.c, `Transmissão não contém A: ${pub({ etiquetas_sem: [A] })}`)
  confere(pub({ etiquetas_com: [A, B] }) === [M1.c, M2.c, M3.c].sort((a, b) => a - b).join(','), 'Transmissão contém A ou B: os três de Mogi')

  // ── 9. Automatize: "recebeu etiqueta" ─────────────────────────────────────────────────────────
  const vAuto = await api(vm, '/api/automatize', 'POST', { op: 'criar', gatilho: 'recebeu_etiqueta', etiqueta_id: B, acao: 'criar_tarefa', titulo: `x ${T}` })
  confere(vAuto.status === 403, `vendedor não cria automação (${vAuto.status})`)
  const auto = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'recebeu_etiqueta', etiqueta_id: B, acao: 'criar_tarefa', titulo: `ETQ TAREFA {{nome}} ${T}` })
  const autoEspera = await api(dono, '/api/automatize', 'POST', { op: 'criar', gatilho: 'recebeu_etiqueta', etiqueta_id: B, acao: 'criar_tarefa', titulo: `ETQ 2 DIAS ${T}`, espera_dias: 2 })
  confere(auto.status === 200 && autoEspera.status === 200, `dono cria 2 automações de B (${auto.j.id}, ${autoEspera.j.id})`)
  const ga = await api(dono, '/api/automatize')
  confere((ga.j.porEtiqueta ?? []).filter((a) => a.etiqueta_id === B).length === 2, 'GET devolve as automações por etiqueta')
  await aplicar(vm, [M3.neg], B)
  await espera(1500)
  const ex3 = sql(`select coalesce(string_agg(status, ',' order by id), '') from automacao_execucoes where negocio_id=${M3.neg}`)
  confere(ex3 === 'executada,agendada' && sql(`select count(*) from tarefas where negocio_id=${M3.neg} and titulo='ETQ TAREFA Etq 3 ${T} ${T}'`) === '1', `recebeu B: tarefa na hora + "2 dias" agendada (${ex3})`)
  await aplicar(vm, [M3.neg], B)
  confere(sql(`select count(*) from automacao_execucoes where negocio_id=${M3.neg}`) === '2', 'já tinha B: não dispara de novo')
  // A etiqueta sai antes da espera: a execução agendada é pulada pelo cron.
  await aplicar(vm, [M3.neg], B, false)
  sql(`update automacao_execucoes set agendada_para = now() - interval '1 minute' where negocio_id=${M3.neg} and status='agendada'`)
  const c = await fetch(`${BASE}/api/cron/automacoes`, { headers: { Authorization: `Bearer ${CRON}` } }).then((r) => r.status)
  confere(c === 200 && sql(`select status || ':' || coalesce(motivo,'') from automacao_execucoes where negocio_id=${M3.neg} and automacao_id=${autoEspera.j.id}`) === 'pulada:a etiqueta saiu do contato', 'tirou B antes da espera: pulada pelo cron')
  // Pausa da empresa vale para o gatilho de etiqueta também.
  sql(`insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'automacoes_pausadas', '{"pausado":true}') on conflict (empresa_id, chave) do update set valor = excluded.valor`)
  await aplicar(vm, [M1.neg], B)
  confere(sql(`select count(*) from automacao_execucoes where negocio_id=${M1.neg}`) === '0', 'automações pausadas: recebeu B e nada agendou')
  sql(`delete from configuracoes_sistema where empresa_id=1 and chave='automacoes_pausadas'`)

  // ── 10. Renomear: card mostra o nome novo; histórico guarda o do momento ─────────────────────
  const ren = await api(dono, '/api/leads/etiquetas', 'PATCH', { id: A, nome: `Etq A2 ${T}`, cor: 'verde' })
  confere(ren.status === 200 && sql(`select nome || ':' || cor from etiquetas where id=${A}`) === `Etq A2 ${T}:verde`, 'renomeia e troca a cor')
  confere(hist(M1.neg).includes(`etiqueta_aplicada:Etq A ${T}`), 'histórico guarda o nome do momento')

  // ── 11. Validação no banco + fusão ────────────────────────────────────────────────────────────
  confere(sqlErro(`update contatos set etiqueta_ids = '{99999999}' where id=${M2.c}`) !== null, 'banco recusa etiqueta inexistente no contato')
  const outraEmpresa = sql(`select id from empresas where id <> 1 order by id limit 1`)
  if (outraEmpresa) {
    const X = sql(`insert into etiquetas (empresa_id, nome) values (${outraEmpresa}, 'outra ${T}') returning id`).split('\n')[0]
    confere(sqlErro(`update contatos set etiqueta_ids = array[${X}::bigint] where id=${M2.c}`) !== null, 'banco recusa etiqueta de OUTRA empresa')
    sql(`delete from etiquetas where id=${X}`)
  }
  sql(`update contatos set etiqueta_ids = array[${B}, ${A}, ${B}]::bigint[] where id=${M2.c}`)
  confere(etqDe(M2.c) === `{${Math.min(A, B)},${Math.max(A, B)}}`, `normaliza (sem repetição, em ordem): ${etqDe(M2.c)}`)
  sql(`update contatos set etiqueta_ids = '{}' where id=${J1.c}; update contatos set etiqueta_ids = array[${B}]::bigint[] where id=${J1.c}`)
  sql(`update contatos set etiqueta_ids = array[${A}]::bigint[] where id=${M1.c}`)
  sql(`select core_fundir_contatos(1, ${M1.c}, ${J1.c})`)
  confere(etqDe(M1.c) === `{${Math.min(A, B)},${Math.max(A, B)}}`, `fusão: principal com as etiquetas dos dois (${etqDe(M1.c)})`)
  confere(sql(`select count(*) from negocio_historico where negocio_id=${M1.neg} and acao='etiqueta_aplicada' and detalhe->>'motivo'='fusão de contatos'`) === '1', 'fusão: histórico com o motivo')

  // ── 12. Apagar: sai dos contatos (com histórico) e leva as automações ─────────────────────────
  const del = await api(dono, `/api/leads/etiquetas?id=${B}`, 'DELETE')
  confere(del.status === 200 && sql(`select count(*) from contatos where etiqueta_ids @> array[${B}::bigint]`) === '0', 'apagar B: sai de todos os contatos')
  confere(sql(`select count(*) from negocio_historico where negocio_id=${M2.neg} and acao='etiqueta_tirada' and detalhe->>'motivo'='etiqueta apagada' and detalhe->>'nome'='Etq B ${T}'`) === '1', 'apagar B: histórico "tirada (etiqueta apagada)" com o nome')
  confere(sql(`select count(*) from automacoes where etiqueta_id=${B}`) === '0', 'apagar B: automações dela apagadas')
  B = null

  // ── 13. Configurações → Etiquetas (tela) ──────────────────────────────────────────────────────
  await dono.goto(`${BASE}/configuracoes/etiquetas`, { waitUntil: 'networkidle' })
  await dono.waitForSelector(`[data-linha-etiqueta="${A}"]`, { timeout: 300000 }).then(() => ok('Configurações → Etiquetas lista a etiqueta'), () => falha('tela de Configurações sem a etiqueta'))
  await vm.goto(`${BASE}/configuracoes/etiquetas`, { waitUntil: 'networkidle' })
  confere(!vm.url().includes('/configuracoes/etiquetas') || await vm.locator('[data-config-etiquetas]').count() === 0, `vendedor não abre a tela de Configurações (${new URL(vm.url()).pathname})`)
} catch (e) {
  falha('erro: ' + (e?.stack ?? e))
} finally {
  sql(`delete from tarefas where negocio_id in (${negs})`)
  sql(`delete from automacao_execucoes where negocio_id in (${negs})`)
  sql(`delete from automacoes where empresa_id=1 and config->>'titulo' like '%${T}%'`)
  sql(`delete from configuracoes_sistema where empresa_id=1 and chave='automacoes_pausadas'`)
  sql(`delete from negocios where id in (${negs})`)
  sql(`delete from conversas where contato_id in (${cons})`)
  sql(`delete from contato_fusoes where contato_principal_id in (${cons}) or contato_removido_id in (${cons})`)
  sql(`delete from eventos where entidade='contato' and entidade_id in (${cons})`)
  sql(`delete from contatos where id in (${cons})`)
  sql(`delete from etiquetas where empresa_id=1 and nome like '%${T}%'`)
  sql(`update empresa_usuarios set ativo=${vjAtivoAntes === 't' ? 'true' : 'false'} where empresa_id=1 and usuario_id='${VJ}'`)
  await browser.close()
  const sobra = sql(`select (select count(*) from etiquetas where nome like '%${T}%') + (select count(*) from contatos where nome like 'Etq % ${T}')`)
  confere(sobra === '0', 'limpeza: nada de teste sobrou')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
