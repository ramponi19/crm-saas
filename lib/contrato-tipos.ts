// Tipos do contrato + o utilitário de impressão.
//
// NÃO existe contrato padrão no produto, de propósito: o texto é do lojista.
// Se o CRM entregasse um modelo pronto, as cláusulas (garantia, foro, rescisão)
// seriam nossas — e a responsabilidade por um contrato errado também. Loja sem
// modelo simplesmente não emite contrato, e a tela diz onde configurar.

export interface ContratoLoja {
  nome: string
  cnpj: string | null
  telefone: string | null
  logoUrl: string | null
  /**
   * Identificação da VENDEDORA no contrato.
   *
   * O bloco "VENDEDORA" do modelo pede razão social, CNPJ, e-mail, endereço
   * completo e quem assina. Enquanto isso não existia no cadastro, o modelo trazia
   * tudo como texto fixo ("SUA EMPRESA LTDA, CNPJ 11.111.111/1111-11, Rua xxx") e
   * três contratos saíram sem dizer quem vendeu.
   */
  email: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  representanteNome: string | null
  representanteCpf: string | null
  /**
   * Qualificação de quem assina e conta que recebe.
   *
   * Faltavam, e o resultado não foi campo em branco — foi texto fixo esquecido:
   * os contratos de 12/08/2026 saíram com `Banco XXXX` e CPF `111.111.111-11`
   * no lugar do representante, e foram para a mão do cliente assim.
   */
  representanteNacionalidade: string | null
  representanteEstadoCivil: string | null
  representanteProfissao: string | null
  bancoNome: string | null
  bancoAgencia: string | null
  bancoConta: string | null
  bancoPix: string | null
}

export interface ContratoComprador {
  nome: string
  cpf_cnpj: string | null
  nacionalidade: string | null
  estado_civil: string | null
  profissao: string | null
  data_nascimento: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
}

export interface ContratoItem {
  descricao: string
  imei: string | null
  valor: number
  /** Garantia deste produto. Ausente = cai no padrão da loja. */
  garantia_dias?: number | null
}

/**
 * Regra que faz o navegador imprimir o fundo do papel timbrado.
 *
 * Por padrão ele descarta imagem e cor de fundo ao imprimir (economia de tinta),
 * então o contrato saía em branco mesmo aparecendo certo na tela.
 */
const CSS_IMPRIMIR_FUNDO =
  '<style>@media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}@page{size:A4;margin:0}</style>'

/**
 * Imprime um documento JÁ EMITIDO (2ª via): abre exatamente o HTML arquivado no
 * fechamento da venda, sem remontar nada.
 *
 * A única coisa acrescentada é a regra de impressão do fundo. Os contratos
 * emitidos ANTES desta correção têm o CSS antigo gravado dentro deles — e o
 * arquivo não pode ser reescrito, porque é o documento que foi assinado. Então a
 * regra entra na hora de imprimir, sem tocar no que está arquivado.
 */
export function imprimirContratoHTML(html: string): boolean {
  const w = window.open('', '_blank', 'width=860,height=980')
  if (!w) return false
  const pronto = html.includes('print-color-adjust')
    ? html
    : html.replace(/<\/head>/i, `${CSS_IMPRIMIR_FUNDO}</head>`)
  w.document.open()
  w.document.write(pronto)
  w.document.close()
  return true
}
