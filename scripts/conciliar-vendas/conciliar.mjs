// Fase 3 da conciliacao de vendas (DRY-RUN, so leitura): cruza pedidos_extraidos.json com
// contatos/negocios da JM (empresa 1) e as fichas do ZapIntel. Nao grava nada no banco.
//
// Uso: node --env-file=.env.local scripts/conciliar-vendas/conciliar.mjs <pasta-com-pedidos_extraidos.json>
// Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (nunca no codigo).
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PASTA = process.argv[2]
// Pasta de saida opcional (rodadas novas nao sobrescrevem o conciliacao_revisar.csv marcado pelo Lucas)
const SAIDA = process.argv[3] || PASTA
const EMPRESA = 1
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!PASTA || !url || !chave) { console.error('uso: node --env-file=.env.local conciliar.mjs <pasta>'); process.exit(1) }
const sb = createClient(url, chave, { auth: { persistSession: false } })

// ---------- utilitarios ----------
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const nomeNorm = (s) => semAcento(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const modeloChave = (s) => semAcento(String(s || '').toLowerCase()).replace(/iphone|apple|gb|tb|\bde\b|-/g, ' ').replace(/[^a-z0-9]/g, '')
function normTel(bruto) {
  let d = String(bruto || '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) return { e164: '+55' + d.slice(0, 2) + '9' + d.slice(2), sem9: '+55' + d, tinha9: false }
  if (d.length === 11 && d[2] === '9') return { e164: '+55' + d, sem9: '+55' + d.slice(0, 2) + d.slice(3), tinha9: true }
  return d.length >= 10 ? { e164: '+55' + d, sem9: '', tinha9: true } : null
}
function jaroWinkler(a, b) {
  if (a === b) return 1
  const la = a.length, lb = b.length; if (!la || !lb) return 0
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1)
  const ma = new Array(la).fill(false), mb = new Array(lb).fill(false)
  let m = 0
  for (let i = 0; i < la; i++) for (let j = Math.max(0, i - win); j < Math.min(lb, i + win + 1); j++) if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break }
  if (!m) return 0
  let t = 0, k = 0
  for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++ }
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3
  let p = 0; while (p < 4 && a[p] === b[p]) p++
  return jaro + p * 0.1 * (1 - jaro)
}
const diaLocal = (iso) => iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : ''
const DIA = 864e5
const agora = Date.now()

async function tudo(tabela, colunas, filtro = (q) => q) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order('id', { ascending: true }).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    out.push(...data); if (data.length < 1000) break
  }
  return out
}

