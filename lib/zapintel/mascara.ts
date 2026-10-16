import type { Lead } from '@/types/zapintel'

/**
 * O QUE SAI PARA A IA É O MÍNIMO NECESSÁRIO — LGPD, art. 6º, III.
 *
 * A ficha e a sugestão mandam a conversa a um provedor de IA. Para analisar a
 * venda, ele precisa do que foi dito; não precisa do CPF que a cliente digitou
 * para o crediário, do e-mail, do telefone do marido, do número do cartão nem
 * do número da casa. Medido em produção em 16/10/2026: 37 conversas com CPF
 * formatado, 134 que falam "CPF", 291 com CEP, 91 com e-mail.
 *
 * ══ A MÁSCARA VALE SÓ PARA O ENVIO ════════════════════════════════════════
 *
 * Nada aqui toca o banco nem a tela: `leadParaIA` devolve uma CÓPIA do lead,
 * que os montadores de prompt (`contextoDoPerfil`, `contextoDaSugestao`) usam
 * e jogam fora. O vendedor continua vendo a conversa inteira.
 *
 * ══ MARCADOR LEGÍVEL, NÃO ASTERISCO ═══════════════════════════════════════
 *
 * "[CPF]" diz à IA o que havia ali, e a ficha pode escrever "mandou o CPF para
 * o crediário" — que é o fato que importa para a venda. "***" ela não sabe ler
 * e às vezes tenta completar.
 *
 * ══ POR QUE HÁ VALIDAÇÃO DE DÍGITO ═════════════════════════════════════════
 *
 * Onze dígitos seguidos podem ser CPF ou celular com DDD; treze a dezenove
 * podem ser cartão ou um código qualquer. Os dígitos verificadores do CPF e do
 * CNPJ e o algoritmo de Luhn do cartão separam os casos sem chute: só vira
 * [CPF] o que é CPF válido, só vira [CARTÃO] o que passa no Luhn.
 */

const so = (s: string) => s.replace(/\D/g, '')

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const dv = (base: string, peso: number) => {
    let soma = 0
    for (const c of base) soma += Number(c) * peso--
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10])
}

function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13])
}

function luhn(d: string): boolean {
  if (!/^\d{13,19}$/.test(d)) return false
  let soma = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
    soma += n
  }
  return soma % 10 === 0
}

/** Celular ou fixo brasileiro, só dígitos: com DDD, com 55 na frente, ou só o número. */
function pareceTelefone(d: string): boolean {
  if (/^55[1-9][1-9]9?\d{8}$/.test(d)) return true // +55 DDD número
  if (/^[1-9][1-9]9\d{8}$/.test(d)) return true // DDD + celular
  if (/^[1-9][1-9][2-5]\d{7}$/.test(d)) return true // DDD + fixo
  if (/^9\d{8}$/.test(d)) return true // celular sem DDD
  return false
}

/** Rua/Av/Alameda... — o endereço vem anunciado pelo tipo de logradouro. */
const LOGRADOURO = /\b(Rua|R\.|Avenida|Av\.?|Alameda|Al\.|Travessa|Tv\.|Estrada|Rodovia|Rod\.|Pra[cç]a|Largo)\s+([^,\n\d]{2,60}?)\s*,?\s*(?:n[º°o]\.?\s*|n[uú]mero\s*)?(\d{1,6}[A-Za-z]?)\b/gi
const COMPLEMENTO = /\b(apartamento|apto\.?|apt\.?|ap\.?|bloco|bl\.?|casa|sala|lote|lt\.?|quadra|qd\.?)\s*(\d{1,5}[A-Za-z]?)\b/gi
const CEP_FORMATADO = /\b\d{5}-\d{3}\b/

