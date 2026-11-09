// Último lote das views (leads e lead_mensagens) — app LOCAL (build de produção), Supabase LOCAL
// com as migrações 20261105001200 e 001300 aplicadas (as views já não existem).
// Rodar de dentro de .../1deac4cf.../scratchpad/ensaio/pw (tem playwright-core):
//   node tests/e2e/views-ultimo-lote-e2e.mjs [BASE]
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479', VMOGI = 'dd2ae788-0e28-47af-86e2-73a15d1d600f', VJAG = '67065f4d-c70a-4f44-8e6e-430841f0ce19'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), MK = `TESTE UL ${T}`
const FONE = `(19) 9${String(T).slice(-4)}-${String(T).slice(-8, -4)}`
const negociosCriados = [], contatosCriados = []
const comoRls = (uid, q) => sql(`set role authenticated; set request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; ${q}`).split('\n').pop()

confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('leads','lead_mensagens','v_leads_nao_lidas','core_v_planos','v_empresas_plano')`) === '0', 'as 5 views não existem no local')
confere(sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and proname ~ '^compat_'`) === '0', 'nenhuma função compat_*')
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha(`pageerror (${email}): ` + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { /* csv */ } return { status: r.status, json: j, texto: t } }, [url, method, body])
  return { page, api, ctx }
}
async function telas(sessao, quem, rotas) {
  for (const r of rotas) {
    const g = await sessao.page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 240000 }).catch((e) => ({ status: () => String(e).slice(0, 80) }))
    confere(g?.status() === 200, `${quem} ${r} ${g?.status()}`)
  }
}

