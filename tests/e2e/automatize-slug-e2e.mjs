// AUTOMATIZE — dois funis com uma etapa de MESMO slug (o unique é por funil). A automação
// criada na etapa do funil B não pode disparar em quem entra na etapa homônima do funil A,
// nem aparecer embaixo dela; e dispara para quem entra na do B. Só local, tudo devolvido no fim.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const PSQL = 'C:/Ferramentas/pgsql-18.4/bin/psql.exe'
const CONN = 'host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres'
const sql = (q) => execFileSync(PSQL, [CONN, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const confere = (c, m) => { if (!c) falhas.push(m); console.log(c ? 'ok  ' : 'FALHA', m) }
const T = Date.now()

sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
const [etA, etB] = sql(`select string_agg(slug, ',' order by ordem) from (select slug, ordem from funil_etapas where empresa_id=1 and funil_id=1 and ativo and coalesce(tipo,'') not in ('ganho','perdido') order by ordem limit 2) x`).split(',')
const etapaA1 = sql(`select id from funil_etapas where funil_id=1 and slug='${etA}'`)
const funil2 = sql(`insert into funis (empresa_id, nome, padrao, interno) values (1, 'Funil slug ${T}', false, false) returning id`).split('\n')[0]
const e2a = sql(`insert into funil_etapas (empresa_id, funil_id, ordem, slug, label, tipo, ativo) values (1, ${funil2}, 0, 'entrada_${T}', 'Entrada', 'normal', true) returning id`).split('\n')[0]
const e2b = sql(`insert into funil_etapas (empresa_id, funil_id, ordem, slug, label, tipo, ativo) values (1, ${funil2}, 1, '${etB}', 'Mesmo slug', 'normal', true) returning id`).split('\n')[0]
const contato = (n) => sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo) values (1, 3, 'Slug ${n} ${T}', '5519900008${n}0', '+5519900008${n}0', 'pessoa') returning id`).split('\n')[0]
const negA = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, dados) values (1, 3, ${contato(1)}, 1, ${etapaA1}, '${DONO}', '{"_lead":{"kanban_status":"${etA}","ativo":true}}') returning id`).split('\n')[0]
const negB = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, responsavel_id, dados) values (1, 3, ${contato(2)}, ${funil2}, ${e2a}, '${DONO}', '{"_lead":{"kanban_status":"entrada_${T}","ativo":true}}') returning id`).split('\n')[0]
console.log(`funil ${funil2}: etapa ${e2b} com o slug "${etB}" (o mesmo da etapa do funil 1) | negócios A=${negA} B=${negB}`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext()).newPage()
await page.goto(BASE + '/login')
await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
const api = (url, corpo) => page.evaluate(async ([u, c]) => { const r = await fetch(u, c ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) } : undefined); return { status: r.status, j: await r.json().catch(() => ({})) } }, [url, corpo])
const execs = (neg) => sql(`select coalesce(string_agg(acao || ':' || status, ' | ' order by id), '') from automacao_execucoes where negocio_id=${neg}`)

let auto = null
try {
  // A tela manda o id da etapa (como o componente faz).
  const r = await api('/api/automatize', { op: 'criar', etapa_id: Number(e2b), etapa_slug: etB, acao: 'criar_tarefa', titulo: `SLUG ${T}`, espera_dias: 0 })
  auto = r.j.id
  confere(r.status === 200 && sql(`select etapa_id from automacoes where id=${auto}`) === e2b, `criada na etapa do funil 2 (automação ${auto}, etapa ${e2b})`)
  // Sem o id, o slug repetido é ambíguo: recusa em vez de escolher uma.
  const amb = await api('/api/automatize', { op: 'criar', etapa_slug: etB, acao: 'criar_tarefa', titulo: `AMBIGUO ${T}` })
  confere(amb.status === 400, `só o slug repetido, sem o id: recusa (HTTP ${amb.status})`)

  const q1 = await api('/api/automatize?funil=1'); const q2 = await api(`/api/automatize?funil=${funil2}`)
  const noF1 = (q1.j.etapas ?? []).find((e) => e.slug === etB)?.automacoes.some((a) => a.id === auto)
  const noF2 = (q2.j.etapas ?? []).find((e) => e.slug === etB)?.automacoes.some((a) => a.id === auto)
  confere(noF1 === false && noF2 === true, `aparece só embaixo da etapa do funil 2 (funil 1: ${noF1}, funil 2: ${noF2})`)

  const mA = await api('/api/leads/mover', { leadId: Number(negA), kanban_status: etB }); await espera(1200)
  confere(mA.status === 200 && execs(negA) === '', `entrar em "${etB}" do funil 1 não dispara a do funil 2 (execuções: "${execs(negA)}")`)
  const mB = await api('/api/leads/mover', { leadId: Number(negB), kanban_status: etB }); await espera(1200)
  confere(mB.status === 200 && execs(negB) === 'criar_tarefa:executada', `entrar em "${etB}" do funil 2 dispara (${execs(negB)})`)
  confere(sql(`select count(*) from tarefas where negocio_id=${negB} and origem='automacao' and titulo='SLUG ${T}'`) === '1', 'a tarefa nasceu no negócio do funil 2')
} finally {
  await browser.close()
  sql(`delete from tarefas where negocio_id in (${negA}, ${negB});
       delete from automacao_execucoes where negocio_id in (${negA}, ${negB});
       delete from automacoes where config->>'titulo' in ('SLUG ${T}', 'AMBIGUO ${T}');
       delete from negocios where id in (${negA}, ${negB});
       delete from contatos where nome like 'Slug % ${T}';
       delete from funil_etapas where funil_id=${funil2}; delete from funis where id=${funil2};`)
  console.log('restou:', sql(`select (select count(*) from funis where nome like 'Funil slug %') || ' funis, ' || (select count(*) from contatos where nome like 'Slug %') || ' contatos, ' || (select count(*) from automacoes where config->>'titulo' like 'SLUG %') || ' automacoes'`))
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
