import { CATEGORIAS_SERVICO_CELULAR, ROTULOS_OS_CELULAR } from '@/components/modules/celulares/garantia-rotulos'

/**
 * Os textos da Assistência (17/11/2026, "o core é genérico"): item e nº de série, exemplos neutros.
 * Com o módulo Celulares e aparelhos (`celulares`) ligado, aparelho, IMEI e os exemplos de celular —
 * moram em components/modules/celulares/garantia-rotulos.ts. A coluna `imei_serial` continua.
 */
export const ROTULOS_OS: typeof ROTULOS_OS_CELULAR = {
  item: 'Item',
  serie: 'Nº de série',
  procurandoVenda: 'procurando a venda deste item…',
  semVenda: 'Nenhuma venda desta loja com este nº de série — trate como reparo externo, salvo comprovação.',
  estadoExemplo: 'Ex: Riscos, sem acessórios...',
  servicoExemplo: 'Ex: Revisão completa',
  itemPublico: 'Item',
}

/** Categorias do catálogo de serviços sem o módulo de celular. */
export const CATEGORIAS_SERVICO = ['Diagnóstico', 'Reparo', 'Troca de peça', 'Manutenção', 'Instalação', 'Limpeza', 'Software', 'Outros']

export function rotulosOS(celular: boolean): typeof ROTULOS_OS_CELULAR {
  return celular ? ROTULOS_OS_CELULAR : ROTULOS_OS
}

export function categoriasServico(celular: boolean): string[] {
  return celular ? CATEGORIAS_SERVICO_CELULAR : CATEGORIAS_SERVICO
}
