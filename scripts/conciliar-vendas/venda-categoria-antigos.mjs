// Categoria e condição da venda para os GANHOS ANTIGOS (marcados no quadro antes da Entrega A, sem
// dados.venda e fora da 4B). SIMULAÇÃO: só SELECT. A gravação é um passo à parte, com o ok do Lucas.
//
// Casamento ganho → pedido do grupo: só por TELEFONE (o mesmo critério A/B da conciliação), pedido não usado
// pela conciliação, data do pedido de JANELA_ANTES dias antes do ganho até JANELA_DEPOIS depois; vale o mais
// próximo, e pedidos do mesmo contato no mesmo dia contam juntos (aparelho + acessório: vale o de maior valor).
// Classificação: classificar-item.mjs, as mesmas regras dos 147.
//
// Uso: node --env-file=.env.local venda-categoria-antigos.mjs <pedidos_extraidos.json> <saida.csv>
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { NOME, classificar, valorDoPedido } from './classificar-item.mjs'

const [PEDIDOS, SAIDA] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMPRESA = 1
const JANELA_ANTES = 30, JANELA_DEPOIS = 7

function normTel(bruto) {
  let d = String(bruto || '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) return { e164: '+55' + d.slice(0, 2) + '9' + d.slice(2), sem9: '+55' + d, tinha9: false }
  if (d.length === 11 && d[2] === '9') return { e164: '+55' + d, sem9: '+55' + d.slice(0, 2) + d.slice(3), tinha9: true }
  return d.length >= 10 ? { e164: '+55' + d, sem9: '', tinha9: true } : null
}
const diaLocal = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const dias = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5)
async function tudo(tabela, colunas, filtro = (q) => q) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order('id', { ascending: true }).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    out.push(...data); if (data.length < 1000) break
  }
  return out
}

const [funis, contatos, idents, ganhos, conciliados, backup4b] = await Promise.all([
  tudo('funis', 'id, interno', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('contatos', 'id, telefone, telefone_e164', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('contato_identidades', 'id, contato_id, external_id', (q) => q.eq('empresa_id', EMPRESA).eq('canal_tipo', 'whatsapp')),
  tudo('negocios', 'id, contato_id, funil_id, ganho_em, valor_estimado, dados', (q) => q.eq('empresa_id', EMPRESA).eq('status', 'ganho')),
  tudo('negocio_historico', 'id, id_pedido:detalhe->>id_pedido', (q) => q.eq('empresa_id', EMPRESA).eq('acao', 'conciliacao_zip')),
  sb.from('_backup_conciliacao_20261123').select('negocio_id').then(({ data, error }) => { if (error) throw error; return data }),
])
const interno = new Set(funis.filter((f) => f.interno).map((f) => f.id))
const da4b = new Set(backup4b.map((b) => b.negocio_id))
const usadosConciliacao = new Set(conciliados.flatMap((h) => String(h.id_pedido || '').split(' + ').map((i) => i.trim()).filter(Boolean)))

// Telefone → contatos (e164 do contato, telefone livre, identidade de WhatsApp; contato gravado sem o 9)
const porTel = new Map(), porSem9 = new Map()
const add = (m, k, id) => { if (!k) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(id) }
for (const c of contatos) for (const t of [c.telefone_e164, c.telefone].map(normTel).filter(Boolean)) { add(porTel, t.e164, c.id); if (!t.tinha9) add(porSem9, t.sem9, c.id) }
for (const i of idents) { const t = normTel(i.external_id); if (t) add(porTel, t.e164, i.contato_id) }

// Pedidos (não usados pela conciliação) por contato
const pedidosDoContato = new Map()
let pedidosComTelefone = 0
for (const p of JSON.parse(fs.readFileSync(PEDIDOS, 'utf8'))) {
  if (usadosConciliacao.has(p.id_pedido) || !p.telefone_e164) continue
  pedidosComTelefone++
  const ids = porTel.get(p.telefone_e164) || (p.telefone_sem9 && porSem9.get(p.telefone_sem9)) || null
  if (!ids) continue
  for (const id of ids) { if (!pedidosDoContato.has(id)) pedidosDoContato.set(id, []); pedidosDoContato.get(id).push(p) }
}

const alvo = ganhos.filter((g) => !interno.has(g.funil_id) && !da4b.has(g.id) && !(g.dados && g.dados.venda))
// Candidatos (ganho, dia de pedido) ordenados pela distância; cada pedido vale para um ganho só.
const cand = []
for (const g of alvo) {
  if (!g.ganho_em) continue
  const d0 = diaLocal(g.ganho_em)
  const porDia = new Map()
  for (const p of pedidosDoContato.get(g.contato_id) || []) { if (!porDia.has(p.data_pedido)) porDia.set(p.data_pedido, []); porDia.get(p.data_pedido).push(p) }
  for (const [dia, ps] of porDia) { const dist = dias(dia, d0); cand.push({ g, dia, ps, dist, dentro: dist >= -JANELA_ANTES && dist <= JANELA_DEPOIS }) }
}
cand.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist) || a.g.id - b.g.id)
const escolha = new Map(), pedidoUsado = new Set(), maisProximoFora = new Map()
for (const c of cand) {
  if (escolha.has(c.g.id)) continue
  const livres = c.ps.filter((p) => !pedidoUsado.has(p.id_pedido))
  if (!livres.length) continue
  if (!c.dentro) { if (!maisProximoFora.has(c.g.id)) maisProximoFora.set(c.g.id, c.dist); continue }
  escolha.set(c.g.id, { ...c, ps: livres }); livres.forEach((p) => pedidoUsado.add(p.id_pedido))
}

