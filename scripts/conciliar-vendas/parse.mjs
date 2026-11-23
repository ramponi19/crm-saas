// Fase 2 da conciliacao de vendas: le o export do grupo "PEDIDOS" do WhatsApp (_chat.txt)
// e gera pedidos_extraidos.csv, duplicados_removidos.csv e falhas_extracao.csv.
//
// Uso: node scripts/conciliar-vendas/parse.mjs <_chat.txt> <pasta-de-saida>
// So le o arquivo; nao toca no banco.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [, , ARQ, SAIDA] = process.argv
if (!ARQ || !SAIDA) { console.error('uso: parse.mjs <_chat.txt> <saida>'); process.exit(1) }
fs.mkdirSync(SAIDA, { recursive: true })

// ---------- utilitarios ----------
const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export const nomeNorm = (s) => semAcento(String(s || '')).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const limpa = (s) => String(s || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
  .replace(/<Mensagem editada>/gi, '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\u00a0/g, ' ')

/** Normaliza para +55DDD9XXXXXXXX. Devolve { e164, sem9, obs } ou null. */
export function normTelefone(bruto) {
  let d = String(bruto || '').replace(/\D/g, '')
  if (!d) return null
  let obs = ''
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 9 || d.length === 8) { d = '19' + d; obs = 'DDD 19 presumido' }
  if (d.length === 10) {
    const n = d.slice(2)
    if (/^[6-9]/.test(n)) { d = d.slice(0, 2) + '9' + n; obs = (obs ? obs + '; ' : '') + '9 acrescentado' }
    else return { e164: '+55' + d, sem9: '', obs: (obs ? obs + '; ' : '') + 'fixo' }
  }
  if (d.length !== 11 || d[2] !== '9') return null
  return { e164: '+55' + d, sem9: '+55' + d.slice(0, 2) + d.slice(3), obs }
}

const RE_TEL = /(?:\+?\s?55[\s-]*)?\(?\b\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]?\d{4}\b|\b9\d{4}[\s.-]?\d{4}\b/g
const RE_PROD = /\b(iphone|ipad|i ?pad|apple ?watch|watch|airpods?|macbook|mac ?book|imac|pencil|jbl|perfume|edp|edt|parfum|splash|\d{2,3}\s?ml|playstation|ps5|xbox|galaxy|s2[0-9]|carregador|11|12|13|14|15|16|17|18)\b|\b1[1-8]\s?(pro|plus|max|e)\b/i
const PALAVRAS_NAO_NOME = new Set(('para entregar entrega dia cor entrada restante vista credito total modelo cliente contato endereco ' +
  'vendedor pedido pedidos venda feita realizada confirmando preto preta branco branca rosa azul verde roxo dourado prata prateado ' +
  'cinza natural titanio deserto estelar meia noite lavanda grafite vermelho amarelo silver gold black white blue pink ' +
  'feminino masculino unissex semi novo seminovo lacrado retirada retirou entregue amanha hoje segunda terca quarta quinta sexta sabado domingo ' +
  'pix cartao dinheiro troca obs ok sim nao bom boa tarde noite pessoal aqui somente pf fechado isso quantos qual valor gb tb mm ' +
  'cel celular tel telefone whats whatsapp zap fone numero cpf rg imei').split(' '))

function pareceNome(s) {
  const t = limpa(s).replace(/[*_~]/g, '').trim()
  if (!t || t.length > 40 || /\d|@|\?|\$|%|\//.test(t)) return false
  if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'´`. ]*$/.test(t)) return false
  const ws = nomeNorm(t).split(' ').filter(Boolean)
  if (!ws.length || ws.length > 5) return false
  if (ws.some((w) => PALAVRAS_NAO_NOME.has(w))) return false
  if (RE_PROD.test(t)) return false
  return true
}

const ddmm = (txt) => { const m = /\b(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*(\d{2,4}))?\b/.exec(txt); return m ? m : null }
/** Converte dd/mm[/aa] em ISO, com o ano da mensagem (ou o anterior, se cair no futuro). */
function dataDe(m, dataMsg) {
  if (!m) return ''
  const d = +m[1], mo = +m[2]
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return ''
  let y = m[3] ? +m[3] : +dataMsg.slice(0, 4)
  if (y < 100) y += 2000
  let iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  if (!m[3] && iso > addDias(dataMsg.slice(0, 10), 45)) iso = `${y - 1}${iso.slice(4)}`
  if (!m[3] && iso < addDias(dataMsg.slice(0, 10), -320)) iso = `${y + 1}${iso.slice(4)}`
  return iso
}
function addDias(iso, n) { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

function lojaDe(autor) {
  const a = nomeNorm(autor)
  if (a.includes('jaguariuna')) return 'Jaguariúna'
  if (a.includes('guacu')) return 'Guaçu'
  return 'outra'
}

// ---------- leitura das mensagens ----------
const texto = fs.readFileSync(ARQ, 'utf8').replace(/\r\n/g, '\n')
const RE_HDR = /^\u200e?\[(\d\d)\/(\d\d)\/(\d{4}), (\d\d:\d\d:\d\d)\] ([^:\n]+): /gm
const hdrs = [...texto.matchAll(RE_HDR)]
const msgs = hdrs.map((h, i) => ({
  data: `${h[3]}-${h[2]}-${h[1]}T${h[4]}`, // horario local do celular (Brasilia)
  autor: h[5].trim(),
  corpo: texto.slice(h.index + h[0].length, i + 1 < hdrs.length ? hdrs[i + 1].index : texto.length).trim(),
}))

const pedidos = []
const falhas = []
const vazio = () => ({ cliente: '', telefone_bruto: '', modelo: '', cor: '', total: '', entrada: '', aparelho_troca: '', restante: '', forma_pagamento: '', vendedor: '', endereco: '', data_campo: '', instagram: '' })

function idPedido(msg, seq) { return crypto.createHash('sha1').update(`${msg.data}|${msg.autor}|${seq}`).digest('hex').slice(0, 12) }

function empurra(msg, formato, c, seq, textoOriginal, obs = '') {
  const tel = c.telefone_bruto ? normTelefone(c.telefone_bruto) : null
  const dataMsg = msg.data
  pedidos.push({
    id_pedido: idPedido(msg, seq),
    data_mensagem: dataMsg.replace('T', ' '),
    data_pedido: c.data_campo || dataMsg.slice(0, 10),
    data_pedido_origem: c.data_campo ? 'campo da mensagem' : 'data da mensagem',
    autor: msg.autor,
    loja_origem: lojaDe(msg.autor),
    formato,
    cliente: c.cliente.trim(),
    cliente_norm: nomeNorm(c.cliente),
    telefone_bruto: c.telefone_bruto.trim(),
    telefone_e164: tel?.e164 || '',
    telefone_sem9: tel?.sem9 || '',
    telefone_obs: c.telefone_bruto && !tel ? 'telefone invalido' : tel?.obs || '',
    instagram: c.instagram,
    modelo: c.modelo.trim(), cor: c.cor.trim(), total: c.total.trim(), entrada: c.entrada.trim(),
    aparelho_troca: c.aparelho_troca.trim(), restante: c.restante.trim(), forma_pagamento: c.forma_pagamento.trim(),
    vendedor: c.vendedor.trim(), endereco: c.endereco.trim(),
    observacoes: obs,
    texto_original: textoOriginal,
  })
}

const CAMPOS = [
  [/^modelo$/, 'modelo'], [/^cor$/, 'cor'], [/^(total a ser pago|total|valor)$/, 'total'], [/^entrada$/, 'entrada'],
  [/^restante$/, 'restante'], [/^(credito|a ?vista|pagamento)$/, 'pag'], [/^contato$/, 'contato'], [/^cliente$/, 'cliente'],
  [/^(endereco|entrega|retirada)$/, 'endereco'], [/^vendedora?$/, 'vendedor'], [/^(data da venda|data)$/, 'data_venda'],
]

/** Valor numerico de uma "Entrada": o aparelho da troca vai para aparelho_troca. */
function separaTroca(entrada) {
  const t = entrada
  const m = /(iphone|ip\s?\d|ipad|watch|\b1[1-8]\s?(pro|plus|max|pm|pmx)?\b)/i.exec(t)
  if (!m) return { entrada: t, troca: '' }
  return { entrada: t, troca: t.slice(m.index).trim() }
}

function parseModelo(msg, corpo, formato, seq, obs = '') {
  const c = vazio()
  const pags = []
  const linhas = corpo.split('\n').map((l) => limpa(l).replace(/[*_~]/g, '').trim())
  const soltas = []
  for (const l of linhas) {
    if (!l) continue
    const m = /^([A-Za-zÀ-ÿ /]{2,30}?)\s*:\s*(.*)$/.exec(l)
    const rot = m ? nomeNorm(m[1]) : ''
    const campo = m && CAMPOS.find(([re]) => re.test(rot))
    if (campo) {
      const v = m[2].trim()
      const k = campo[1]
      if (k === 'pag') { if (v) pags.push(`${m[1].trim()}: ${v}`); continue }
      if (k === 'contato') { if (/@/.test(v) && !RE_TEL.test(v)) c.instagram = (v.match(/@[\w.]+/) || [''])[0].toLowerCase(); RE_TEL.lastIndex = 0; const t = v.match(RE_TEL); if (t) c.telefone_bruto = t[0]; continue }
      if (k === 'data_venda') { if (!c.data_campo) c.data_campo = dataDe(ddmm(v), msg.data); continue }
      if (k === 'entrada') { c.entrada = c.entrada ? `${c.entrada}; ${v}` : v; continue }
      if (!c[k]) c[k] = v
      continue
    }
    if (/^data (da )?entrega|^data entrega/i.test(nomeNorm(l))) continue
    soltas.push(l)
  }
  // Sem rotulo: "Nome: 19 9xxxx" / "Nome +55 ..." / modelo na primeira linha de produto / "12x 473,05"
  for (const l of soltas) {
    if (/^(cpf|rg|imei|cnpj)\b/i.test(l)) continue
    RE_TEL.lastIndex = 0
    const t = l.match(RE_TEL)
    if (t && !c.telefone_bruto) {
      c.telefone_bruto = t[0]
      const nome = l.replace(t[0], '').replace(/[:\-–]/g, ' ').trim()
      if (!c.cliente && pareceNome(nome)) c.cliente = nome
      continue
    }
    if (/^confirma(ndo|r)|^venda (feita|realizada)/i.test(l)) { const dm = ddmm(l); if (dm && !c.data_campo) c.data_campo = dataDe(dm, msg.data); continue }
    if (!c.modelo && RE_PROD.test(l) && !/\d+x|r\$|vista/i.test(l)) { c.modelo = l; continue }
    if (/\d+\s?x\s|r\$|vista|pix|cart[aã]o|cr[eé]dito/i.test(l)) { pags.push(l); continue }
    if (!c.cliente && pareceNome(l)) c.cliente = l
  }
  c.forma_pagamento = pags.join(' | ')
  const tr = separaTroca(c.entrada)
  c.aparelho_troca = tr.troca
  if (!c.cliente && c.telefone_bruto) {
    // ex.: "Contato: +55 19 9..." e "Cliente:" vazio — fica sem nome, mas com telefone
  }
  const motivo = !c.modelo && !c.cliente ? 'sem modelo e sem cliente'
    : !c.telefone_bruto && !c.cliente && !c.instagram ? 'sem telefone, sem cliente e sem instagram'
    : ''
  if (motivo) { falhas.push({ data_mensagem: msg.data.replace('T', ' '), autor: msg.autor, formato, motivo, texto_original: corpo }); return }
  empurra(msg, formato, c, seq, corpo, obs)
}

/** Texto livre e listas: um cliente por linha (ou par de linhas produto/nome). */
function parseLivre(msg, corpo) {
  const linhas = corpo.split('\n').map((l) => limpa(l).replace(/[*_~]/g, '').trim()).filter(Boolean)
  let dataCampo = ''
  const itens = []
  let prodPendente = null, nomePendente = null
  const fecha = () => { if (prodPendente && nomePendente) { itens.push({ cliente: nomePendente, modelo: prodPendente }); prodPendente = nomePendente = null } }
  for (const l0 of linhas) {
    const l = l0.replace(/^(pedidos?|venda feita|venda realizada)\s*:?\s*/i, '')
    // linha que e so a data ("12/07", "Pedidos 22/07", "VENDA FEITA 16/09/2025"); "Para entregar dia X" e entrega, nao pedido
    if (/^\d{1,2}\s*\/\s*\d{1,2}(\s*\/\s*\d{2,4})?$/.test(l)) { if (!dataCampo) dataCampo = dataDe(ddmm(l), msg.data); continue }
    if (/entregar|entrega/i.test(l) && ddmm(l)) continue
    RE_TEL.lastIndex = 0
    const t = l.match(RE_TEL)
    if (t) {
      const resto = l.replace(t[0], '').replace(/[:\-–]/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/^(cel|celular|tel|telefone|whats|whatsapp|zap|fone|contato|numero|número)$/i, '')
      if (pareceNome(resto)) { itens.push({ cliente: resto, telefone_bruto: t[0], modelo: prodPendente || '' , lista: true }); prodPendente = null; continue }
      if (!resto) { itens.push({ cliente: nomePendente || '', telefone_bruto: t[0], modelo: prodPendente || '', lista: true }); prodPendente = nomePendente = null; continue }
    }
    const partes = l.split(/\s+[-–]\s*|\s*[-–]\s+|:\s+/).map((p) => p.trim()).filter(Boolean)
    if (partes.length >= 2 && RE_PROD.test(l)) {
      if (pareceNome(partes[0])) { itens.push({ cliente: partes[0], modelo: partes.slice(1).join(' - ') }); continue }
      if (pareceNome(partes[partes.length - 1])) { itens.push({ cliente: partes[partes.length - 1], modelo: partes.slice(0, -1).join(' - ') }); continue }
    }
    if (RE_PROD.test(l) && !/r\$|\d+x\s|vista|\?/i.test(l)) { if (prodPendente && !nomePendente) prodPendente = l; else prodPendente = l; if (nomePendente) fecha(); continue }
    if (pareceNome(l)) { nomePendente = l; if (prodPendente) fecha(); continue }
  }
  return { itens, dataCampo }
}

// ---------- varredura ----------
const PULAR = /^(imagem|v[ií]deo|[aá]udio|documento|figurinha|gif) ocultad[oa]$|^mensagem apagada$|^voc[eê] (criou|adicionou)|criptografia de ponta/i
for (const msg of msgs) {
  const corpo = limpa(msg.corpo).trim()
  if (!corpo || PULAR.test(corpo) || msg.autor === '***PEDIDOS***') continue
  const cab = corpo.replace(/[*_~]/g, '')
  // Uma mensagem pode ter mais de um "CONFIRMANDO": cada bloco e um pedido.
  // Variantes vistas: CONFIRMANDO [O] PEDIDO/VENDA/ENCOMENDA, CONFIRMAR PEDIDO, VENDA FEITA/REALIZADA.
  const RE_CAB = /(?:CONFIRMANDO|CONFIRMAR)\s+(?:O\s+)?(PEDIDO|VENDA|ENCOMENDA|REPARO)\b|^\s*VENDA\s+(?:FEITA|REALIZADA)\b/im
  const blocos = cab.split(/(?=(?:CONFIRMANDO|CONFIRMAR)\s+(?:O\s+)?(?:PEDIDO|VENDA|ENCOMENDA|REPARO)\b|^\s*VENDA\s+(?:FEITA|REALIZADA)\b)/im).filter((b) => b.trim())
  if (RE_CAB.test(cab)) {
    blocos.forEach((b, i) => {
      const k = RE_CAB.exec(b)
      if (!k) return // texto antes do primeiro cabecalho
      const formato = (k[1] || 'VENDA').toUpperCase()
      if (formato === 'REPARO') { falhas.push({ data_mensagem: msg.data.replace('T', ' '), autor: msg.autor, formato, motivo: 'reparo (servico, nao e venda) — fora da conciliacao', texto_original: b.trim() }); return }
      parseModelo(msg, b.trim(), formato, i, k[1] ? '' : 'cabecalho VENDA FEITA/REALIZADA')
    })
    continue
  }
  // Pedido no formato do modelo, mas sem o cabecalho (2+ rotulos Cor/Entrada/Restante/Modelo/Total).
  const rotulos = (cab.match(/^\s*(cor|entrada|restante|modelo|total a ser pago|a vista|à vista)\s*:/gim) || []).length
  if (rotulos >= 2) { parseModelo(msg, cab, 'PEDIDO', 0, 'sem cabecalho CONFIRMANDO'); continue }
  const { itens, dataCampo } = parseLivre(msg, corpo)
  if (!itens.length) continue // conversa, aviso, cotacao
  itens.forEach((it, i) => {
    const c = { ...vazio(), cliente: it.cliente || '', telefone_bruto: it.telefone_bruto || '', modelo: it.modelo || '', data_campo: dataCampo }
    empurra(msg, it.lista ? 'lista' : 'livre', c, i, corpo)
  })
}

// Telefone mandado sozinho (ex.: "cel: 19 9...") ate 30 min de um pedido do modelo sem telefone,
// do mesmo autor: vira o telefone desse pedido.
const tms = (p) => new Date(p.data_mensagem.replace(' ', 'T')).getTime()
for (const solto of pedidos.filter((p) => p.formato === 'lista' && !p.cliente && !p.modelo && p.telefone_e164)) {
  const alvo = pedidos.filter((p) => !['lista', 'livre'].includes(p.formato) && !p.telefone_e164 && p.autor === solto.autor
    && Math.abs(tms(p) - tms(solto)) <= 30 * 60e3).sort((a, b) => Math.abs(tms(a) - tms(solto)) - Math.abs(tms(b) - tms(solto)))[0]
  if (!alvo) continue
  Object.assign(alvo, { telefone_bruto: solto.telefone_bruto, telefone_e164: solto.telefone_e164, telefone_sem9: solto.telefone_sem9,
    observacoes: [alvo.observacoes, `telefone em mensagem separada (${solto.data_mensagem})`].filter(Boolean).join('; ') })
  pedidos.splice(pedidos.indexOf(solto), 1)
}

// ---------- deduplicacao: telefone (ou nome) + modelo em ate 7 dias ----------
const modeloChave = (s) => semAcento(String(s || '').toLowerCase()).replace(/iphone|apple|gb|tb|\bde\b|-/g, ' ').replace(/[^a-z0-9]/g, '')
const completude = (p) => ['cliente', 'telefone_e164', 'modelo', 'cor', 'total', 'entrada', 'restante', 'forma_pagamento', 'vendedor', 'endereco'].filter((k) => p[k]).length
pedidos.sort((a, b) => a.data_mensagem.localeCompare(b.data_mensagem))
const ficou = []
const removidos = []
const dias = (a, b) => Math.abs(new Date(a.replace(' ', 'T')) - new Date(b.replace(' ', 'T'))) / 864e5
for (const p of pedidos) {
  const quem = p.telefone_e164 || (p.cliente_norm ? 'n:' + p.cliente_norm : '')
  const mod = modeloChave(p.modelo)
  const dup = quem && ficou.find((q) => (q.telefone_e164 || (q.cliente_norm ? 'n:' + q.cliente_norm : '')) === quem
    && modeloChave(q.modelo) === mod && dias(q.data_mensagem, p.data_mensagem) <= 7)
  if (!dup) { ficou.push(p); continue }
  // mantem a mais completa; empate -> a mais recente (p)
  const fica = completude(p) >= completude(dup) ? p : dup
  const sai = fica === p ? dup : p
  if (fica === p) ficou[ficou.indexOf(dup)] = p
  removidos.push({ ...sai, mantido_id_pedido: fica.id_pedido, motivo: 'mesmo ' + (p.telefone_e164 ? 'telefone' : 'nome') + ' + modelo em ate 7 dias' })
}

// ---------- CSV ----------
const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
export function csv(arquivo, linhas, colunas) {
  const cols = colunas || Object.keys(linhas[0] || {})
  fs.writeFileSync(arquivo, '\ufeff' + [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\r\n'), 'utf8')
}
const COLS = ['id_pedido', 'data_mensagem', 'data_pedido', 'data_pedido_origem', 'autor', 'loja_origem', 'formato', 'cliente', 'telefone_bruto', 'telefone_e164', 'telefone_sem9', 'telefone_obs', 'instagram', 'modelo', 'cor', 'total', 'entrada', 'aparelho_troca', 'restante', 'forma_pagamento', 'vendedor', 'endereco', 'observacoes', 'texto_original']
csv(path.join(SAIDA, 'pedidos_extraidos.csv'), ficou, COLS)
csv(path.join(SAIDA, 'duplicados_removidos.csv'), removidos, [...COLS.slice(0, -1), 'mantido_id_pedido', 'motivo', 'texto_original'])
csv(path.join(SAIDA, 'falhas_extracao.csv'), falhas, ['data_mensagem', 'autor', 'formato', 'motivo', 'texto_original'])
fs.writeFileSync(path.join(SAIDA, 'pedidos_extraidos.json'), JSON.stringify(ficou))

// ---------- resumo ----------
const por = (arr, k) => arr.reduce((o, x) => ((o[x[k]] = (o[x[k]] || 0) + 1), o), {})
console.log(JSON.stringify({
  mensagens: msgs.length,
  pedidos_brutos: pedidos.length, por_formato_bruto: por(pedidos, 'formato'),
  com_telefone_bruto: pedidos.filter((p) => p.telefone_e164).length,
  apos_dedupe: ficou.length, por_formato: por(ficou, 'formato'), por_loja: por(ficou, 'loja_origem'),
  com_telefone: ficou.filter((p) => p.telefone_e164).length,
  so_instagram: ficou.filter((p) => !p.telefone_e164 && p.instagram).length,
  sem_cliente: ficou.filter((p) => !p.cliente).length, sem_modelo: ficou.filter((p) => !p.modelo).length,
  telefone_invalido: ficou.filter((p) => p.telefone_obs === 'telefone invalido').length,
  ajustes_telefone: por(ficou.filter((p) => p.telefone_obs), 'telefone_obs'),
  data_do_campo: ficou.filter((p) => p.data_pedido_origem === 'campo da mensagem').length,
  duplicados: removidos.length, falhas: falhas.length, falhas_por_motivo: por(falhas, 'motivo'),
}, null, 1))
