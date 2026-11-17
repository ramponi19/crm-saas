import { ROTULOS_GARANTIA_CELULAR } from '@/components/modules/celulares/garantia-rotulos'

/**
 * Os textos da Garantia (17/11/2026, "o core é genérico"): nº de série, item, equipamento reserva.
 * Com o módulo Celulares e aparelhos (`check_imei`) ligado, IMEI, aparelho e celular reserva — os
 * textos de celular moram em components/modules/celulares/garantia-rotulos.ts. As colunas do banco
 * (`imei_serial`, `celular_reserva_fornecido`) continuam com o nome de sempre.
 */
export const ROTULOS_GARANTIA: typeof ROTULOS_GARANTIA_CELULAR = {
  serie: 'Nº de série',
  serieNaLista: 'Série',
  estadoExemplo: 'Ex: Riscos, sem acessórios...',
  reserva: 'Equipamento reserva',
  modeloReservaExemplo: 'Modelo emprestado',
  recebidoEmTroca: 'Item recebido em troca',
}

export function rotulosGarantia(celular: boolean): typeof ROTULOS_GARANTIA_CELULAR {
  return celular ? ROTULOS_GARANTIA_CELULAR : ROTULOS_GARANTIA
}
