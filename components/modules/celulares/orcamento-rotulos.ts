import { ROTULOS_ORCAMENTO, type RotulosOrcamento } from '@/app/(dashboard)/orcamentos/tipos'

/**
 * O orçamento de uma loja de celular (módulo Celulares e aparelhos, `check_imei`): aparelho e IMEI
 * no lugar de item e nº de série. É o texto que a JM sempre viu; sem o módulo, vale o genérico de
 * app/(dashboard)/orcamentos/tipos.ts.
 */
export const ROTULOS_ORCAMENTO_CELULAR: RotulosOrcamento = {
  item: 'Aparelho',
  serie: 'IMEI / série (opcional)',
  serieCurta: 'IMEI/Série',
  itemNovo: 'Aparelho novo',
  itemNovoExemplo: 'Ex.: iPhone 14 128GB',
  itemEntrada: 'Aparelho do cliente (entrada)',
  itemEntradaExemplo: 'Ex.: iPhone 12 64GB',
  entradaDoCliente: 'seu aparelho',
  entradaValeMais: 'O aparelho do cliente vale',
  itemDoEstoque: 'Aparelho do estoque (baixa ao aprovar)',
  descricaoVenda: 'Descrição do aparelho',
  melhoria: 'Upgrade/melhoria do aparelho',
  unidadeSemProduto: 'Aparelho',
}

/** Os rótulos do orçamento conforme o módulo de celular está ligado ou não. */
export function rotulosOrcamento(celular: boolean): RotulosOrcamento {
  return celular ? ROTULOS_ORCAMENTO_CELULAR : ROTULOS_ORCAMENTO
}
