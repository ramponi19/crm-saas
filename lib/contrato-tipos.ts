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
 * Imprime um documento JÁ EMITIDO (2ª via): abre exatamente o HTML arquivado no
 * fechamento da venda, sem remontar nada.
 */
export function imprimirContratoHTML(html: string): boolean {
  const w = window.open('', '_blank', 'width=860,height=980')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
