// Fase 4B — monta a lista final de negocios a converter, por origem (SO LEITURA: le os CSVs da rodada e confere
// o estado atual de cada negocio no banco com SELECT). Nao grava nada no banco.
//
// Uso: node --env-file=.env.local proposta-4b.mjs <pasta-base> <pasta-da-rodada>
//   <pasta-base>     tem pedidos_extraidos.json e o conciliacao_revisar.csv MARCADO pelo Lucas (aprovar = SIM)
//   <pasta-da-rodada> saida do conciliar.mjs (conciliacao_atualizar.json, divergencias.csv)
// Gera <pasta-da-rodada>/proposta_4b.json e proposta_4b.csv.
//
// Origens:
//   AB         faixas A/B do conciliacao_atualizar (status atual aberto)
//   revisar    linhas do conciliacao_revisar.csv com aprovar = SIM (aberto)
//   ate3dias   aberto criado ate 3 dias DEPOIS do pedido (mesma venda registrada com atraso)
//   perdido    perdido que comprou, SO quando o negocio ja existia no dia do pedido
//              (pedido anterior a criacao = compra antiga; o negocio e outra conversa, fica como esta)
//   convertido etapa Convertido (15) com status aberto (sobra de juncao): volta a ganho com a data do pedido
// Nunca entra: negocio de recompra (negocio_historico acao novo_apos_ganho), funil interno, outra empresa.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const [BASE, RODADA] = process.argv.slice(2)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!BASE || !RODADA || !url || !chave) { console.error('uso: node --env-file=.env.local proposta-4b.mjs <pasta-base> <pasta-da-rodada>'); process.exit(1) }
const sb = createClient(url, chave, { auth: { persistSession: false } })
const EMPRESA = 1

function lerCsv(f) {
  const txt = fs.readFileSync(f, 'utf8').replace(/^﻿/, '')
  const linhas = []; let campo = '', linha = [], aspas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += c; continue }
    if (c === '"') aspas = true
    else if (c === ';') { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = '' }
    else campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  const [cab, ...resto] = linhas
  return resto.filter((l) => l.length > 1).map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ''])))
}
const diaLocal = (iso) => iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : ''
function valorNum(txt) {
  const ms = [...String(txt || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g)]
    .map((m) => +(m[1].replace(/\./g, '') + '.' + (m[2] || '0'))).filter((v) => v >= 10)
  return ms.length ? ms[ms.length - 1] : null
}
const pedidos = new Map(JSON.parse(fs.readFileSync(path.join(BASE, 'pedidos_extraidos.json'), 'utf8')).map((p) => [p.id_pedido, p]))
const ganhoProposto = (p) => p.data_pedido === p.data_mensagem.slice(0, 10)
  ? p.data_mensagem.replace(' ', 'T') + '-03:00' : p.data_pedido + 'T12:00:00-03:00'

const at = JSON.parse(fs.readFileSync(path.join(RODADA, 'conciliacao_atualizar.json'), 'utf8'))
const dv = lerCsv(path.join(RODADA, 'divergencias.csv'))
const rv = lerCsv(path.join(BASE, 'conciliacao_revisar.csv')) // o arquivo do Lucas, como esta

const lista = new Map() // negocio_id -> item
function por(origem, negocio, statusEsperado, pedidosIds, extra = {}) {
  const id = Number(negocio)
  if (lista.has(id)) { lista.get(id).tambem.push(origem); return }
  const ps = pedidosIds.map((i) => pedidos.get(i)).filter(Boolean).sort((a, b) => a.data_mensagem.localeCompare(b.data_mensagem))
  const soma = ps.reduce((s, p) => s + (valorNum(p.total) || 0), 0)
  lista.set(id, { negocio_id: id, origem, tambem: [], status_esperado: statusEsperado, id_pedido: ps.map((p) => p.id_pedido).join(' + '),
    data_pedido: ps[0]?.data_pedido, ganho_em: ps[0] ? ganhoProposto(ps[0]) : null, valor_pedido: soma || null, cliente: ps[0]?.cliente || '', ...extra })
}

