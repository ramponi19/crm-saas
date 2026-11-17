import type { CamposIdentificacao } from '@/lib/estoque-campos'

/**
 * O tipo de categoria "veículo" (placa, chassi, renavam, km, ano) é do módulo
 * Avaliações (`avaliacoes`). lib/estoque-campos.ts só o oferece com o módulo ligado.
 */
export const CAMPOS_VEICULO: Record<string, Partial<CamposIdentificacao>> = {
  veiculo: { titulo: 'Identificação do veículo', numeroSerie: false, veiculo: true },
}

export const TIPOS_VEICULO: { valor: string; label: string }[] = [
  { valor: 'veiculo', label: 'Veículo' },
]