let dono
try {
  // ───────────────────────────────────────────────────────────── dono, Mogi
  dono = await entrar(E.dono)
  await telas(dono, 'dono', ['/dashboard', '/leads', '/comunicacao', '/tarefas', '/agenda', '/clientes', '/fila', '/financeiro',
    '/gestao-leads', '/executivo', '/metas', '/visao-geral', '/distribuicao', '/avaliacoes', '/pdv', '/configuracoes/funil',
    '/relatorios', '/orcamentos'])

  // badge "novo" do menu (layout) = negócios ativos na etapa novo que a RLS mostra
  const novosRls = Number(comoRls(DONO, `select count(*) from negocios n join funil_etapas e on e.id=n.etapa_id where n.ativo and e.slug='novo'`))
  confere(novosRls > 0, `RLS do dono: ${novosRls} negócios em "novo"`)

  // ── criar pela tela (Novo lead)
  await dono.page.goto(BASE + '/leads', { waitUntil: 'networkidle', timeout: 240000 })
  await dono.page.getByRole('button', { name: /Novo lead/ }).first().click()
  const dlg = dono.page.getByRole('dialog')
  await dlg.waitFor()
  await dlg.getByLabel('Nome').fill(MK)
  await dlg.getByLabel('Telefone / WhatsApp').fill(FONE)
  await dlg.getByLabel('Origem').selectOption('manual')
  await dlg.getByRole('button', { name: 'Criar lead' }).click()
  await dono.page.waitForTimeout(2500)
  const criado = sql(`select n.id || '|' || n.filial_id || '|' || c.id || '|' || n.status || '|' || n.ativo || '|' || coalesce(n.responsavel_id::text,'-') from negocios n join contatos c on c.id=n.contato_id where c.nome='${MK}' order by n.id`)
  const [nid, nfil, cid, nst, natv, nresp] = criado.split('|')
  if (nid) { negociosCriados.push(nid); contatosCriados.push(cid) }
  confere(nfil === '3' && nst === 'aberto' && natv === 'true', `Novo lead pela tela: negócio ${nid} na loja 3, aberto e ativo (${criado})`)
  confere(nresp === DONO, 'responsável = quem criou (padrão do modal)')
  confere(sql(`select telefone_e164 from contatos where id=${cid}`).startsWith('+5519'), 'contato com E.164')
  confere(sql(`select e.slug from negocios n join funil_etapas e on e.id=n.etapa_id where n.id=${nid}`) !== '', 'negócio numa etapa do funil')

  // mesmo telefone de novo: mesmo contato, negócio novo (criado à mão é decisão de quem cadastra)
  const r2 = await dono.api('/api/leads', 'POST', { nome: MK + ' 2', telefone: FONE, origem: 'indicacao', kanban_status: 'novo' })
  confere(r2.status === 200 && r2.json?.lead?.contato_id === Number(cid), `mesmo telefone → mesmo contato ${cid} (HTTP ${r2.status}, contato ${r2.json?.lead?.contato_id})`)
  if (r2.json?.lead?.id) negociosCriados.push(String(r2.json.lead.id))
  confere(r2.json?.lead?.kanban_status === 'novo' && r2.json?.lead?.msgs_nao_lidas === 0, 'resposta na forma do quadro (kanban_status, msgs_nao_lidas)')
  const rSemNome = await dono.api('/api/leads', 'POST', { telefone: FONE })
  confere(rSemNome.status === 400, 'sem nome: 400')
  const rFunil = await dono.api('/api/leads', 'POST', { nome: MK, funil_id: 999999 })
  confere(rFunil.status === 400, 'funil de outra empresa: 400')

  // ── mensagem de canal sem integração (chat manual)
  const rm = await dono.api(`/api/leads/${nid}/mensagem`, 'POST', { conteudo: 'atendido na loja', origem: 'manual' })
  confere(rm.status === 200 && rm.json?.id, `mensagem manual gravada (HTTP ${rm.status})`)
  confere(sql(`select contato_id || '|' || filial_id || '|' || direcao || '|' || usuario_id || '|' || lida from mensagens where id=${rm.json?.id ?? 0}`) === `${cid}|3|enviada|${DONO}|true`, 'mensagem no contato, na loja, enviada, com o autor')
  const rmWa = await dono.api(`/api/leads/${nid}/mensagem`, 'POST', { conteudo: 'x', origem: 'whatsapp' })
  confere(rmWa.status === 400, 'canal da Meta não grava por esta rota (400)')
  const rmAlheio = await dono.api('/api/leads/999999999/mensagem', 'POST', { conteudo: 'x' })
  confere(rmAlheio.status === 404, 'negócio inexistente: 404')

  // ── atribuir (negocio_atribuir reescrita: grava em negocios)
  const ra = await dono.api('/api/leads/atribuir', 'POST', { leadId: Number(nid), acao: 'transferir', paraResponsavel: VMOGI })
  confere(ra.status === 200, `transferir para o vendedor (HTTP ${ra.status} ${JSON.stringify(ra.json)?.slice(0, 80)})`)
  confere(sql(`select responsavel_id || '|' || (dados->'_lead' ? 'responsavel_desde') from negocios where id=${nid}`) === `${VMOGI}|true`, 'responsável e responsavel_desde gravados no negócio')
  confere(sql(`select count(*) from negocio_historico where negocio_id=${nid} and acao='transferir'`) === '1', 'histórico registra "transferir"')

  // ── mover (rota do quadro)
  const etapa2 = sql(`select e.slug from negocios n join funil_etapas e on e.funil_id=n.funil_id where n.id=${nid} and e.tipo not in ('ganho','perdido') order by e.ordem offset 1 limit 1`)
  if (etapa2) {
    const rmv = await dono.api('/api/leads/mover', 'POST', { leadId: Number(nid), kanban_status: etapa2 })
    confere(rmv.status === 200 && sql(`select e.slug from negocios n join funil_etapas e on e.id=n.etapa_id where n.id=${nid}`) === etapa2, `mover para "${etapa2}"`)
  }

  // ── buscar_lead_por_numero (⌘K) e assistente_status_conversas reescritas
  confere(comoRls(DONO, `select count(*) from buscar_lead_por_numero(${nid})`) === '1', 'buscar_lead_por_numero acha o negócio')
  confere(Number(sql(`select count(*) from assistente_status_conversas(1)`)) > 0, 'assistente_status_conversas responde')

  // ── exportação de leads da empresa (CSV)
  const ex = await dono.api('/api/exportar?tipo=leads')
  confere(ex.status === 200 && ex.texto.split('\n')[0].includes('kanban_status') && ex.texto.includes(MK), `exportar leads: CSV com etapa e o lead novo (${ex.texto.split('\n').length - 1} linhas)`)

  // ── a ficha imob: entrar no funil (cliente sem telefone vira negócio DELE)
  const cliSemFone = sql(`insert into contatos (empresa_id, filial_id, nome, dados, ativo) values (1, 3, '${MK} cliente', '{"_cliente":{}}', true) returning id`).split('\n')[0]
  contatosCriados.push(cliSemFone)
  const rv = await dono.api('/api/leads', 'POST', { contato_id: Number(cliSemFone), nome: MK + ' cliente', origem: 'manual' })
  confere(rv.status === 200 && rv.json?.lead?.contato_id === Number(cliSemFone), 'cliente sem telefone entra no funil no próprio contato')
  if (rv.json?.lead?.id) negociosCriados.push(String(rv.json.lead.id))
  confere(sql(`select count(*) from contatos where nome='${MK} cliente'`) === '1', 'sem segundo contato com o mesmo nome')

  // ───────────────────────────────────────────────────────────── vendedor Mogi
  const vm = await entrar(E.vend_mogi)
  await telas(vm, 'vend-mogi', ['/leads', '/tarefas', '/comunicacao', '/clientes'])
  const rvm = await vm.api('/api/leads', 'POST', { nome: MK + ' vend', telefone: FONE, origem: 'manual' })
  confere(rvm.status === 200 && rvm.json?.lead?.contato_id === Number(cid), 'vendedor: mesmo telefone marca o mesmo contato')
  if (rvm.json?.lead?.id) negociosCriados.push(String(rvm.json.lead.id))
  const rvmResp = await vm.api('/api/leads', 'POST', { nome: MK, responsavel_id: '00000000-0000-0000-0000-000000000000' })
  confere(rvmResp.status === 400, 'responsável de fora da empresa: 400')

  // ───────────────────────────────────────────────────────────── vendedora Jaguariúna
  const vj = await entrar(E.vend_jag)
  await telas(vj, 'vend-jag', ['/leads', '/tarefas', '/comunicacao'])
  const nJag = Number(comoRls(VJAG, `select count(*) from negocios where filial_id=3`))
  confere(nJag === 0, `vendedora de Jaguariúna não enxerga negócio de Mogi (${nJag})`)
  const rvj = await vj.api(`/api/leads/${nid}/mensagem`, 'POST', { conteudo: 'x' })
  confere(rvj.status === 404, 'vendedora de Jaguariúna não grava no lead de Mogi (404)')

  // ───────────────────────────────────────────────────────────── LGPD (superadmin)
  const sa = await entrar(E.superadmin)   // superadmin do Supabase LOCAL, senha de teste
  const lg = await sa.api('/api/superadmin/empresas/1/exportar')
  confere(lg.status === 200 && /^http/.test(lg.json?.url ?? ''), `LGPD: link assinado (HTTP ${lg.status}, ${lg.json?.bytes} bytes)`)
  if (lg.json?.url) {
    const zipBuf = Buffer.from(await (await fetch(lg.json.url)).arrayBuffer())
    const dir = mkdtempSync(join(tmpdir(), 'lgpd-'))
    writeFileSync(join(dir, 'x.zip'), zipBuf)
    execFileSync('C:/Windows/System32/tar.exe', ['-xf', join(dir, 'x.zip'), '-C', dir])
    const linhas = (f) => readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, '').split('\n').filter(Boolean).length - 1
    const arquivos = readdirSync(dir)
    for (const [arq, q] of [['mensagens.csv', 'select count(*) from mensagens where empresa_id=1'], ['negocios.csv', 'select count(*) from negocios where empresa_id=1'],
      ['contatos.csv', 'select count(*) from contatos where empresa_id=1'], ['conversas.csv', 'select count(*) from conversas where empresa_id=1'],
      ['leads.csv', 'select count(*) from negocios where empresa_id=1']]) {
      const banco = Number(sql(q))
      // linhas de CSV com quebra dentro de campo entre aspas contam a mais: conferir pelo contagens da rota também
      confere(arquivos.includes(arq) && lg.json.contagens[arq.replace('.csv', '')] === banco, `LGPD ${arq}: ${lg.json.contagens[arq.replace('.csv', '')]} = banco ${banco} (linhas no arquivo ${arquivos.includes(arq) ? linhas(arq) : '-'})`)
    }
    confere(Number(sql(`select count(*) from mensagens where empresa_id=1`)) > 1000, 'mensagens passam de mil (sem o teto)')
    const link2 = await fetch(lg.json.url.replace(/token=[^&]+/, 'token=xxx'))
    confere(link2.status >= 400, `link com token errado é recusado (${link2.status})`)
    confere(sql(`select public from storage.buckets where id='lgpd-exportacoes'`) === 'f', 'bucket privado')
    // limpeza de 24 h: envelhece o arquivo e chama o job
    sql(`update storage.objects set created_at = now() - interval '25 hours' where bucket_id='lgpd-exportacoes'`)
    // O .env.local não tem CRON_SECRET (a rota recusa tudo): o app local sobe com CRON_SECRET=segredo-cron-local-teste.
    const segredo = process.env.CRON_SECRET_LOCAL || 'segredo-cron-local-teste'
    const rl = await fetch(BASE + '/api/cron/lgpd-limpar', { headers: { authorization: `Bearer ${segredo}` } })
    const jl = await rl.json().catch(() => null)
    confere(rl.status === 200 && jl?.removidos >= 1 && sql(`select count(*) from storage.objects where bucket_id='lgpd-exportacoes'`) === '0', `job apaga o ZIP com mais de 24 h (HTTP ${rl.status}, ${jl?.removidos})`)
    const rl401 = await fetch(BASE + '/api/cron/lgpd-limpar')
    confere(rl401.status === 401, 'job sem segredo: 401')
  }
} finally {
  // limpeza
  for (const n of negociosCriados) sql(`delete from negocio_historico where negocio_id=${n}; delete from negocios where id=${n}`)
  for (const c of [...new Set(contatosCriados)]) sql(`delete from mensagens where contato_id=${c}; delete from conversas where contato_id=${c}; delete from contato_identidades where contato_id=${c}; delete from contatos where id=${c}`)
  sql(`delete from contatos where nome like 'TESTE UL ${T}%'`)
  console.log('limpo:', sql(`select count(*) from contatos where nome like 'TESTE UL ${T}%'`), 'contatos de teste')
  await browser.close()
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
