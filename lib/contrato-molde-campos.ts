// Traduz os campos de um contrato-molde em {{marcadores}}.
//
// Decidir pela FORMA do campo não funciona: num molde real "XXXX" é endereço,
// "XXXXXX" é CEP e "XX" é CPF — todos casam com "vários X". O que distingue é o
// TEXTO ANTES do campo ("CPF sob o n.º ", "CEP ", "na cidade de "), que é
// justamente o que o contrato escreve por extenso.
//
// Mapeia SÓ campos do comprador e da venda. Dado da própria loja (CNPJ, sede,
// representante, banco) fica como texto para o lojista escrever — não cabe ao
// CRM adivinhar o que vai num contrato dele.

export interface Sugestao {
  /** Marcadores que substituem o campo, na ordem. */
  marcadores: string[]
  /** Por que foi reconhecido — aparece na tela para o lojista conferir. */
  motivo: string
}

interface Regra {
  /** Casa com o final do texto que vem ANTES do campo. */
  antes?: RegExp
  /** Casa com o próprio campo. */
  campo?: RegExp
  marcadores: string[]
  motivo: string
}

/** Ordem importa: a primeira que casar vence. Contexto antes de forma. */
const REGRAS: Regra[] = [
  // ---- por contexto (confiável) ----
  { antes: /CPF\s+sob\s+o\s+n[.ºo]*\s*$/i, marcadores: ['cliente.cpf'], motivo: 'vem depois de “CPF sob o n.º”' },
  { antes: /CPF\s*$/i, marcadores: ['cliente.cpf'], motivo: 'vem depois de “CPF”' },
  { antes: /CEP\s*$/i, marcadores: ['cliente.cep'], motivo: 'vem depois de “CEP”' },
  { antes: /na\s+cidade\s+de\s*$/i, marcadores: ['cliente.cidade'], motivo: 'vem depois de “na cidade de”' },
  { antes: /(residente|domiciliad[oa])[^.]*\bna\s+(Rua|Av\.?|Avenida)?\s*$/i, marcadores: ['cliente.endereco'], motivo: 'vem depois de “residente e domiciliado na”' },
  { antes: /valor\s+total\s+de\s*R?\$?\s*$/i, marcadores: ['total', 'total_extenso'], motivo: 'vem depois de “valor total de”' },
  { antes: /(endere[çc]o\s+eletr[ôo]nico|e-?mail)\s*$/i, marcadores: ['cliente.email'], motivo: 'vem depois de “endereço eletrônico”' },
  { antes: /aquisi[çc][ãa]o\s+d[oe]\s*$/i, marcadores: ['produto.nome'], motivo: 'vem depois de “aquisição do”' },

  // ---- pelo próprio texto do molde (também confiável) ----
  { campo: /^nome\s+completo$/i, marcadores: ['cliente.nome'], motivo: 'o molde diz “NOME COMPLETO”' },
  { campo: /^nacionalidade$/i, marcadores: ['cliente.nacionalidade'], motivo: 'o molde diz “nacionalidade”' },
  { campo: /^estado\s+civil$/i, marcadores: ['cliente.estado_civil'], motivo: 'o molde diz “estado civil”' },
  { campo: /^profiss[ãa]o$/i, marcadores: ['cliente.profissao'], motivo: 'o molde diz “profissão”' },
  { campo: /^cidade\s*[–-]\s*estado$/i, marcadores: ['cliente.cidade'], motivo: 'o molde diz “cidade - Estado”' },

  // ---- pela forma, só quando é inequívoca ----
  // "XXXXX – XX" = cidade/UF. Vem antes dos genéricos de X.
  { campo: /^x{3,}\s*[–-]\s*x{2}$/i, marcadores: ['cliente.cidade'], motivo: 'formato de cidade/UF' },
  // "XX.XXX.XX (XXXXXXXX)" = valor + valor por extenso entre parênteses.
  { campo: /^x{1,3}([.,]x{2,3})+\s*\(\s*x{3,}\s*\)$/i, marcadores: ['total', 'total_extenso'], motivo: 'formato de valor com extenso' },
  { campo: /^\d{2,3}\.\d{3}\.\d{3}[-/]\d{2}$/, marcadores: ['cliente.cpf'], motivo: 'formato de CPF' },
  { campo: /^\d{5}-?\d{3}$/, marcadores: ['cliente.cep'], motivo: 'formato de CEP' },
  // Campo que carrega o próprio rótulo, quando vem colado ("CEP xxxxx-xxx").
  { campo: /^cep\s+[\dx]{5}-?[\dx]{3}$/i, marcadores: ['cliente.cep'], motivo: 'o campo já diz “CEP”' },
]

/**
 * Em que parte do contrato o campo está.
 *
 * Importa muito: o molde escreve "CPF sob o número" tanto na qualificação do
 * COMPRADOR quanto na da VENDEDORA (o representante legal da loja). Sem separar,
 * o CPF do dono viraria {{cliente.cpf}} e o contrato sairia com o dado errado —
 * pior do que não mapear. Fora da seção do comprador, nada de `cliente.*`.
 */
export type Secao = 'comprador' | 'vendedora' | null

/** Descobre a seção pelo último título que apareceu no texto. */
export function detectarSecao(textoAcumulado: string, atual: Secao): Secao {
  const t = textoAcumulado.replace(/<[^>]*>/g, '')
  const iComp = t.toUpperCase().lastIndexOf('COMPRADOR')
  const iVend = t.toUpperCase().lastIndexOf('VENDEDORA')
  if (iComp < 0 && iVend < 0) return atual
  return iComp > iVend ? 'comprador' : 'vendedora'
}

const ehDoCliente = (marcadores: string[]) => marcadores.some((m) => m.startsWith('cliente.'))

/**
 * Sugere marcadores para um campo do molde.
 * `antes` = texto que precede o campo. `secao` restringe os campos do cliente.
 * Devolve null quando não dá para reconhecer com segurança — aí fica literal.
 */
export function sugerirCampo(campo: string, antes: string, secao: Secao = 'comprador'): Sugestao | null {
  const limpo = campo.trim().replace(/^[(\s]+|[),.;:\s]+$/g, '')
  if (!limpo) return null
  const contexto = antes.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')

  for (const r of REGRAS) {
    if (r.antes && !r.antes.test(contexto)) continue
    if (r.campo && !r.campo.test(limpo)) continue
    if (!r.antes && !r.campo) continue
    // Dado do cliente só vale na seção do comprador.
    if (ehDoCliente(r.marcadores) && secao !== 'comprador') return null
    return { marcadores: r.marcadores, motivo: r.motivo }
  }
  return null
}

/**
 * O molde encadeia vários campos numa tirada só ("NOME COMPLETO, nacionalidade,
 * estado civil, profissão"), todos em vermelho — o que chega aqui como UM
 * trecho. Quebra por vírgula para reconhecer cada um.
 */
export function partesDoCampo(campo: string): string[] {
  const partes = campo.split(',').map((p) => p.trim()).filter(Boolean)
  return partes.length > 1 ? partes : [campo]
}

/** Como o campo fica no texto: um marcador, ou "{{total}} ({{total_extenso}})". */
export function aplicarSugestao(s: Sugestao): string {
  if (s.marcadores.length === 1) return `{{${s.marcadores[0]}}}`
  const [primeiro, ...resto] = s.marcadores
  return `{{${primeiro}}} (${resto.map((m) => `{{${m}}}`).join(' ')})`
}