// ---------- base (so SELECT) ----------
const pedidos = JSON.parse(fs.readFileSync(path.join(PASTA, 'pedidos_extraidos.json'), 'utf8'))
const [funis, etapas, filiais, contatos, idents, negocios, conversas] = await Promise.all([
  tudo('funis', 'id, nome, interno', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('funil_etapas', 'id, slug, label, tipo, funil_id', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('filiais', 'id, nome', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('contatos', 'id, nome, telefone, telefone_e164, instagram, filial_id, ativo, created_at', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('contato_identidades', 'id, contato_id, canal_tipo, external_id', (q) => q.eq('empresa_id', EMPRESA).eq('canal_tipo', 'whatsapp')),
  tudo('negocios', 'id, contato_id, funil_id, etapa_id, status, ativo, created_at, ganho_em, perdido_em, valor_estimado, filial_id, produto:dados->>produto_interessado', (q) => q.eq('empresa_id', EMPRESA)),
  tudo('conversas', 'id, contato_id, filial_id, ultima_mensagem_at, ultima_recebida_at', (q) => q.eq('empresa_id', EMPRESA)),
])
const perfis = []
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb.from('zapintel_lead_perfil').select('lead_id, classificacao:perfil->>classificacao, gerado_em')
    .eq('empresa_id', EMPRESA).order('lead_id').range(de, de + 999)
  if (error) throw new Error('perfil: ' + error.message)
  perfis.push(...data); if (data.length < 1000) break
}

// Negocios de recompra criados depois de um ganho (core_negocio_do_canal / restauracao, acao novo_apos_ganho):
// nunca entram na conversao — sao conversa nova, nao o pedido antigo.
const recompra = new Set()
{
  const { data, error } = await sb.from('negocio_historico').select('negocio_id').eq('empresa_id', EMPRESA).eq('acao', 'novo_apos_ganho')
  if (error) throw new Error('historico: ' + error.message)
  for (const h of data) recompra.add(h.negocio_id)
}

const funil = new Map(funis.map((f) => [f.id, f]))
const etapa = new Map(etapas.map((e) => [e.id, e]))
const filial = new Map(filiais.map((f) => [f.id, f.nome]))
const contato = new Map(contatos.map((c) => [c.id, c]))
const perfil = new Map(perfis.map((p) => [p.lead_id, p]))
const interno = (n) => !!funil.get(n.funil_id)?.interno
const ETAPA_CONVERTIDO = etapas.find((e) => e.slug === 'convertido' && e.tipo === 'ganho')
if (!ETAPA_CONVERTIDO || ETAPA_CONVERTIDO.id !== 15) throw new Error('etapa convertido nao e a 15 — parar')

// Ultima interacao por contato (todas as conversas do contato)
const ultima = new Map()
for (const cv of conversas) { const u = cv.ultima_mensagem_at; if (u && (!ultima.get(cv.contato_id) || u > ultima.get(cv.contato_id))) ultima.set(cv.contato_id, u) }

// Negocios por contato
const negDoContato = new Map()
for (const n of negocios) { if (!negDoContato.has(n.contato_id)) negDoContato.set(n.contato_id, []); negDoContato.get(n.contato_id).push(n) }

// Indices de telefone: e164 do contato, telefone livre normalizado e identidade de WhatsApp
const porTel = new Map(), porSem9 = new Map()
const add = (m, k, id) => { if (!k) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(id) }
for (const c of contatos) {
  for (const t of [c.telefone_e164, c.telefone].map(normTel).filter(Boolean)) {
    add(porTel, t.e164, c.id)
    if (!t.tinha9) add(porSem9, t.sem9, c.id) // contato gravado sem o 9
  }
}
for (const i of idents) { const t = normTel(i.external_id); if (t) add(porTel, t.e164, i.contato_id) }
const porInsta = new Map()
for (const c of contatos) { const ig = String(c.instagram || '').toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').trim(); if (ig) add(porInsta, ig, c.id) }
const porNome = new Map()
for (const c of contatos) add(porNome, nomeNorm(c.nome), c.id)
const nomesUnicos = [...porNome.keys()].filter(Boolean)

// ---------- casamento pedido -> contato(s) ----------
function casaContatos(p) {
  if (p.telefone_e164) {
    const a = porTel.get(p.telefone_e164)
    if (a) {
      const ajustado = /9 acrescentado/.test(p.telefone_obs || '')
      return { faixa: ajustado ? 'B' : 'A', criterio: ajustado ? 'telefone (pedido sem o 9; contato com o 9)' : 'telefone exato', ids: [...a] }
    }
    const b = p.telefone_sem9 && porSem9.get(p.telefone_sem9)
    if (b) return { faixa: 'B', criterio: 'telefone (contato gravado sem o 9)', ids: [...b] }
  }
  if (p.instagram) {
    const ig = porInsta.get(p.instagram.replace(/^@/, ''))
    if (ig) return { faixa: ig.size === 1 ? 'C' : 'D', criterio: 'instagram exato' + (ig.size > 1 ? ` (${ig.size} contatos)` : ''), ids: [...ig] }
  }
  const nn = p.cliente_norm
  if (!nn) return null
  const obsTel = p.telefone_e164 ? '; telefone do pedido NAO esta no Nexus' : ''
  const exato = porNome.get(nn)
  const tokens = nn.split(' ').length
  if (exato) {
    if (exato.size === 1 && !p.telefone_e164) return { faixa: 'C', criterio: 'nome exato, contato unico', ids: [...exato] }
    if (exato.size <= 5) return { faixa: 'D', criterio: `nome exato (${exato.size} contato(s))${obsTel}`, ids: [...exato] }
    return { faixa: 'sem', criterio: `nome ambiguo: ${exato.size} contatos com "${p.cliente}"`, ids: [] }
  }
  if (tokens < 2) return { faixa: 'sem', criterio: 'so o primeiro nome, sem contato com esse nome', ids: [] }
  // Parecido = todos os nomes do mais curto (2+ nomes) aparecem no outro, cada um com Jaro-Winkler >= 0,85
  // ("joao silva" ~ "joao silva souza"; "ana lima" NAO ~ "ana lopes"). Nota = media.
  const cand = []
  const tp = nn.split(' ')
  for (const k of nomesUnicos) {
    const tk = k.split(' ')
    const [curto, longo] = tp.length <= tk.length ? [tp, tk] : [tk, tp]
    if (curto.length < 2) continue
    let soma = 0, ok = true
    const livres = [...longo] // cada nome do outro lado casa uma vez so
    for (const t of curto) {
      let best = -1, s = 0
      livres.forEach((l, i) => { const v = jaroWinkler(t, l); if (v > s) { s = v; best = i } })
      if (s < 0.85) { ok = false; break }
      soma += s; livres.splice(best, 1)
    }
    if (ok) cand.push([k, soma / curto.length])
  }
  cand.sort((a, b) => b[1] - a[1])
  const ids = cand.slice(0, 3).flatMap(([k]) => [...porNome.get(k)]).slice(0, 5)
  if (ids.length) return { faixa: 'D', criterio: `nome parecido (${cand.slice(0, 3).map(([k, s]) => `${k} ${s.toFixed(2)}`).join(', ')})${obsTel}`, ids }
  return null
}

const prodCompat = (pedidoModelo, negProd) => {
  const a = modeloChave(pedidoModelo), b = modeloChave(negProd)
  if (!a || !b) return null
  return a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4)
}
/** "R$2.595,00 + Capa = R$2.990,00" -> 2990; "5795,00" -> 5795; sem numero -> '' */
function valorNum(txt) {
  const ms = [...String(txt || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g)]
    .map((m) => +(m[1].replace(/\./g, '') + '.' + (m[2] || '0'))).filter((v) => v >= 10)
  return ms.length ? ms[ms.length - 1] : ''
}
const ganhoProposto = (p) => p.data_pedido === p.data_mensagem.slice(0, 10)
  ? p.data_mensagem.replace(' ', 'T') + '-03:00' : p.data_pedido + 'T12:00:00-03:00'

// ---------- saidas ----------
const atualizar = [], revisar = [], semNegocio = [], diverg = [], jaGanhos = []
const usados = new Set() // negocios ja escolhidos
const tocados = new Set() // negocios citados em atualizar/revisar (saem da lista "sem pedido")
const pedidosCasados = new Map() // id_pedido -> casamento

const linhaNeg = (n) => {
  const c = contato.get(n.contato_id), e = etapa.get(n.etapa_id), pf = perfil.get(n.id)
  return { negocio_id: n.id, contato_id: n.contato_id, ficha_zapintel_id: pf ? n.id : '', cliente_nexus: c?.nome || '', telefone_nexus: c?.telefone_e164 || c?.telefone || '',
    etapa_atual: e ? `${e.label} (#${e.id})` : '(sem etapa)', status_atual: n.status, criado_em: n.created_at, ganho_em_atual: n.ganho_em || '',
    classificacao_zapintel_atual: pf?.classificacao || '(sem ficha)', loja_nexus: filial.get(n.filial_id) || '', valor_estimado_atual: n.valor_estimado ?? '' }
}
const linhaPed = (p) => ({ id_pedido: p.id_pedido, cliente: p.cliente, telefone: p.telefone_e164 || p.telefone_bruto || p.instagram, produto_pedido: [p.modelo, p.cor].filter(Boolean).join(' / '),
  data_pedido: p.data_pedido, valor_pedido: p.total, vendedor: p.vendedor, loja_origem: p.loja_origem, formato: p.formato })

// Processa por contato em ordem cronologica: cada pedido pega o aberto criado ate o dia do pedido, o mais proximo.
const casados = []
for (const p of pedidos) {
  const m = casaContatos(p)
  if (!m || m.faixa === 'sem') { semNegocio.push({ ...linhaPed(p), motivo: m ? m.criterio : (p.telefone_e164 ? 'telefone nao esta no Nexus' : p.cliente ? 'nome nao encontrado' : 'sem telefone e sem nome'), contatos_candidatos: '' }); continue }
  casados.push({ p, m })
}
casados.sort((a, b) => a.p.data_pedido.localeCompare(b.p.data_pedido))
for (const { p, m } of casados) {
  const negs = m.ids.flatMap((id) => negDoContato.get(id) || []).filter((n) => !interno(n) && !recompra.has(n.id))
  const dia = p.data_pedido
  const abertos = negs.filter((n) => n.status === 'aberto' && n.ativo && !usados.has(n.id))
  const elegiveis = abertos.filter((n) => diaLocal(n.created_at) <= dia)
  elegiveis.sort((a, b) => {
    const ca = prodCompat(p.modelo, a.produto) ? 0 : 1, cb = prodCompat(p.modelo, b.produto) ? 0 : 1
    return ca - cb || b.created_at.localeCompare(a.created_at)
  })
  const escolhido = elegiveis[0]
  if (escolhido) {
    if (m.faixa === 'C') {
      // C exige produto/data compativel; sem compatibilidade de produto conhecida, vai para D
      const compat = prodCompat(p.modelo, escolhido.produto)
      if (compat === false) m.faixa = 'D', m.criterio += '; produto do negocio diferente'
    }
    usados.add(escolhido.id); tocados.add(escolhido.id)
    const base = { ...linhaNeg(escolhido), ...linhaPed(p), ganho_em_proposto: ganhoProposto(p), faixa: m.faixa, criterio: m.criterio,
      produto_negocio: escolhido.produto || '', produto_compativel: prodCompat(p.modelo, escolhido.produto) ?? 'sem produto no negocio',
      valor_estimado_proposto: (escolhido.valor_estimado == null || +escolhido.valor_estimado === 0) ? valorNum(p.total) : '' }
    if (m.faixa === 'A' || m.faixa === 'B') atualizar.push(base)
    else revisar.push({ aprovar: '', ...base })
    pedidosCasados.set(p.id_pedido, { m, n: escolhido })
    continue
  }
  // Nenhum aberto elegivel: explica por que
  const ganhos = negs.filter((n) => n.status === 'ganho')
  const perdidos = negs.filter((n) => n.status === 'perdido')
  const abertosDepois = abertos.filter((n) => diaLocal(n.created_at) > dia)
  const arquivados = negs.filter((n) => n.status === 'aberto' && !n.ativo)
  const cand = m.ids.map((id) => `${id}:${contato.get(id)?.nome || ''}`).join(' | ')
  if (ganhos.length && (m.faixa === 'A' || m.faixa === 'B')) {
    jaGanhos.push(p.id_pedido)
    for (const g of ganhos) if (!g.ganho_em) diverg.push({ tipo: 'ganho sem ganho_em (pedido no ZIP)', ...linhaNeg(g), ...linhaPed(p), detalhe: m.criterio })
    if (abertosDepois.length) for (const n of abertosDepois) diverg.push({ tipo: 'aberto criado DEPOIS do pedido (cliente voltou?) — contato ja tem ganho', ...linhaNeg(n), ...linhaPed(p), detalhe: m.criterio })
    continue
  }
  if (perdidos.length && (m.faixa === 'A' || m.faixa === 'B')) {
    for (const n of perdidos) diverg.push({ tipo: 'perdido que comprou', ...linhaNeg(n), ...linhaPed(p), detalhe: m.criterio })
    continue
  }
  if (abertosDepois.length && (m.faixa === 'A' || m.faixa === 'B')) {
    for (const n of abertosDepois) diverg.push({ tipo: 'aberto criado DEPOIS do pedido (cliente voltou?) — nao convertido', ...linhaNeg(n), ...linhaPed(p), detalhe: m.criterio })
    semNegocio.push({ ...linhaPed(p), motivo: `contato achado (${m.faixa}), mas o unico negocio aberto foi criado depois do pedido`, contatos_candidatos: cand })
    continue
  }
  const motivo = negs.length === 0 ? `contato achado (${m.faixa}: ${m.criterio}) sem negocio no funil de vendas`
    : arquivados.length && negs.every((n) => n.status === 'aberto' && !n.ativo) ? `contato achado (${m.faixa}), negocio(s) so arquivado(s)`
    : abertos.length === 0 && negs.some((n) => usados.has(n.id)) ? `contato achado (${m.faixa}), mas o(s) negocio(s) aberto(s) ja foram usados por pedido anterior`
    : m.faixa === 'A' || m.faixa === 'B' ? `contato achado (${m.faixa}), sem negocio aberto elegivel`
    : `candidato por ${m.criterio}, sem negocio aberto anterior ao pedido`
  semNegocio.push({ ...linhaPed(p), motivo, contatos_candidatos: cand })
}

// Negocios extras abertos dos contatos convertidos
const contatosConvertidos = new Set(atualizar.map((a) => a.contato_id))
for (const cid of contatosConvertidos) {
  for (const n of (negDoContato.get(cid) || [])) {
    if (n.status === 'aberto' && n.ativo && !interno(n) && !usados.has(n.id)) {
      tocados.add(n.id)
      diverg.push({ tipo: 'negocio extra aberto (contato convertido por outro negocio)', ...linhaNeg(n), detalhe: 'nao alterado' })
    }
  }
}
// Ganhos sem ganho_em (todos), convertidos que nao sao Cliente no ZapIntel
for (const n of negocios) {
  if (n.status === 'ganho' && !n.ganho_em && !diverg.some((d) => d.negocio_id === n.id && d.tipo.startsWith('ganho sem'))) diverg.push({ tipo: 'ganho sem ganho_em', ...linhaNeg(n), detalhe: '' })
  if (n.etapa_id === 15 && perfil.get(n.id) && perfil.get(n.id).classificacao !== 'customer') diverg.push({ tipo: 'convertido no Nexus, ficha do ZapIntel nao e Cliente', ...linhaNeg(n), detalhe: `ficha gerada em ${perfil.get(n.id).gerado_em}` })
  if (n.etapa_id === 15 && n.status !== 'ganho') diverg.push({ tipo: 'etapa Convertido com status diferente de ganho', ...linhaNeg(n), detalhe: '' })
}
// Telefones repetidos entre contatos
const contatosPorE164 = new Map()
for (const c of contatos) if (c.telefone_e164) add(contatosPorE164, c.telefone_e164, c.id)
for (const [tel, ids] of contatosPorE164) {
  if (ids.size < 2) continue
  const cs = [...ids].map((i) => contato.get(i))
  const mesmaLoja = new Set(cs.map((c) => c.filial_id)).size < cs.length
  diverg.push({ tipo: mesmaLoja ? 'telefone repetido entre contatos da MESMA loja' : 'telefone repetido entre lojas (esperado no multiloja)', telefone_nexus: tel,
    contato_id: [...ids].join(' | '), cliente_nexus: cs.map((c) => `${c.nome} (${filial.get(c.filial_id) || 'sem loja'})`).join(' | '), detalhe: '' })
}

// Abertos sem pedido (a lista de direcionamento)
const semPedido = []
for (const n of negocios) {
  if (n.status !== 'aberto' || !n.ativo || interno(n) || tocados.has(n.id)) continue
  const c = contato.get(n.contato_id), e = etapa.get(n.etapa_id)
  const ult = ultima.get(n.contato_id) || null
  const ref = ult || n.created_at
  semPedido.push({ negocio_id: n.id, contato_id: n.contato_id, cliente: c?.nome || '', telefone: c?.telefone_e164 || c?.telefone || '', loja: filial.get(n.filial_id) || '',
    etapa: e ? e.label : '(sem etapa)', produto_interesse: n.produto || '', criado_em: n.created_at.slice(0, 10), ultima_interacao: ult ? ult.slice(0, 16).replace('T', ' ') : '(sem conversa)',
    dias_parado: Math.floor((agora - new Date(ref).getTime()) / DIA), classificacao_zapintel: perfil.get(n.id)?.classificacao || '(sem ficha)' })
}
semPedido.sort((a, b) => a.dias_parado - b.dias_parado)

// ---------- CSV ----------
const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
function csv(nome, linhas, cols) {
  cols = cols || [...new Set(linhas.flatMap((l) => Object.keys(l)))]
  fs.writeFileSync(path.join(SAIDA, nome), '﻿' + [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\r\n'), 'utf8')
}
const COLS_AT = ['negocio_id', 'contato_id', 'ficha_zapintel_id', 'cliente', 'telefone', 'produto_pedido', 'etapa_atual', 'status_atual', 'ganho_em_proposto', 'classificacao_zapintel_atual',
  'valor_pedido', 'vendedor', 'loja_origem', 'faixa', 'id_pedido', 'criterio', 'data_pedido', 'cliente_nexus', 'telefone_nexus', 'loja_nexus', 'criado_em', 'produto_negocio', 'produto_compativel',
  'valor_estimado_atual', 'valor_estimado_proposto', 'formato']
csv('conciliacao_atualizar.csv', atualizar, COLS_AT)
csv('conciliacao_revisar.csv', revisar, ['aprovar', ...COLS_AT])
csv('pedidos_sem_negocio.csv', semNegocio, ['id_pedido', 'cliente', 'telefone', 'produto_pedido', 'data_pedido', 'valor_pedido', 'vendedor', 'loja_origem', 'formato', 'motivo', 'contatos_candidatos'])
csv('negocios_abertos_sem_pedido.csv', semPedido)
csv('divergencias.csv', diverg, ['tipo', 'negocio_id', 'contato_id', 'cliente_nexus', 'telefone_nexus', 'etapa_atual', 'status_atual', 'criado_em', 'ganho_em_atual', 'classificacao_zapintel_atual',
  'loja_nexus', 'id_pedido', 'cliente', 'telefone', 'produto_pedido', 'data_pedido', 'valor_pedido', 'detalhe'])
fs.writeFileSync(path.join(SAIDA, 'conciliacao_atualizar.json'), JSON.stringify(atualizar))

const por = (arr, k) => arr.reduce((o, x) => ((o[x[k]] = (o[x[k]] || 0) + 1), o), {})
const filaAbertos = negocios.filter((n) => n.status === 'aberto' && n.ativo && !interno(n)).length
console.log(JSON.stringify({
  base: { contatos: contatos.length, negocios: negocios.length, abertos_na_fila: filaAbertos, abertos_arquivados: negocios.filter((n) => n.status === 'aberto' && !n.ativo && !interno(n)).length, fichas: perfis.length },
  pedidos: pedidos.length,
  atualizar: atualizar.length, atualizar_por_faixa: por(atualizar, 'faixa'),
  revisar: revisar.length, revisar_por_faixa: por(revisar, 'faixa'),
  ja_ganhos_ignorados: jaGanhos.length,
  pedidos_sem_negocio: semNegocio.length,
  sem_negocio_motivos: Object.entries(por(semNegocio.map((s) => ({ m: s.motivo.replace(/\(.*?\)|".*?"|\d+ contatos/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) })), 'm')).sort((a, b) => b[1] - a[1]),
  abertos_sem_pedido: semPedido.length,
  divergencias: diverg.length, divergencias_por_tipo: por(diverg, 'tipo'),
  atualizar_produto_compativel: por(atualizar, 'produto_compativel'),
  atualizar_ficha_zapintel: por(atualizar, 'classificacao_zapintel_atual'),
  atualizar_por_mes_pedido: por(atualizar.map((a) => ({ m: a.data_pedido.slice(0, 7) })), 'm'),
}, null, 1))
