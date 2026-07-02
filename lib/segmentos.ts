/**
 * Segmentação do CRM (camada de config).
 *
 * Um único núcleo de dados (isolado por empresa_id) é apresentado de formas
 * diferentes conforme o `segmento` da empresa: quais módulos aparecem no menu,
 * como o "item" se chama, e as etapas do funil. Verticais podem ganhar módulos
 * PRÓPRIOS na "fase profunda" (ex.: Imóveis na imobiliária).
 *
 * O núcleo (Dashboard, Leads, Clientes, Financeiro, Equipe, Relatórios) está
 * presente em TODOS os segmentos — a lista `hiddenHrefs` só REMOVE o que não faz
 * sentido naquele segmento.
 */

export type Segmento =
  | 'varejo'
  | 'assistencia'
  | 'servicos'
  | 'imobiliaria'
  | 'saude'
  | 'food'

export interface SegmentoConfig {
  label: string
  descricao: string
  emoji: string
  /** hrefs de módulos escondidos do menu neste segmento (núcleo nunca entra aqui) */
  hiddenHrefs: string[]
  /** renomeia labels de itens do menu: href -> novo label */
  labelOverrides: Record<string, string>
  /** etapas padrão do funil de leads (kanban) para o segmento */
  funil: string[]
  /** módulos EXCLUSIVOS do segmento (fase profunda). icon = nome do ícone lucide. */
  modulosExtra?: { href: string; label: string; icon: string }[]
}

export const SEGMENTO_PADRAO: Segmento = 'varejo'

export const SEGMENTOS: Record<Segmento, SegmentoConfig> = {
  varejo: {
    label: 'Varejo / Loja',
    descricao: 'Lojas de produtos: PDV, estoque, catálogo.',
    emoji: '🛍️',
    hiddenHrefs: [],
    labelOverrides: {},
    funil: ['Novo', 'Contato', 'Negociação', 'Fechamento', 'Pós-venda'],
  },
  assistencia: {
    label: 'Assistência técnica',
    descricao: 'Oficinas e reparos: ordens de serviço, garantia, IMEI.',
    emoji: '🔧',
    hiddenHrefs: [],
    labelOverrides: {},
    funil: ['Novo', 'Diagnóstico', 'Orçamento', 'Em reparo', 'Pronto', 'Entregue'],
  },
  servicos: {
    label: 'Serviços / Prestadores',
    descricao: 'Prestadores: orçamentos e ordens de serviço, sem estoque.',
    emoji: '🧰',
    hiddenHrefs: ['/estoque', '/garantia', '/assistencia', '/simular-parcela', '/compras'],
    labelOverrides: { '/produtos': 'Serviços', '/catalogo': 'Catálogo de serviços' },
    funil: ['Novo', 'Contato', 'Orçamento', 'Aprovado', 'Em execução', 'Concluído'],
  },
  imobiliaria: {
    label: 'Imobiliária',
    descricao: 'Imóveis, proprietários, captação e visitas.',
    emoji: '🏠',
    // esconde tudo de varejo/assistência; o módulo "Imóveis" chega na fase profunda
    hiddenHrefs: ['/pdv', '/estoque', '/catalogo', '/produtos', '/garantia', '/assistencia', '/simular-parcela', '/compras'],
    labelOverrides: {},
    funil: ['Lead novo', 'Contato feito', 'Visita agendada', 'Visita realizada', 'Proposta', 'Análise de crédito', 'Fechamento'],
    modulosExtra: [
      { href: '/imoveis', label: 'Imóveis', icon: 'Home' },
      { href: '/proprietarios', label: 'Proprietários', icon: 'KeyRound' },
    ],
  },
  saude: {
    label: 'Saúde / Clínica',
    descricao: 'Clínicas e consultórios: pacientes e agenda.',
    emoji: '🩺',
    hiddenHrefs: ['/pdv', '/estoque', '/catalogo', '/produtos', '/garantia', '/assistencia', '/simular-parcela', '/compras'],
    labelOverrides: { '/clientes': 'Pacientes' },
    funil: ['Novo', 'Contato', 'Consulta agendada', 'Em atendimento', 'Retorno'],
  },
  food: {
    label: 'Food / Restaurante',
    descricao: 'Restaurantes e delivery: cardápio e comandas.',
    emoji: '🍽️',
    hiddenHrefs: ['/garantia', '/assistencia', '/simular-parcela'],
    labelOverrides: { '/produtos': 'Cardápio', '/catalogo': 'Cardápio' },
    funil: ['Novo', 'Contato', 'Pedido', 'Entregue'],
  },
}

/** Lista ordenada para o seletor no cadastro. */
export const SEGMENTOS_LISTA: { id: Segmento; config: SegmentoConfig }[] =
  (Object.keys(SEGMENTOS) as Segmento[]).map((id) => ({ id, config: SEGMENTOS[id] }))

/** Normaliza um valor vindo do banco para um Segmento válido. */
export function normalizarSegmento(v: string | null | undefined): Segmento {
  return v && v in SEGMENTOS ? (v as Segmento) : SEGMENTO_PADRAO
}

/** Resolve o label final de um item de menu conforme o segmento. */
export function labelDoItem(seg: Segmento, href: string, labelPadrao: string): string {
  return SEGMENTOS[seg].labelOverrides[href] ?? labelPadrao
}

/** Diz se um módulo (href) está visível no segmento. */
export function moduloVisivel(seg: Segmento, href: string): boolean {
  return !SEGMENTOS[seg].hiddenHrefs.includes(href)
}