export function mascararDadosPessoais(texto: string): string {
  if (!texto) return texto
  let t = texto

  // 1. O que tem forma inconfundível vem primeiro: depois disso, sobra dígito solto.
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[E-MAIL]')
  // Chave Pix aleatória (formato UUID). As de CPF, e-mail e telefone caem nas regras deles.
  t = t.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[CHAVE PIX]')
  // Cartão com separadores: 4-4-4-1..7 (Visa/Master/Elo) e 4-6-5 (Amex).
  t = t.replace(/\b\d{4}(?:[ .-]\d{4}){2}[ .-]\d{1,7}\b|\b\d{4}[ -]\d{6}[ -]\d{5}\b/g,
    (m) => (so(m).length >= 13 && so(m).length <= 19 ? '[CARTÃO]' : m))
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ]')
  t = t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')

  // 2. Documento anunciado pela palavra: o número que vem depois some, qualquer formato.
  t = t.replace(/\b(CPF)\b(\s*(?:n[º°o.]?\s*)?[:\-]?\s*)(\d[\d.\-\s]{8,13}\d)/gi, (_m, k: string, sep: string) => `${k}${sep}[CPF]`)
  t = t.replace(/\b(RG|R\.G\.|identidade)(\s*(?:n[º°o.]?\s*)?[:\-]?\s*)([\dXx][\dXx.\-\s]{4,13}[\dXx])\b/gi, (_m, k: string, sep: string) => `${k}${sep}[RG]`)
  t = t.replace(/\b(IMEI)\b(\s*[:\-]?\s*)(\d{15})\b/gi, (_m, k: string, sep: string) => `${k}${sep}[IMEI]`)
  t = t.replace(/\b(CNH|habilita[cç][aã]o)\b(\s*(?:n[º°o.]?\s*)?[:\-]?\s*)(\d[\d.\-\s]{7,13}\d)/gi, (_m, k: string, sep: string) => `${k}${sep}[CNH]`)
  t = t.replace(/\b\d{1,2}\.\d{3}\.\d{3}-[\dXx]\b/g, '[RG]')
  const temCep = CEP_FORMATADO.test(texto) || /\bcep\b/i.test(texto)
  t = t.replace(/\b(CEP)\b(\s*[:\-]?\s*)(\d{5}-?\d{3}|\d{2}\.\d{3}-\d{3})/gi, (_m, k: string, sep: string) => `${k}${sep}[CEP]`)
  t = t.replace(/\b\d{5}-\d{3}\b/g, '[CEP]')

  // 3. Telefone com separador: (19) 98888-7777, 19 98888-7777, +55 19 98888 7777, 98888-7777.
  t = t.replace(/(?:\+?55[\s.-]?)?(?:\(\s*\d{2}\s*\)|\b\d{2})[\s.-]?9?\d{4}[\s.-]\d{4}\b/g, '[TELEFONE]')
  t = t.replace(/\b9?\d{4}-\d{4}\b/g, (m) => (/^(19|20)\d\d-(19|20)\d\d$/.test(m) ? m : '[TELEFONE]'))

  // 4. Dígitos corridos: os validadores decidem o que é cada um.
  t = t.replace(/\+?\b\d{8,19}\b/g, (m) => {
    const d = so(m)
    if (d.length === 11 && cpfValido(d)) return '[CPF]'
    if (d.length === 14 && cnpjValido(d)) return '[CNPJ]'
    if (m.startsWith('+') || pareceTelefone(d)) return '[TELEFONE]'
    // IMEI também passa no Luhn e tem 15 dígitos — o mesmo tamanho do Amex,
    // que começa com 34 ou 37. Sem isto o aparelho do cliente virava "cartão".
    if (d.length === 15 && !/^3[47]/.test(d) && luhn(d)) return '[IMEI]'
    if (luhn(d)) return '[CARTÃO]'
    return m
  })

  // 5. Pix anunciado por palavra, com o que ainda for número longo depois dela.
  t = t.replace(/\b(chave\s+pix|pix)(\s*[:\-]\s*)([^\s[\]]*\d[^\s[\]]*)/gi,
    (m, k: string, sep: string, v: string) => (so(v).length >= 8 ? `${k}${sep}[CHAVE PIX]` : m))

  // 6. Endereço: número e complemento somem; rua, bairro e cidade ficam.
  const temLogradouro = new RegExp(LOGRADOURO.source, 'i').test(texto)
  if (temLogradouro || temCep) {
    t = t.replace(LOGRADOURO, (_m, tipo: string, nome: string) => `${tipo} ${nome.trim()}, [Nº]`)
    t = t.replace(/\b(n[º°]|n[uú]mero)\.?\s*\d{1,6}[A-Za-z]?\b/gi, (_m, k: string) => `${k} [Nº]`)
    t = t.replace(COMPLEMENTO, (_m, k: string) => `${k} [COMPLEMENTO]`)
  }

  return t
}

/**
 * Só o PRIMEIRO nome vai para a IA — a mensagem sugerida trata a pessoa por
 * ele, e o sobrenome não acrescenta nada à análise.
 *
 * Lead sem nome vira "Cliente". `montar.ts` usa o telefone (ou o id do
 * Instagram) como nome quando o cadastro não tem nome, e é isso que a TELA
 * deve mostrar — mas mandar o telefone ao provedor como se fosse nome é
 * justamente o que a máscara existe para impedir.
 */
export function nomeParaIA(lead: Pick<Lead, 'contact' | 'phone'>): string {
  const c = (lead.contact || '').trim()
  if (!c || c === (lead.phone || '').trim() || /^Lead \d+$/i.test(c)) return 'Cliente'
  const letras = (c.match(/\p{L}/gu) || []).length
  const digitos = (c.match(/\d/g) || []).length
  if (!letras || digitos > letras) return 'Cliente'
  const primeiro = c.split(/[\s/|,;()]+/)
    .map((p) => p.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .find((p) => /\p{L}/u.test(p))
  return primeiro || 'Cliente'
}

/**
 * A cópia do lead que os prompts usam: primeiro nome e mensagens mascaradas.
 * Datas, horários, quem falou e quantas mensagens — tudo que os motores medem
 * — ficam iguais.
 */
export function leadParaIA(lead: Lead): Lead {
  return {
    ...lead,
    contact: nomeParaIA(lead),
    phone: '',
    messages: (lead.messages || []).map((m) => ({
      ...m,
      phone: '',
      name: '',
      body: mascararDadosPessoais(m.body || ''),
      mediaCaption: mascararDadosPessoais(m.mediaCaption || ''),
      quotedMessage: mascararDadosPessoais(m.quotedMessage || ''),
    })),
  }
}
