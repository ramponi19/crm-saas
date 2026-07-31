// Renderiza o MODELO DA EMPRESA (contrato_modelos) com os dados da venda.
//
// O modelo e uma lista de paginas A4; cada uma tem uma imagem de fundo opcional
// e um bloco de texto com marcadores. O resultado e o documento final, que o
// emitirContrato arquiva em contratos_venda.html — e a 2a via so reimprime.

import { valorPorExtenso } from './contrato-extenso'
import type { ContratoItem, ContratoComprador, ContratoLoja } from './contrato-tipos'

/**
 * Um bloco de texto posicionado na página, em PORCENTAGEM (escala com o papel).
 *
 * A geometria existe por causa das figuras: quando a página tem uma foto de
 * produto à direita, o texto vive numa coluna estreita à esquerda. Uma caixa
 * única de página inteira faria o texto atravessar a imagem assim que um dado
 * mais longo refluísse as linhas.
 */
export interface BlocoTexto {
  /** Canto superior esquerdo, em % da largura/altura da página. */
  x: number
  y: number
  /** Largura em % — é ela que define onde a linha quebra. */
  largura: number
  /** HTML do texto, com {{marcadores}}. */
  texto_html: string
}

export interface PaginaModelo {
  ordem: number
  /** URL publica do fundo no Storage. Vazio = pagina sem fundo (branca). */
  fundo_url: string | null
  /** Fundo escuro → texto claro. */
  escuro: boolean
  /** Blocos de texto posicionados. Página só de capa vem com lista vazia. */
  blocos?: BlocoTexto[]
  /**
   * Modelo salvo antes dos blocos: um texto único ocupando a página com margem
   * padrão. Mantido para não quebrar quem já salvou — `blocosDaPagina` converte.
   */
  texto_html?: string
}

/** Margem padrão (em %) do bloco herdado de um modelo sem geometria. */
const MARGEM_LEGADO = { x: 9, y: 7, largura: 82 }

/** Blocos da página, convertendo o formato antigo quando for o caso. */
export function blocosDaPagina(p: PaginaModelo): BlocoTexto[] {
  if (p.blocos?.length) return p.blocos
  if (p.texto_html?.trim()) {
    return [{ ...MARGEM_LEGADO, texto_html: p.texto_html }]
  }
  return []
}

export interface ModeloContrato {
  id: number
  versao: number
  paginas: PaginaModelo[]
}

