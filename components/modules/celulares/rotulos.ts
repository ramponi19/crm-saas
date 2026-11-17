/**
 * OS TEXTOS DE LOJA DE CELULAR que as telas do core (Estoque, Produtos, Compras,
 * PDV, Encomenda, Relatórios) mostram quando o módulo Celulares está ligado.
 *
 * Cada tela tem a sua versão genérica, escrita nela mesma, com o mesmo formato
 * (`typeof ..._CELULAR`). Com o módulo ligado, a tela troca a genérica por esta —
 * e a loja de celular vê exatamente o que via antes.
 */

type ChegadaInfo = { imei: string | null; numero_serie?: string | null }

/** Estoque (lista, entrada e confirmação de chegada). */
export const ESTOQUE_CELULAR = {
  colunaId: 'IMEI',
  /** Máscara do IMEI na lista; sem IMEI, o número de série. */
  idDaUnidade: (u: ChegadaInfo): string =>
    u.imei ? u.imei.slice(0, 3) + ' ' + u.imei.slice(3, 5) + '•••• ' + u.imei.slice(-4) : u.numero_serie ?? '—',
  condicaoSeminovo: 'Seminovo',
  buscaPlaceholder: 'Buscar por produto, marca, IMEI ou número de série…',
  botaoSeminovo: 'Entrada de semi-novo',
  tituloSeminovo: 'Entrada de semi-novo',
  subtituloSeminovo: 'Compra de aparelho usado do cliente — entra disponível para revenda',
  subtituloEntrada: 'Cadastre uma unidade física no estoque por IMEI / número de série',
  okSeminovo: 'Semi-novo adicionado ao estoque',
  chegadaTitulo: 'Confirmar que o aparelho chegou?',
  chegadaSemNome: 'Aparelho',
  chegadaId: (u: ChegadaInfo): string => (u.imei ? ` (IMEI ${u.imei})` : ''),
  chegadaFaltam: (n: number): string => (n === 1 ? 'falta 1 aparelho' : `faltam ${n} aparelhos`),
  chegadaEsteItem: 'este aparelho',
  chegadaEmMaos: ' Confirme apenas com o aparelho em mãos.',
  transferirId: (u: ChegadaInfo): string => (u.imei ? ` · IMEI ${u.imei}` : ''),
  semCadastro: 'Aparelho sem cadastro de produto',
  clienteVendeu: 'Cliente (quem vendeu o aparelho)',
  escolhaProduto: 'Um celular pede IMEI, IMEI 2 e saúde da bateria; um acessório pede código de barras.',
  armazenamento: 'Armazenamento',
  armazenamentoPlaceholder: '256GB',
  fotosAjuda: 'O aparelho de verdade — riscos, marcas de uso, tela ligada. Serve de prova do estado na venda e na garantia.',
  tipoSeminovo: 'Seminovo',
}

/** Cadastro de produto (modelo) e catálogo. */
export const PRODUTO_CELULAR = {
  nomePlaceholder: 'Ex.: iPhone 15 Pro Max',
  coresPlaceholder: 'Ex.: Titânio Preto (Enter p/ adicionar)',
  variantes: 'Armazenamentos',
  variantesPlaceholder: 'Ex.: 256GB (Enter p/ adicionar)',
  variantesAjuda: 'No estoque, ao escolher este modelo, Cor e Armazenamento viram listas com estas opções.',
  categoriaPlaceholder: 'Ex.: Celular, Acessórios, Perfumes',
  /** Trecho da ajuda do "Tipo de item" da categoria. */
  tipoAjuda: 'celular pede IMEI e bateria',
  buscaUnidades: 'Buscar por produto, IMEI ou número de série…',
  precoModeloPlaceholder: 'Ex: iPhone 15 Pro Max',
  precoVariantePlaceholder: 'Ex: 256GB',
}

/** PDV: o produto na vitrine e as sugestões de acessório. */
export const PDV_CELULAR = {
  bateria: (b: string): string => ` · bateria ${b}%`,
  acessorios: ['Kit proteção', 'Película', 'Capinha', 'Fonte', 'Cabo', 'Fone'],
}

/** Compras. */
export const COMPRAS_CELULAR = {
  descricaoPlaceholder: 'Ex: Reposição de estoque smartphones',
}

/** Encomenda (itens e fechamento). */
export const ENCOMENDA_CELULAR = {
  variante: 'Capacidade',
  acessorioPlaceholder: 'Acessório (capa, película, fonte…)',
  /** Unidade de troca sem descrição na observação (pdv/page.tsx, no servidor). */
  trocaSemDescricao: 'Aparelho',
}

/** Relatórios. */
export const RELATORIOS_CELULAR = {
  colunaImei: 'IMEI',
  trocaPendente: 'de um aparelho aceito em troca que ainda não chegou na loja.',
}
