/**
 * Quais campos de identificação a entrada de estoque mostra, por tipo de item.
 *
 * Quem decide é a CATEGORIA do produto (`categorias_produtos.tipo_formulario`),
 * não o segmento da empresa. A diferença importa: uma loja de celular vende
 * capinha, e pedir IMEI e saúde de bateria para uma capinha é o mesmo erro que
 * pedir placa e chassi. Como as categorias são por empresa, cada tenant define as
 * suas e o formulário se adapta sem código novo.
 *
 * A coluna `tipo_formulario` já existia no banco, com valores criados e nunca
 * lidos por nenhuma linha de código. Isto aqui é o que faltava para ligá-la.
 *
 * O núcleo (produto, preços, fornecedor, condição, status, fotos, observações)
 * NÃO está aqui: aparece sempre, em qualquer tipo.
 */

export interface CamposIdentificacao {
  /** Rótulo do bloco na tela. */
  titulo: string
  imei: boolean
  /** Segundo IMEI — só faz sentido em aparelho dual-SIM. */
  imei2: boolean
  numeroSerie: boolean
  /** Rótulo do número de série: em item sem série, é o código de barras/SKU. */
  rotuloSerie: string
  bateria: boolean
  cor: boolean
  armazenamento: boolean
  /** Número de modelo da Apple (A####) — preenche modelo, cor e capacidade. */
  numeroModeloApple: boolean
  /** Veículo: placa, chassi, renavam, km, ano. */
  veiculo: boolean
  /**
   * Item que não tem identidade por peça (capinha, película, perfume). Entra em
   * quantidade, não um cadastro por unidade — ver etapa 2.
   */
  semSerie: boolean
}

const BASE: CamposIdentificacao = {
  titulo: 'Identificação',
  imei: false, imei2: false, numeroSerie: true, rotuloSerie: 'Número de série',
  bateria: false, cor: true, armazenamento: false,
  numeroModeloApple: false, veiculo: false, semSerie: false,
}

const POR_TIPO: Record<string, Partial<CamposIdentificacao>> = {
  celular: {
    titulo: 'Identificação do aparelho',
    imei: true, imei2: true, bateria: true, armazenamento: true, numeroModeloApple: true,
  },
  // Tablet e notebook com celular também têm IMEI, mas a maioria não — deixo o
  // campo fora e quem precisar usa a observação. Melhor faltar um campo raro do
  // que pedir IMEI para todo MacBook que entra.
  tablet:     { titulo: 'Identificação do tablet',   bateria: true, armazenamento: true, numeroModeloApple: true },
  notebook:   { titulo: 'Identificação do notebook', bateria: true, armazenamento: true, numeroModeloApple: true },
  smartwatch: { titulo: 'Identificação do relógio',  bateria: true, armazenamento: true, numeroModeloApple: true },

  acessorio: { titulo: 'Identificação', rotuloSerie: 'Código de barras / SKU', semSerie: true },
  perfume:   { titulo: 'Identificação', rotuloSerie: 'Código de barras / SKU', semSerie: true, cor: false },
  outro:     { titulo: 'Identificação', rotuloSerie: 'Código de barras / SKU', semSerie: true },

  veiculo: { titulo: 'Identificação do veículo', numeroSerie: false, veiculo: true },
}

/**
 * Campos para um `tipo_formulario`. Tipo desconhecido ou categoria sem tipo cai
 * no genérico (série + cor) — nunca some campo por falta de configuração, que
 * seria pior: o operador não teria onde registrar o que tem em mãos.
 */
export function camposDaCategoria(tipo: string | null | undefined): CamposIdentificacao {
  const chave = (tipo ?? '').trim().toLowerCase()
  return { ...BASE, ...(POR_TIPO[chave] ?? {}) }
}

/** Tipos conhecidos, para o cadastro de categoria oferecer a lista certa. */
export const TIPOS_FORMULARIO: { valor: string; label: string }[] = [
  { valor: 'celular', label: 'Celular / Smartphone' },
  { valor: 'tablet', label: 'Tablet' },
  { valor: 'notebook', label: 'Notebook' },
  { valor: 'smartwatch', label: 'Smartwatch' },
  { valor: 'veiculo', label: 'Veículo' },
  { valor: 'acessorio', label: 'Acessório' },
  { valor: 'perfume', label: 'Perfumaria / cosmético' },
  { valor: 'outro', label: 'Outro (sem número de série)' },
]
