/**
 * Garantia e assistência numa loja de celular (módulo Celulares e aparelhos, `celulares`): IMEI,
 * aparelho, celular reserva. É o texto que a JM sempre viu; sem o módulo, as telas de Garantia e de
 * Assistência usam o genérico delas (nº de série, item, equipamento reserva).
 */
export const ROTULOS_GARANTIA_CELULAR = {
  /** Campo de série no protocolo. */
  serie: 'IMEI / Nº de série',
  /** Prefixo dos 4 últimos dígitos na lista: "· IMEI ··1234". */
  serieNaLista: 'IMEI',
  estadoExemplo: 'Ex: Tela trincada, sem carregador...',
  reserva: 'Celular reserva',
  modeloReservaExemplo: 'Ex: iPhone 11',
  /** Termo de entrega do usado, quando a descrição do item da troca está vazia. */
  recebidoEmTroca: 'Aparelho recebido em troca',
}

export const ROTULOS_OS_CELULAR = {
  item: 'Aparelho',
  serie: 'IMEI / Nº série',
  procurandoVenda: 'procurando a venda deste aparelho…',
  semVenda: 'Nenhuma venda desta loja com este IMEI — trate como reparo externo, salvo comprovação.',
  estadoExemplo: 'Ex: Tela trincada...',
  servicoExemplo: 'Ex: Troca de tela iPhone 13',
  /** Página do orçamento da OS que o cliente abre pelo link. */
  itemPublico: 'Aparelho / item',
}

/**
 * Categorias do catálogo de serviços de reparo de celular. "Microsoldagem" é o reparo na placa do
 * aparelho (o nome antigo da categoria; uma categoria já gravada continua aparecendo no select).
 */
export const CATEGORIAS_SERVICO_CELULAR = ['Tela', 'Bateria', 'Conector de carga', 'Câmera', 'Alto-falante', 'Botão', 'Microsoldagem', 'Software', 'Outros']