for (const a of at) por('AB', a.negocio_id, 'aberto', [a.id_pedido], { faixa: a.faixa, pos_venda: /#38\)/.test(a.etapa_atual) })
const sim = rv.filter((r) => /^\s*sim\s*$/i.test(r.aprovar))
for (const r of sim) por('revisar', r.negocio_id, 'aberto', [r.id_pedido], { faixa: r.faixa })

const TIPO_DEPOIS = 'aberto criado DEPOIS do pedido (cliente voltou?) — nao convertido'
const dias = (d) => Math.round((Date.parse(diaLocal(d.criado_em)) - Date.parse(d.data_pedido)) / 864e5)
const agrupa = (linhas) => linhas.reduce((m, d) => m.set(d.negocio_id, [...(m.get(d.negocio_id) || []), d.id_pedido]), new Map())
for (const [n, ps] of agrupa(dv.filter((d) => d.tipo === TIPO_DEPOIS && dias(d) <= 3))) por('ate3dias', n, 'aberto', ps)
const perdidos = dv.filter((d) => d.tipo === 'perdido que comprou')
const perdidosFora = perdidos.filter((d) => diaLocal(d.criado_em) > d.data_pedido)
for (const [n, ps] of agrupa(perdidos.filter((d) => diaLocal(d.criado_em) <= d.data_pedido))) por('perdido', n, 'perdido', ps)
for (const c of dv.filter((d) => d.tipo.startsWith('etapa Convertido'))) {
  // o pedido do mesmo contato no dia (ou depois) da criacao do negocio, o mais proximo
  const ps = dv.filter((d) => d.contato_id === c.contato_id && d.id_pedido && d.data_pedido >= diaLocal(c.criado_em)).sort((a, b) => a.data_pedido.localeCompare(b.data_pedido))
  por('convertido', c.negocio_id, 'aberto', ps.length ? [ps[0].id_pedido] : [], { etapa_ja_15: true })
}

// ---- confere no banco (so SELECT) ----
const ids = [...lista.keys()]
const { data: negs, error } = await sb.from('negocios').select('id, empresa_id, status, etapa_id, funil_id, ativo, ganho_em, valor_estimado').in('id', ids)
if (error) throw error
const { data: funis } = await sb.from('funis').select('id, interno').eq('empresa_id', EMPRESA)
const interno = new Set(funis.filter((f) => f.interno).map((f) => f.id))
const { data: rec } = await sb.from('negocio_historico').select('negocio_id').eq('empresa_id', EMPRESA).eq('acao', 'novo_apos_ganho')
const recompra = new Set(rec.map((r) => r.negocio_id))
const problemas = []
for (const n of negs) {
  const it = lista.get(n.id)
  it.status_atual = n.status; it.etapa_atual = n.etapa_id; it.ativo = n.ativo
  it.valor_proposto = (n.valor_estimado == null || +n.valor_estimado === 0) ? it.valor_pedido : null
  if (n.empresa_id !== EMPRESA) problemas.push([n.id, 'outra empresa'])
  if (interno.has(n.funil_id)) problemas.push([n.id, 'funil interno'])
  if (recompra.has(n.id)) problemas.push([n.id, 'negocio de recompra (novo_apos_ganho)'])
  if (n.status !== it.status_esperado) problemas.push([n.id, `status ${n.status}, esperado ${it.status_esperado}`])
  if (!it.ganho_em) problemas.push([n.id, 'sem data de pedido'])
}
for (const id of ids) if (!negs.some((n) => n.id === id)) problemas.push([id, 'nao existe'])

const itens = [...lista.values()].sort((a, b) => a.negocio_id - b.negocio_id)
const cont = (f) => itens.filter(f).length
const resumo = {
  total: itens.length,
  por_origem: itens.reduce((o, x) => ((o[x.origem] = (o[x.origem] || 0) + 1), o), {}),
  ab_em_pos_venda: cont((x) => x.origem === 'AB' && x.pos_venda),
  ab_por_faixa: itens.filter((x) => x.origem === 'AB').reduce((o, x) => ((o[x.faixa] = (o[x.faixa] || 0) + 1), o), {}),
  revisar_sim: sim.length, revisar_linhas: rv.length,
  perdidos_fora_por_pedido_anterior: [...new Set(perdidosFora.map((d) => d.negocio_id))].map(Number),
  em_mais_de_uma_origem: itens.filter((x) => x.tambem.length).map((x) => [x.negocio_id, x.origem, ...x.tambem]),
  arquivados: itens.filter((x) => x.ativo === false).map((x) => x.negocio_id),
  valor_a_preencher: itens.reduce((s, x) => s + (x.valor_proposto || 0), 0),
  sem_valor: itens.filter((x) => x.valor_proposto == null).map((x) => x.negocio_id),
  problemas,
}
fs.writeFileSync(path.join(RODADA, 'proposta_4b.json'), JSON.stringify({ resumo, itens }, null, 1))
const cols = ['negocio_id', 'origem', 'status_esperado', 'status_atual', 'etapa_atual', 'ativo', 'ganho_em', 'valor_proposto', 'id_pedido', 'data_pedido', 'cliente', 'faixa', 'pos_venda']
const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
fs.writeFileSync(path.join(RODADA, 'proposta_4b.csv'), '﻿' + [cols.join(';'), ...itens.map((x) => cols.map((c) => esc(x[c])).join(';'))].join('\r\n'), 'utf8')
console.log(JSON.stringify(resumo, null, 1))
