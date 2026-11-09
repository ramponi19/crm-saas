// Fusão: aberto x fechado (06/11) — app e Supabase LOCAIS.
// C tem um negócio GANHO (NG, etapa de ganho, valor 1234); D tem um negócio ABERTO (NO, "Novo").
// Funde D em C → fica NO (aberto); NG sai do funil e o ganho vai para negocio_historico de NO
// ('fechamento_juntado'), contado uma vez pela regra de lib/fechamentos.ts. Desfaz → tudo volta.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '').split('\n').pop()
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), MK = `Fusao Fechado ${String(T).slice(-6)}`
const ids = {}
const filialAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
// A mesma conta de lib/fechamentos.ts (status atual + histórico com fechamento), para a empresa 1.
const ganhos = () => sql(`select (select count(*) from negocios where empresa_id=1 and status='ganho')
  + (select count(*) from negocio_historico where empresa_id=1 and acao in ('reaberto_por_mensagem','fechamento_juntado') and detalhe->>'status'='ganho')`)
const ganhosAtivos = () => sql(`select (select count(*) from negocios where empresa_id=1 and status='ganho' and ativo)
  + (select count(*) from negocio_historico h join negocios n on n.id=h.negocio_id where h.empresa_id=1 and h.acao in ('reaberto_por_mensagem','fechamento_juntado') and h.detalhe->>'status'='ganho' and n.ativo)`)

try {
  const fone = '55199' + String(T).slice(-8)
  ids.C = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo, ativo) values (1, 3, '${MK} C', '${fone}', '+${fone}', 'pessoa', true) returning id`)
  ids.D = sql(`insert into contatos (empresa_id, filial_id, nome, instagram, tipo, ativo) values (1, 3, '${MK} D', 'ff${T}', 'pessoa', true) returning id`)
  const etapaGanho = sql(`select id from funil_etapas where funil_id=1 and tipo='ganho' order by ordem limit 1`)
  ids.NG = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, valor_estimado, created_at) values (1, 3, ${ids.C}, 1, ${etapaGanho}, 'ganho', now() - interval '40 days', 1234, now() - interval '60 days') returning id`)
  ids.NO = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, created_at) values (1, 3, ${ids.D}, 1, 18, 'aberto', now() - interval '2 days') returning id`)
  ids.tarefa = sql(`insert into tarefas (empresa_id, filial_id, lead_id, negocio_id, contato_id, titulo, tipo, concluida, origem) values (1, 3, ${ids.NG}, ${ids.NG}, ${ids.C}, '${MK} pos-venda', 'ligacao', false, 'manual') returning id`)
  const g0 = ganhos(), ga0 = ganhosAtivos()
  ok(`cenário: C=${ids.C} com NG=${ids.NG} ganho (etapa ${etapaGanho}, R$ 1.234); D=${ids.D} com NO=${ids.NO} aberto. Ganhos: ${g0} (ativos ${ga0})`)

  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage()
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])

  const f = await api('/api/contatos/fundir', 'POST', { principal: Number(ids.C), removido: Number(ids.D) })
  confere(f.status === 200 && f.json?.negociosJuntados === 1 && !f.json?.avisoJuncao, `fundir: 200, 1 junção (${JSON.stringify({ s: f.status, j: f.json?.negociosJuntados, a: f.json?.avisoJuncao, e: f.json?.error })})`)
  confere(sql(`select string_agg(id::text, ',') from negocios where contato_id=${ids.C} and ativo`) === ids.NO, 'fica o ABERTO (NO), mesmo atrás do ganho no funil')
  confere(sql(`select status||'|'||coalesce(ganho_em::text,'-')||'|'||ativo from negocios where id=${ids.NG}`) === 'aberto|-|false', 'NG saiu do funil e o status foi para o histórico')
  const det = sql(`select detalhe->>'status'||'|'||(detalhe->>'valor_estimado')||'|'||(detalhe->>'de_negocio')||'|'||(detalhe->>'ganho_em' is not null) from negocio_historico where negocio_id=${ids.NO} and acao='fechamento_juntado'`)
  confere(det === `ganho|1234|${ids.NG}|true`, `histórico de NO guarda o ganho (status, valor, data, origem): ${det}`)
  confere(ganhos() === g0, `relatório de ganhos igual: ${g0} → ${ganhos()}`)
  confere(ganhosAtivos() === ga0, `ganhos dos negócios ativos (painel/conversão) igual: ${ga0} → ${ganhosAtivos()}`)
  confere(sql(`select lead_id from tarefas where id=${ids.tarefa}`) === ids.NO, 'a tarefa de pos-venda foi para NO')

  const d = await api('/api/contatos/fundir/desfazer', 'POST', { fusaoId: f.json?.fusaoId })
  confere(d.status === 200, `desfazer: 200 (${d.status} ${d.json?.error ?? ''})`)
  confere(sql(`select status||'|'||(ganho_em is not null)||'|'||ativo||'|'||contato_id from negocios where id=${ids.NG}`) === `ganho|true|true|${ids.C}`, 'NG voltou ganho, ativo, com C')
  confere(sql(`select count(*) from negocio_historico where acao='fechamento_juntado' and negocio_id in (${ids.NO}, ${ids.NG})`) === '0', 'o registro do fechamento saiu do histórico (não conta duas vezes)')
  confere(ganhos() === g0 && ganhosAtivos() === ga0, `depois de desfazer, ganhos iguais: ${ganhos()} / ${ganhosAtivos()}`)
  confere(sql(`select lead_id from tarefas where id=${ids.tarefa}`) === ids.NG, 'a tarefa voltou para NG')
  await browser.close()
} catch (e) {
  falha('exceção: ' + String(e?.message ?? e).slice(0, 500))
} finally {
  const neg = [ids.NG, ids.NO].filter(Boolean).join(',') || '0', cts = [ids.C, ids.D].filter(Boolean).join(',') || '0'
  for (const q of [`delete from tarefas where lead_id in (${neg}) or negocio_id in (${neg})`, `delete from negocio_historico where negocio_id in (${neg})`,
    `delete from eventos where entidade_id in (${neg}) and tipo like 'negocio.%'`, `delete from negocios where id in (${neg})`,
    `delete from conversas where contato_id in (${cts})`, `delete from contato_identidades where contato_id in (${cts})`,
    `delete from contato_fusoes where contato_principal_id in (${cts})`, `delete from eventos where tipo like 'contato.%' and entidade_id in (${cts})`,
    `delete from contatos where id in (${cts})`, `update usuarios set filial_atual_id=${filialAntes} where id='${DONO}'`]) {
    try { sql(q) } catch (e) { console.log('limpeza:', q.slice(0, 60)) }
  }
  console.log('limpo:', sql(`select count(*) from contatos where nome like 'Fusao Fechado ${String(T).slice(-6)}%'`) === '0')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