const linhas = alvo.map((g) => {
  const e = escolha.get(g.id)
  const { principal, categoria, condicao, fonte } = e ? classificar(e.ps) : { principal: null, categoria: null, condicao: null, fonte: '' }
  const temPedidoNoContato = (pedidosDoContato.get(g.contato_id) || []).length > 0
  return {
    negocio_id: g.id, ganho_em: g.ganho_em ? diaLocal(g.ganho_em) : '', valor_estimado: g.valor_estimado ?? '',
    casamento: e ? 'pedido no período' : !g.ganho_em ? 'ganho sem data' : temPedidoNoContato ? `pedido fora da janela (mais próximo: ${maisProximoFora.get(g.id) ?? 'já usado'} dias)` : 'sem pedido do telefone',
    id_pedido: e ? e.ps.map((p) => p.id_pedido).join(' + ') : '', data_pedido: e?.dia ?? '', dias_do_ganho: e?.dist ?? '',
    valor_pedido: principal ? valorDoPedido(principal) : '', modelo: principal?.modelo ?? '', cor: principal?.cor ?? '',
    categoria_id: categoria, categoria: categoria ? NOME[categoria] : '(sem — régua Geral)', condicao: condicao ?? '', fonte_condicao: fonte,
  }
})

const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const cols = Object.keys(linhas[0])
fs.writeFileSync(SAIDA, '﻿' + [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\r\n'), 'utf8')
const conta = (f, ls = linhas) => ls.reduce((o, l) => { const k = f(l); o[k] = (o[k] || 0) + 1; return o }, {})
const casados = linhas.filter((l) => l.id_pedido)
console.log(JSON.stringify({
  ganhos_alvo: linhas.length, pedidos_livres_com_telefone: pedidosComTelefone,
  casamento: conta((l) => l.casamento.replace(/\(mais próximo.*\)/, '(fora)')),
  dias_do_ganho: conta((l) => l.dias_do_ganho === 0 ? '0' : l.dias_do_ganho < 0 ? (l.dias_do_ganho >= -3 ? '-1 a -3' : l.dias_do_ganho >= -10 ? '-4 a -10' : '-11 a -30') : '+1 a +7', casados),
  categoria_x_condicao: conta((l) => `${l.categoria} / ${l.condicao || '-'}`),
  conferir: linhas.filter((l) => l.fonte_condicao.startsWith('CONFERIR')).length,
  fonte_condicao: conta((l) => l.fonte_condicao || '(sem)', casados),
  pedido_sem_categoria: casados.filter((l) => !l.categoria_id).map((l) => l.modelo).slice(0, 20),
  ganho_por_mes: conta((l) => (l.ganho_em || 'sem').slice(0, 7)),
}, null, 1))