export interface DadosMescla {
  loja: ContratoLoja
  comprador: ContratoComprador
  itens: ContratoItem[]
  total: number
  desconto?: number
  forma_pagamento: string | null
  parcelas?: number | null
  garantia_dias: number
  vendedor?: string | null
  data?: string
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

const PGTO: Record<string, string> = {
  dinheiro: 'dinheiro', pix: 'PIX', debito: 'cartão de débito', credito: 'cartão de crédito',
  link: 'link de pagamento', boleto: 'boleto', crediario: 'crediário',
}

function dataExtenso(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

function enderecoLinha(c: ContratoComprador): string {
  const l1 = [c.endereco, c.numero].filter(Boolean).join(', ')
  const l2 = [c.complemento, c.bairro].filter(Boolean).join(' — ')
  return [l1, l2].filter((s) => s && s.trim()).join(', ')
}

/** Tabela dos itens — usada pelo marcador {{itens}}. */
function tabelaItens(itens: ContratoItem[], garantiaPadrao: number): string {
  const validos = itens.filter((i) => i.descricao?.trim())
  const gar = (i: ContratoItem) => i.garantia_dias ?? garantiaPadrao
  const variam = new Set(validos.map(gar)).size > 1
  const linhas = validos.map((i) => `<tr>
      <td>${esc(i.descricao)}</td>
      <td style="text-align:right">${i.imei ? esc(i.imei) : '—'}</td>
      ${variam ? `<td style="text-align:right">${gar(i)} dias</td>` : ''}
      <td style="text-align:right">${brl(i.valor)}</td>
    </tr>`).join('')
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0">
    <thead><tr>
      <th style="text-align:left;border-bottom:1px solid currentColor;padding:4px 6px">Produto</th>
      <th style="text-align:right;border-bottom:1px solid currentColor;padding:4px 6px">IMEI / Nº série</th>
      ${variam ? '<th style="text-align:right;border-bottom:1px solid currentColor;padding:4px 6px">Garantia</th>' : ''}
      <th style="text-align:right;border-bottom:1px solid currentColor;padding:4px 6px">Valor</th>
    </tr></thead>
    <tbody>${linhas || `<tr><td colspan="${variam ? 4 : 3}">—</td></tr>`}</tbody>
  </table>`
}

/**
 * Catalogo de marcadores. Chave = o que a empresa escreve no modelo.
 * A ordem importa na substituicao: chaves mais longas primeiro, senao
 * {{total}} comeria o inicio de {{total_extenso}}.
 */
export function marcadores(d: DadosMescla): Record<string, string> {
  const c = d.comprador
  const itensDesc = d.itens.filter((i) => i.descricao?.trim()).map((i) => i.descricao)
  const pgto = PGTO[d.forma_pagamento ?? ''] ?? (d.forma_pagamento ?? '—')
  const parcelaTxt = d.parcelas && d.parcelas > 1 ? ` em ${d.parcelas}x` : ''
  return {
    'loja.nome': esc(d.loja.nome),
    'loja.cnpj': esc(d.loja.cnpj ?? ''),
    'loja.telefone': esc(d.loja.telefone ?? ''),
    'cliente.nome': esc(c.nome),
    'cliente.cpf': esc(c.cpf_cnpj ?? ''),
    'cliente.nacionalidade': esc(c.nacionalidade ?? 'brasileiro(a)'),
    'cliente.estado_civil': esc(c.estado_civil ?? ''),
    'cliente.profissao': esc(c.profissao ?? ''),
    'cliente.telefone': esc(c.telefone ?? ''),
    'cliente.email': '',
    'cliente.endereco': esc(enderecoLinha(c)),
    'cliente.cidade': esc([c.cidade, c.estado].filter(Boolean).join('/')),
    'cliente.cep': esc(c.cep ?? ''),
    'produto.nome': esc(itensDesc.join(', ')),
    'produto.cor': '',
    'itens': tabelaItens(d.itens, d.garantia_dias),
    'total': brl(d.total),
    'total_extenso': valorPorExtenso(d.total),
    'desconto': brl(d.desconto ?? 0),
    'pagamento': esc(pgto + parcelaTxt),
    'parcelas': String(d.parcelas ?? 1),
    'garantia_dias': String(d.garantia_dias),
    'vendedor': esc(d.vendedor ?? ''),
    'data_extenso': dataExtenso(d.data),
  }
}

/** Lista para a tela do /admin mostrar o que existe para inserir. */
export const MARCADORES_DISPONIVEIS: { chave: string; rotulo: string }[] = [
  { chave: 'cliente.nome', rotulo: 'Nome do cliente' },
  { chave: 'cliente.cpf', rotulo: 'CPF / CNPJ' },
  { chave: 'cliente.nacionalidade', rotulo: 'Nacionalidade' },
  { chave: 'cliente.estado_civil', rotulo: 'Estado civil' },
  { chave: 'cliente.profissao', rotulo: 'Profissão' },
  { chave: 'cliente.telefone', rotulo: 'Telefone' },
  { chave: 'cliente.endereco', rotulo: 'Endereço' },
  { chave: 'cliente.cidade', rotulo: 'Cidade/UF' },
  { chave: 'cliente.cep', rotulo: 'CEP' },
  { chave: 'produto.nome', rotulo: 'Produto(s) vendido(s)' },
  { chave: 'itens', rotulo: 'Tabela de itens (produto, IMEI, valor)' },
  { chave: 'total', rotulo: 'Valor total (R$)' },
  { chave: 'total_extenso', rotulo: 'Valor total por extenso' },
  { chave: 'desconto', rotulo: 'Desconto' },
  { chave: 'pagamento', rotulo: 'Forma de pagamento' },
  { chave: 'garantia_dias', rotulo: 'Garantia (dias)' },
  { chave: 'vendedor', rotulo: 'Vendedor' },
  { chave: 'data_extenso', rotulo: 'Data por extenso' },
  { chave: 'loja.nome', rotulo: 'Nome da loja' },
  { chave: 'loja.cnpj', rotulo: 'CNPJ da loja' },
]

/**
 * Troca os {{marcadores}} pelos valores.
 *
 * A busca ignora maiúsculas: quem escreve o modelo é o lojista, e
 * {{Cliente.Nome}} ou {{CLIENTE.NOME}} têm de funcionar igual. Sem isso o
 * marcador viraria string vazia e o dado desapareceria do contrato sem avisar.
 * Marcador realmente inexistente sai vazio.
 */
export function mesclar(texto: string, valores: Record<string, string>): string {
  const porMinuscula = new Map(Object.entries(valores).map(([k, v]) => [k.toLowerCase(), v]))
  return texto.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, chave: string) =>
    porMinuscula.get(chave.toLowerCase()) ?? '')
}

const CSS_PAGINA = `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#777}
  .page{position:relative;width:794px;height:1123px;margin:0 auto 12px;overflow:hidden;
    background-size:cover;background-position:center top;background-repeat:no-repeat;
    background-color:#fff;page-break-after:always}
  .page:last-child{margin-bottom:0}
  .bl{position:absolute;font-size:10pt;line-height:1.6;color:#000;text-align:justify}
  .dk .bl{color:#e8e8e8}
  .dk .bl strong{color:#fff}
  p{margin-bottom:10pt}
  .cl{font-weight:bold;margin-top:15pt;margin-bottom:8pt;font-size:11pt}
  .i1{padding-left:0}
  .i2{padding-left:24pt}
  .var{color:#c0392b}
  .dk .var{color:#ff8a75}
  th,td{font-size:9.5pt}
  .aviso{position:absolute;top:8px;left:70px;right:70px;z-index:2;border:1px solid #f59e0b;
    background:#fffbeb;color:#92400e;border-radius:6px;padding:6px 9px;font-size:9pt}
  @media print{body{background:none}.page{margin:0;width:210mm;height:297mm}}
`

/**
 * Documento final a partir do modelo da empresa.
 * `reconstituido` imprime o aviso de que a folha foi remontada.
 */
export function renderizarModelo(
  modelo: ModeloContrato,
  dados: DadosMescla,
  opts: { reconstituido?: boolean } = {},
): string {
  const valores = marcadores(dados)
  const paginas = [...modelo.paginas].sort((a, b) => a.ordem - b.ordem)

  const corpo = paginas.map((p, i) => {
    const fundo = p.fundo_url ? `background-image:url('${p.fundo_url}')` : ''
    const texto = blocosDaPagina(p).map((b) =>
      `<div class="bl" style="left:${b.x}%;top:${b.y}%;width:${b.largura}%">${mesclar(b.texto_html, valores)}</div>`,
    ).join('')
    const aviso = i === 0 && opts.reconstituido
      ? '<div class="aviso"><b>Documento reconstituído.</b> Remontado a partir do cadastro atual — pode divergir do contrato assinado.</div>'
      : ''
    return `<div class="page${p.escuro ? ' dk' : ''}" style="${fundo}">${aviso}${texto}</div>`
  }).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Contrato de compra e venda</title><style>${CSS_PAGINA}</style></head>
<body>${corpo}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body></html>`
}
