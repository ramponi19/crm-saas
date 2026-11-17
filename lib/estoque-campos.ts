import { CAMPOS_CELULAR, TIPOS_CELULAR } from '@/components/modules/celulares/estoque-campos'
import { CAMPOS_VEICULO, TIPOS_VEICULO } from '@/components/modules/veiculos/estoque-campos'

/**
 * Quais campos de identificação a entrada de estoque mostra, por tipo de item.
 *
 * Quem decide é a CATEGORIA do produto (`categorias_produtos.tipo_formulario`),
 * não o tipo de negócio da empresa. A diferença importa: uma loja de celular vende
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

/** Os tipos do core: valem para qualquer empresa. */
const POR_TIPO: Record<string, Partial<CamposIdentificacao>> = {
  acessorio: { titulo: 'Identificação', rotuloSerie: 'Código de barras / SKU', semSerie: true },
  perfume:   { titulo: 'Identificação', rotuloSerie: 'Código de barras / SKU', semSerie: true, cor: false },
  outro:     { titulo: 'Identificação', rotuloSerie: 'Código de barras / SKU', semSerie: true },
}

/**
 * Os módulos que trazem tipos próprios. Celulares (celular, tablet, notebook,
 * smartwatch — IMEI, bateria, armazenamento, número de modelo Apple) e Avaliações
 * (veículo — placa, chassi). Desligado, o tipo do módulo não existe: categoria
 * antiga com esse tipo cai no genérico.
 */
export interface ModulosDoEstoque {
  /** Módulo Celulares (`/check-imei`) ligado. */
  celulares?: boolean
  /** Módulo Avaliações (`/avaliacoes`) ligado E a empresa usa placa no item. */
  veiculos?: boolean
}

function porTipo(modulos: ModulosDoEstoque): Record<string, Partial<CamposIdentificacao>> {
  return {
    ...(modulos.celulares ? CAMPOS_CELULAR : {}),
    ...(modulos.veiculos ? CAMPOS_VEICULO : {}),
    ...POR_TIPO,
  }
}

/**
 * Campos para um `tipo_formulario`. Tipo desconhecido, categoria sem tipo ou tipo
 * de módulo desligado cai no genérico (série + cor) — nunca some campo por falta
 * de configuração, que seria pior: o operador não teria onde registrar o que tem
 * em mãos.
 */
export function camposDaCategoria(tipo: string | null | undefined, modulos: ModulosDoEstoque = {}): CamposIdentificacao {
  const chave = (tipo ?? '').trim().toLowerCase()
  return { ...BASE, ...(porTipo(modulos)[chave] ?? {}) }
}

const TIPOS_CORE: { valor: string; label: string }[] = [
  { valor: 'acessorio', label: 'Acessório' },
  { valor: 'perfume', label: 'Perfumaria / cosmético' },
  { valor: 'outro', label: 'Outro (sem número de série)' },
]

/** Tipos conhecidos, para o cadastro de categoria oferecer a lista certa. */
export function tiposFormulario(modulos: ModulosDoEstoque = {}): { valor: string; label: string }[] {
  return [
    ...(modulos.celulares ? TIPOS_CELULAR : []),
    ...(modulos.veiculos ? TIPOS_VEICULO : []),
    ...TIPOS_CORE,
  ]
}
