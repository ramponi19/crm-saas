// Item 3, lote A (funil, cadências, distribuição, agenda, chat, metas, ausência) — app e Supabase LOCAIS.
// O caminho feliz grava; a gravação que não acha a linha (id que sumiu) agora responde 404/aviso, não "ok".
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '').split('\n').pop()
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE GA ${T}`, NADA = 999999999
const limpar = []
const agendaAntes = sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='agenda'),'sem')`)
sql(`insert into empresa_modulos (empresa_id, modulo, origem, ativo) values (1,'agenda','plano',true) on conflict (empresa_id, modulo) do update set ativo=true`)
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])

  // ── funis
  const fc = await api('/api/funis', 'POST', { nome: MK })
  const funil = fc.json?.id ?? Number(sql(`select id from funis where nome='${MK}'`))
  confere(fc.status === 200 && funil, `funil de teste criado (${funil}, ${fc.status})`)
  limpar.push(`delete from funis where nome like 'TESTE GA ${T}%'`)
  const fr = await api('/api/funis', 'PATCH', { id: funil, nome: MK + ' r' })
  confere(fr.status === 200 && sql(`select nome from funis where id=${funil}`) === MK + ' r', 'funil: renomear grava')
  const fr0 = await api('/api/funis', 'PATCH', { id: NADA, nome: 'x' })
  confere(fr0.status === 404, `funil: renomear id que não existe = 404 (era 200) (${fr0.status})`)
  const fi = await api('/api/funis', 'PATCH', { id: funil, interno: true })
  confere(fi.status === 200 && sql(`select interno from funis where id=${funil}`) === 't', 'funil: marcar interno grava')
  const fd = await api('/api/funis', 'DELETE', { id: funil })
  confere(fd.status === 200 && sql(`select count(*) from funis where id=${funil}`) === '0', `funil: excluir apaga (${fd.status} ${fd.json?.error ?? ''})`)
  const fd0 = await api('/api/funis', 'DELETE', { id: funil })
  confere(fd0.status === 404 || fd0.status === 400, `funil: excluir de novo não diz ok (${fd0.status} ${fd0.json?.error ?? ''})`)

  // ── distribuição
  const dc = await api('/api/distribuicao', 'POST', { nome: MK, criterio: 'qualquer', ativo: false })
  const regra = dc.json?.id
  confere(dc.status === 200 && regra, `distribuição: regra criada (${regra})`)
  limpar.push(`delete from distribuicao_regras where nome like 'TESTE GA ${T}%'`)
  const de = await api('/api/distribuicao', 'POST', { id: regra, nome: MK + ' e', criterio: 'qualquer', ativo: false })
  confere(de.status === 200 && sql(`select nome from distribuicao_regras where id=${regra}`) === MK + ' e', 'distribuição: editar grava')
  const de0 = await api('/api/distribuicao', 'POST', { id: NADA, nome: MK + ' x', criterio: 'qualquer' })
  confere(de0.status === 404, `distribuição: editar id que não existe = 404 (${de0.status})`)
  const dor = await api('/api/distribuicao', 'POST', { ordens: [{ id: regra, ordem: 7 }, { id: NADA, ordem: 8 }] })
  confere(dor.status === 404 && sql(`select ordem from distribuicao_regras where id=${regra}`) === '7', `distribuição: reordenar com 1 sumida = 404 e grava a outra (${dor.status} ${dor.json?.error})`)
  const dd = await api(`/api/distribuicao?id=${regra}`, 'DELETE')
  confere(dd.status === 200 && sql(`select count(*) from distribuicao_regras where id=${regra}`) === '0', 'distribuição: excluir apaga')
  const dd0 = await api(`/api/distribuicao?id=${regra}`, 'DELETE')
  confere(dd0.status === 404, `distribuição: excluir de novo = 404 (${dd0.status})`)

  // ── cadências
  const cc = await api('/api/cadencias', 'POST', { nome: MK, ativo: false, gatilho: 'manual', passos: [{ canal: 'ligacao', dia_offset: 0, titulo: 'p1' }, { canal: 'whatsapp', dia_offset: 1, titulo: 'p2' }] })
  const cad = cc.json?.id
  confere(cc.status === 200 && cad, `cadência criada (${cad} ${cc.json?.error ?? ''})`)
  limpar.push(`delete from cadencias where nome like 'TESTE GA ${T}%'`)
  const ce = await api('/api/cadencias', 'POST', { id: cad, nome: MK + ' e', ativo: false, gatilho: 'manual', passos: [{ canal: 'ligacao', dia_offset: 0, titulo: 'p1' }] })
  confere(ce.status === 200 && sql(`select nome||'|'||(select count(*) from cadencia_passos where cadencia_id=${cad}) from cadencias where id=${cad}`) === MK + ' e|1', 'cadência: editar grava nome e passos')
  const ce0 = await api('/api/cadencias', 'POST', { id: NADA, nome: MK + ' x', ativo: false, gatilho: 'manual', passos: [] })
  confere(ce0.status === 404, `cadência: editar id que não existe = 404 e não mexe em passos (${ce0.status})`)
  // inscrição para as ações
  const neg = sql(`select id from negocios where empresa_id=1 and filial_id=3 and ativo order by id desc limit 1`)
  const insc = sql(`insert into cadencia_inscricoes (empresa_id, cadencia_id, lead_id, negocio_id, filial_id, status, passo_ordem, proxima_acao_em) values (1, ${cad}, ${neg}, ${neg}, 3, 'ativa', 1, now()) returning id`)
  const ca = await api('/api/cadencias/acao', 'POST', { inscricaoId: Number(insc), tipo: 'adiar' })
  confere(ca.status === 200 && sql(`select proxima_acao_em > now() + interval '20 hours' from cadencia_inscricoes where id=${insc}`) === 't', `cadência: adiar grava (${ca.status} ${ca.json?.error ?? ''})`)
  const cs = await api('/api/cadencias/acao', 'POST', { inscricaoId: Number(insc), tipo: 'sair' })
  confere(cs.status === 200 && sql(`select status from cadencia_inscricoes where id=${insc}`) === 'saiu', 'cadência: sair grava')
  const cs2 = await api('/api/cadencias/acao', 'POST', { inscricaoId: Number(insc), tipo: 'sair' })
  confere(cs2.status === 409, 'cadência: inscrição que já saiu = 409')
  const cdel = await api(`/api/cadencias?id=${cad}`, 'DELETE')
  confere(cdel.status === 200 && sql(`select count(*) from cadencias where id=${cad}`) === '0', 'cadência: excluir apaga')
  const cdel0 = await api(`/api/cadencias?id=${cad}`, 'DELETE')
  confere(cdel0.status === 404, `cadência: excluir de novo = 404 (${cdel0.status})`)

  // ── metas
  const mc = await api('/api/ranking/metas', 'POST', { escopo: 'equipe', tipo: 'vendas', alvo: 1, periodo: '2031-01' })
  const meta = Number(sql(`select coalesce(max(id),0) from metas where empresa_id=1 and periodo='2031-01'`))
  confere(mc.status === 200 && meta, `meta criada (${meta} ${mc.status} ${mc.json?.error ?? ''})`)
  const md = await api(`/api/ranking/metas?id=${meta}`, 'DELETE')
  confere(md.status === 200 && sql(`select count(*) from metas where id=${meta}`) === '0', 'metas: excluir apaga')
  const md0 = await api(`/api/ranking/metas?id=${meta}`, 'DELETE')
  confere(md0.status === 404, `metas: excluir de novo = 404 (era 200) (${md0.status})`)

  // ── ausência
  const antesAus = sql(`select ausente from empresa_usuarios where empresa_id=1 and usuario_id='${DONO}'`)
  const au = await api('/api/ausencia', 'POST', { ausente: false })
  confere(au.status === 200 && sql(`select ausente from empresa_usuarios where empresa_id=1 and usuario_id='${DONO}'`) === 'f', `ausência: grava (${au.status} ${au.json?.error ?? ''}; antes ${antesAus})`)

  // ── agenda (tela): mudar status pela lista
  const hoje = new Date(Date.now() + 2 * 3600e3).toISOString()
  const vis = sql(`insert into visitas (empresa_id, filial_id, corretor_id, data_hora, fim, status, titulo, tipo) values (1, 3, '${DONO}', '${hoje}', '${new Date(Date.now() + 3 * 3600e3).toISOString()}', 'agendada', '${MK}', (select tipo from visitas limit 0) ) returning id`.replace(`(select tipo from visitas limit 0)`, `'reuniao'`))
  limpar.push(`delete from visitas where titulo like 'TESTE GA ${T}%'`)
  await page.goto(BASE + '/agenda', { waitUntil: 'networkidle', timeout: 240000 })
  await page.waitForTimeout(1500)
  if (!(await page.getByText(MK).count())) { await page.screenshot({ path: 'agenda-debug.png', fullPage: true }); console.log('visita no banco:', sql(`select id||' '||data_hora||' '||filial_id||' '||corretor_id from visitas where id=${vis}`)) }
  const cartao = page.locator('div', { hasText: MK }).filter({ has: page.getByLabel('Alterar status') }).last()
  await cartao.getByLabel('Alterar status').selectOption('realizada')
  await page.waitForTimeout(1200)
  confere(sql(`select status from visitas where id=${vis}`) === 'realizada', 'agenda: mudar status pela tela grava')
  sql(`delete from visitas where id=${vis}`)
  await cartao.getByLabel('Alterar status').selectOption('cancelada')
  await page.waitForTimeout(1200)
  confere((await toasts(page)).some((t) => t.includes('Nada foi gravado')), 'agenda: compromisso que sumiu avisa "Nada foi gravado"')

  // ── chat interno (tela): apagar a própria mensagem do mural
  const msg = sql(`insert into mensagens_internas (empresa_id, autor_id, tipo, conteudo) values (1, '${DONO}', 'mural', '${MK}') returning id`)
  limpar.push(`delete from mensagens_internas where conteudo like 'TESTE GA ${T}%'`)
  await page.goto(BASE + '/chat', { waitUntil: 'networkidle', timeout: 240000 })
  const bolha = page.locator('div.group', { hasText: MK }).last()
  await bolha.hover(); await bolha.getByLabel('Apagar').click()
  await page.waitForTimeout(1200)
  confere(sql(`select count(*) from mensagens_internas where id=${msg}`) === '0', 'chat: apagar a própria mensagem apaga')
  const msg2 = sql(`insert into mensagens_internas (empresa_id, autor_id, tipo, conteudo) values (1, '${DONO}', 'mural', '${MK} 2') returning id`)
  await page.reload({ waitUntil: 'networkidle' })
  sql(`delete from mensagens_internas where id=${msg2}`)
  const bolha2 = page.locator('div.group', { hasText: MK + ' 2' }).last()
  await bolha2.hover(); await bolha2.getByLabel('Apagar').click()
  await page.waitForTimeout(1200)
  confere((await toasts(page)).some((t) => t.includes('Não foi possível apagar')), 'chat: mensagem que já saiu avisa, não some calada')

  // telas do lote abrem
  for (const p of ['/configuracoes/funil', '/distribuicao', '/cadencias', '/fila', '/metas']) {
    const r = await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 240000 }).catch(() => null)
    confere(r && r.status() < 400, `${p} abre (${r?.status()})`)
  }
} catch (e) {
  falha('exceção: ' + String(e?.message ?? e).slice(0, 300))
} finally {
  await browser.close()
  for (const q of limpar) sql(q)
  if (agendaAntes === 'sem') sql(`delete from empresa_modulos where empresa_id=1 and modulo='agenda'`)
  else sql(`update empresa_modulos set ativo=${agendaAntes} where empresa_id=1 and modulo='agenda'`)
  console.log('agenda devolvida:', sql(`select coalesce((select ativo::text from empresa_modulos where empresa_id=1 and modulo='agenda'),'sem')`), '(antes', agendaAntes + ')')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
