/**
 * Textos de VEÍCULO que o Estoque do core mostra quando a empresa trabalha com
 * veículo: módulo Avaliações (`/avaliacoes`) ligado E o campo `placa` no item
 * (capacidade criada pelo preset). As duas condições vêm da página, no servidor.
 */

type UnidadeVeiculo = { placa: string | null; chassi: string | null }

export const ESTOQUE_VEICULO = {
  colunaId: 'Placa',
  idDaUnidade: (u: UnidadeVeiculo): string =>
    u.placa ? u.placa.toUpperCase() : (u.chassi ? `chassi ${u.chassi.slice(-6)}` : '—'),
  colunaProduto: 'Veículo',
  buscaPlaceholder: 'Buscar por modelo, marca, placa ou chassi…',
  botaoEntrada: 'Adicionar veículo',
  tituloEntrada: 'Novo veículo no estoque',
  subtituloEntrada: 'Cadastre um veículo no estoque por placa / chassi',
  modalNovo: 'Adicionar veículo',
  modalEditar: 'Editar veículo',
}

/** Trecho da ajuda do "Tipo de item" da categoria (Produtos). */
export const CATEGORIA_VEICULO = {
  tipoAjuda: 'veículo pede placa e chassi',
}
