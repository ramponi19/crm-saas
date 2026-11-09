// Fusão junta os negócios da mesma loja e funil (06/11) — app e Supabase LOCAIS.
// A (WhatsApp, negócio NA em "Em contato") + B (Instagram, negócio NB em "Orçamento"), os dois em Mogi.
// Em NA: tarefa, proposta, histórico, inscrição ativa na cadência C (NB também está em C) e automação agendada.
// Funde B em A → fica NB (mais avançado), NA sai do funil com tudo movido. Desfaz → tudo volta.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '').split('\n').pop()
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), MK = `Fusao Juncao ${String(T).slice(-6)}`
const ids = {}
const filialAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)

try {
  const fone = '55199' + String(T).slice(-8)
  ids.A = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, tipo, ativo) values (1, 3, '${MK} A', '${fone}', '+${fone}', 'pessoa', true) returning id`)
  ids.B = sql(`insert into contatos (empresa_id, filial_id, nome, instagram, tipo, ativo) values (1, 3, '${MK} B', 'fj${T}', 'pessoa', true) returning id`)
  sql(`insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id) values (1, ${ids.A}, 'whatsapp', '${fone}'), (1, ${ids.B}, 'instagram', 'ig${T}')`)
  sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id, status, nao_lidas, ultima_mensagem_at) values (1, 3, ${ids.A}, 15, 'aberta', 0, now()), (1, 3, ${ids.B}, 26, 'aberta', 0, now())`)
  ids.NA = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, created_at) values (1, 3, ${ids.A}, 1, 17, 'aberto', now() - interval '5 days') returning id`)
  ids.NB = sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, created_at) values (1, 3, ${ids.B}, 1, 27, 'aberto', now() - interval '10 days') returning id`)
  ids.tarefa = sql(`insert into tarefas (empresa_id, filial_id, lead_id, negocio_id, contato_id, titulo, tipo, concluida, origem) values (1, 3, ${ids.NA}, ${ids.NA}, ${ids.A}, '${MK} tarefa', 'ligacao', false, 'manual') returning id`)
  ids.proposta = sql(`insert into vendas_propostas (empresa_id, filial_id, lead_id, cliente_nome, itens, total, status, token) values (1, 3, ${ids.NA}, '${MK}', '[]', 0, 'rascunho', 'tk${T}') returning id`)
  ids.hist = sql(`insert into negocio_historico (empresa_id, negocio_id, acao, detalhe) values (1, ${ids.NA}, 'teste_e2e', '{}') returning id`)
  ids.cad = sql(`insert into cadencias (empresa_id, nome, ativo, gatilho) values (1, '${MK} cad', false, 'manual') returning id`)
  ids.inscNA = sql(`insert into cadencia_inscricoes (empresa_id, cadencia_id, lead_id, negocio_id, filial_id, status, passo_ordem, proxima_acao_em) values (1, ${ids.cad}, ${ids.NA}, ${ids.NA}, 3, 'ativa', 1, now() + interval '1 day') returning id`)
  ids.inscNB = sql(`insert into cadencia_inscricoes (empresa_id, cadencia_id, lead_id, negocio_id, filial_id, status, passo_ordem, proxima_acao_em) values (1, ${ids.cad}, ${ids.NB}, ${ids.NB}, 3, 'ativa', 1, now() + interval '1 day') returning id`)
  ids.aut = sql(`insert into automacoes (empresa_id, gatilho, acao, config, ativo, espera_dias, etapa_id) values (1, 'entrou_na_etapa', 'criar_tarefa', '{}', false, 1, 17) returning id`)
  ids.exec = sql(`insert into automacao_execucoes (empresa_id, filial_id, automacao_id, negocio_id, contato_id, acao, status, agendada_para) values (1, 3, ${ids.aut}, ${ids.NA}, ${ids.A}, 'criar_tarefa', 'agendada', now() + interval '1 day') returning id`)
  ok(`cenário: A=${ids.A} (NA=${ids.NA}, Em contato) e B=${ids.B} (NB=${ids.NB}, Orçamento), com tarefa, proposta, histórico, cadência e automação em NA`)

  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await (await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])

  // ── fundir B em A
  const f = await api('/api/contatos/fundir', 'POST', { principal: Number(ids.A), removido: Number(ids.B) })
  confere(f.status === 200 && f.json?.negociosJuntados === 1 && !f.json?.avisoJuncao, `fundir: 200 e 1 negócio juntado (${f.status} ${JSON.stringify({ j: f.json?.negociosJuntados, aviso: f.json?.avisoJuncao, e: f.json?.error })})`)
  const ativos = sql(`select string_agg(id::text, ',') from negocios where contato_id=${ids.A} and ativo`)
  confere(ativos === ids.NB, `fica o mais avançado (NB=${ids.NB}): ativos ${ativos}`)
  confere(sql(`select (dados->'_juntado'->>'para')||'|'||(dados->'_lead'->>'ativo') from negocios where id=${ids.NA}`) === `${ids.NB}|false`, 'NA saiu do funil (ativo=false) apontando para NB')
  confere(sql(`select lead_id||'|'||negocio_id from tarefas where id=${ids.tarefa}`) === `${ids.NB}|${ids.NB}`, 'tarefa foi para NB')
  confere(sql(`select lead_id from vendas_propostas where id=${ids.proposta}`) === ids.NB, 'proposta foi para NB')
  confere(sql(`select negocio_id from negocio_historico where id=${ids.hist}`) === ids.NB, 'histórico foi para NB')
  confere(sql(`select count(*) from negocio_historico where negocio_id in (${ids.NA}, ${ids.NB}) and acao in ('juntado','juntado_em')`) === '2', 'histórico registra a junção nos dois')
  confere(sql(`select status from cadencia_inscricoes where id=${ids.inscNA}`) === 'saiu' && sql(`select status from cadencia_inscricoes where id=${ids.inscNB}`) === 'ativa', 'cadência repetida: a de NA saiu, a de NB segue')
  confere(sql(`select status||'|'||negocio_id from automacao_execucoes where id=${ids.exec}`) === `pulada|${ids.NB}`, 'automação agendada de NA pulada (não roda duas vezes)')
  confere(sql(`select count(*) from eventos where tipo='negocio.juntado' and entidade_id=${ids.NB}`) === '1', 'evento negocio.juntado com a foto')
  // telas: quadro e busca mostram um só
  await page.goto(BASE + '/leads', { waitUntil: 'networkidle', timeout: 240000 })
  await page.waitForTimeout(1500)
  confere(await page.getByText(`${MK} A`, { exact: true }).count() === 1, 'quadro: um cartão só')

  // ── desfazer
  const d = await api('/api/contatos/fundir/desfazer', 'POST', { fusaoId: f.json?.fusaoId })
  confere(d.status === 200, `desfazer: 200 (${d.status} ${d.json?.error ?? ''})`)
  confere(sql(`select count(*) from contatos where id=${ids.B}`) === '1', 'B voltou')
  confere(sql(`select contato_id||'|'||ativo from negocios where id=${ids.NB}`) === `${ids.B}|true` && sql(`select contato_id||'|'||ativo||'|'||(dados ? '_juntado') from negocios where id=${ids.NA}`) === `${ids.A}|true|false`, 'NA de volta ao funil (sem _juntado), NB de volta com B')
  confere(sql(`select lead_id||'|'||negocio_id from tarefas where id=${ids.tarefa}`) === `${ids.NA}|${ids.NA}`, 'tarefa voltou para NA')
  confere(sql(`select lead_id from vendas_propostas where id=${ids.proposta}`) === ids.NA, 'proposta voltou para NA')
  confere(sql(`select negocio_id from negocio_historico where id=${ids.hist}`) === ids.NA, 'histórico voltou para NA')
  confere(sql(`select status from cadencia_inscricoes where id=${ids.inscNA}`) === 'ativa', 'cadência de NA ativa de novo')
  confere(sql(`select status||'|'||negocio_id from automacao_execucoes where id=${ids.exec}`) === `agendada|${ids.NA}`, 'automação agendada de novo em NA')
  confere(sql(`select count(*) from eventos where tipo='negocio.juncao_desfeita'`) !== '0', 'evento negocio.juncao_desfeita gravado')
  await browser.close()
} catch (e) {
  falha('exceção: ' + String(e?.message ?? e).slice(0, 500))
} finally {
  const neg = [ids.NA, ids.NB].filter(Boolean).join(',') || '0'
  const cts = [ids.A, ids.B].filter(Boolean).join(',') || '0'
  for (const q of [
    `delete from automacao_execucoes where negocio_id in (${neg})`, ids.aut && `delete from automacoes where id=${ids.aut}`,
    `delete from cadencia_inscricoes where negocio_id in (${neg}) or lead_id in (${neg})`, ids.cad && `delete from cadencias where id=${ids.cad}`,
    `delete from tarefas where lead_id in (${neg}) or negocio_id in (${neg})`, `delete from vendas_propostas where lead_id in (${neg})`,
    `delete from negocio_historico where negocio_id in (${neg})`, `delete from eventos where entidade_id in (${neg}) and tipo like 'negocio.%'`,
    `delete from negocios where id in (${neg})`, `delete from conversas where contato_id in (${cts})`,
    `delete from contato_identidades where contato_id in (${cts})`, `delete from contato_fusoes where contato_principal_id in (${cts})`,
    `delete from eventos where tipo like 'contato.%' and entidade_id in (${cts})`, `delete from contatos where id in (${cts})`,
    `update usuarios set filial_atual_id=${filialAntes} where id='${DONO}'`,
  ].filter(Boolean)) { try { sql(q) } catch (e) { console.log('limpeza:', q.slice(0, 70), String(e.message).split('\n').find((l) => l.startsWith('ERROR'))) } }
  console.log('limpo:', sql(`select count(*) from contatos where nome like 'Fusao Juncao ${String(T).slice(-6)}%'`) === '0')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
