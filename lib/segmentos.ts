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
  | 'concessionaria'

export interface SegmentoConfig {
  label: string
  descricao: string
  emoji: string
  /** hrefs de módulos escondidos do menu neste segmento (núcleo nunca entra aqui) */
  hiddenHrefs: string[]
  /** renomeia labels de itens do menu: href -> novo label */
  labelOverrides: Record<string, string>
  /**
   * O FUNIL SAIU DAQUI (19/08/2026) — junto com `segmentos_config.funil_seed`.
   *
   * Eram duas listas de etapas que ninguém lia: sete segmentos declaravam o funil
   * aqui, e nenhum ponto do sistema consultava. Quem define as colunas do kanban é
   * `funil_etapas` da empresa e, na falta dela, KANBAN_POR_SEGMENTO em
   * components/modules/leads/types.ts. Config que parece autoridade e não é foi o
   * que fez o dono editar o funil no superadmin e nada acontecer.
   */
  /** módulos EXCLUSIVOS do segmento (fase profunda). icon = nome do ícone lucide. */
  /**
   * Módulos exclusivos do segmento — telas que só ele mostra no menu.
   *
   * `grupo` escolhe onde o item entra (padrão "Operação"). Existe porque o ranking
   * é tela de GESTÃO na imobiliária: cair em Operação, junto de Imóveis e Chaves,
   * esconderia justamente o que o dono procura.
   */
  modulosExtra?: { href: string; label: string; icon: string; grupo?: string }[]

  /**
   * Ordem do menu neste segmento: grupo -> hrefs na sequência desejada.
   *
   * Item listado é TRAZIDO para o grupo, na ordem dada, venha de onde vier; o que
   * não está listado continua onde estava. Existe porque a sequência do menu é a
   * primeira coisa que o dono compara com o sistema que ele já usa — e "Leads" no
   * grupo Comercial, três blocos abaixo do Dashboard, não é a ordem em que ele
   * trabalha.
   *
   * Não tem coluna no banco: é código, então não há override de `segmentos_config`
   * para conferir aqui.
   */
  menuLayout?: Record<string, string[]>

  /**
   * Rótulo do campo "o que o cliente quer comprar", no modal do lead.
   *
   * O núcleo perguntava `segmento === 'concessionaria' ? 'Veículo' : 'Imóvel'` —
   * ou seja, para acrescentar uma vertical era preciso EDITAR o modal do lead, o
   * arquivo mais disputado do projeto. Agora cada segmento declara o seu.
   */
  interesseLabel: string
  /**
   * Como o segmento chama quem vende. Padrão "Vendedor".
   *
   * O ranking e as metas comparam pessoas, e na imobiliária essa pessoa é o
   * CORRETOR — era uma coluna "Vendedor" numa tela que o dono lê como placar da
   * corretagem. Fica aqui, e não numa capacidade booleana, porque é vocabulário:
   * um segmento novo escreve o dele sem tocar em tela nenhuma.
   */
  equipeLabel?: string

  /**
   * Painéis de vertical que aparecem no modal do lead, na ordem.
   *
   * Antes o modal listava `{segmento === 'imobiliaria' && <LeadMatchPanel/>}` uma
   * linha por painel. Com a lista aqui, uma vertical nova só acrescenta o nome
   * dela — o modal não muda. Os nomes válidos estão em PAINEIS_DO_LEAD
   * (components/modules/leads/paineis-vertical.tsx), que é quem conhece os
   * componentes.
   */
  paineisDoLead: PainelDoLead[]

  /**
   * Abas EXTRA em Configurações, além das que todo segmento tem.
   *
   * Substitui uma cascata de quatro `if` na tela. Vazio = só o padrão.
   */
  abasExtraConfiguracoes: { id: string; label: string }[]

  /**
   * CAPACIDADES — o que o segmento FAZ, não quem ele é.
   *
   * Aqui estava a maior parte da dívida: `isVeiculo`, `isFood`, `isSaude`,
   * `isImob` espalhados por PDV, estoque, agenda, dashboard e relatórios. O nome
   * do flag revelava o problema — "é concessionária?" é uma pergunta sobre
   * identidade; "usa placa?" é sobre comportamento, e comportamento é o que a
   * tela precisa saber.
   *
   * Consequência prática: um segmento novo que também venda veículo (locadora,
   * por exemplo) liga `usaPlaca` e funciona. Com `isVeiculo` seria preciso achar
   * e editar cada um dos arquivos.
   */
  capacidades: {
    /** Estoque pede placa, chassi, renavam, km e ano. */
    usaPlaca?: boolean
    /** PDV pede número de comanda (mesa/balcão). */
    usaComanda?: boolean
    /** Agenda fala de consulta/paciente/profissional em vez de visita/corretor. */
    agendaClinica?: boolean
    /** Painel de visitas e agendamento de visita no lead. */
    agendaVisitas?: boolean
    /** Dashboard e Relatórios próprios da vertical. */
    telasProprias?: boolean
    /** Integrações mostram portais e site além dos canais. */
    integraPortais?: boolean
    /**
     * Financeiro ganha a aba de comissão POR NEGÓCIO.
     *
     * Aditivo, não substituto: a imobiliária também paga aluguel e salário, então o
     * livro-caixa e o DRE continuam valendo. O que ela tem a mais é a comissão de
     * cada negócio, dividida entre quem captou e quem vendeu.
     */
    comissaoPorNegocio?: boolean
    /**
     * Cliente é a MESMA pessoa do funil: a ficha mostra etapa, score e corretor.
     *
     * No varejo, cliente é quem já comprou — a lista fala de compras e total gasto.
     * Na imobiliária a mesma tela é o cadastro de quem ainda está decidindo, com
     * status de aprovação e preferências de imóvel. Duas telas diferentes para a
     * palavra "cliente", e a capacidade é o que escolhe qual.
     */
    clienteComPipeline?: boolean
    /**
     * Ranking conta IMÓVEIS captados, além de leads.
     *
     * Onde o corretor traz o produto para a loja vender, captação é do ativo — era o
     * número que o CRM da imobiliária mostrava e o nosso somava errado (contava lead).
     */
    captacaoDeImovel?: boolean
    /** Automações oferecem o bloco de veículos. */
    automacoesVeiculo?: boolean
    /** Match de interesse: por veículo em vez de imóvel. */
    matchVeiculo?: boolean
    /** Rota inicial depois do login, quando não é o dashboard. */
    telaInicial?: string
  }
}

/**
 * Painéis de vertical disponíveis para o modal do lead.
 *
 * É um tipo, e não string livre, de propósito: errar o nome viraria painel que
 * some sem erro nenhum — a pior falha, porque parece funcionar.
 */
export type PainelDoLead = 'match-imoveis' | 'negocio-imovel' | 'interesse-veiculo' | 'financiamento'

export const SEGMENTO_PADRAO: Segmento = 'varejo'

export const SEGMENTOS: Record<Segmento, SegmentoConfig> = {
  varejo: {
    label: 'Varejo / Loja',
    descricao: 'Lojas de produtos: PDV, estoque, catálogo.',
    emoji: '🛍️',
    hiddenHrefs: [],
    labelOverrides: {},
    interesseLabel: 'Produto interessado',
    paineisDoLead: [],
    abasExtraConfiguracoes: [],
    capacidades: {},
  },
  assistencia: {
    label: 'Assistência técnica',
    descricao: 'Oficinas e reparos: ordens de serviço, garantia, IMEI.',
    emoji: '🔧',
    hiddenHrefs: [],
    labelOverrides: {},
    interesseLabel: 'Aparelho / equipamento',
    paineisDoLead: [],
    abasExtraConfiguracoes: [],
    capacidades: {},
  },
  servicos: {
    label: 'Serviços / Prestadores',
    descricao: 'Prestadores: orçamentos e ordens de serviço, sem estoque.',
    emoji: '🧰',
    hiddenHrefs: ['/estoque', '/garantia', '/assistencia', '/simular-parcela', '/compras'],
    labelOverrides: { '/produtos': 'Serviços', '/catalogo': 'Catálogo de serviços' },
    interesseLabel: 'Serviço de interesse',
    paineisDoLead: [],
    abasExtraConfiguracoes: [],
    capacidades: {},
  },
  imobiliaria: {
    label: 'Imobiliária',
    descricao: 'Imóveis, proprietários, captação e visitas.',
    emoji: '🏠',
    // esconde tudo de varejo/assistência; o módulo "Imóveis" chega na fase profunda
    hiddenHrefs: ['/pdv', '/estoque', '/catalogo', '/produtos', '/garantia', '/assistencia', '/simular-parcela', '/compras'],
    /**
     * O vocabulário do dono, não o nosso (decisão dele, 19/08/2026).
     *
     * Ele já opera um CRM em que essas telas se chamam assim; obrigá-lo a aprender
     * outro nome para a mesma coisa é atrito sem ganho. Rótulo é por segmento, então
     * a JM segue com "Leads" e "Conversão".
     *
     * "Meta da empresa" em /metas é desambiguação nossa: como /ranking passa a se
     * chamar "Metas e Ranking", dois itens chamados "Metas" mandariam ele adivinhar
     * qual é qual.
     */
    labelOverrides: {
      '/leads': 'Pipeline',
      /**
       * `/conversao` VOLTOU a se chamar Conversão (20/08/2026).
       *
       * Ela recebeu o nome "Gestão de Leads" para falar a língua do dono, mas no
       * sistema dele essa tela é leads parados + follow-up, e a nossa mostra taxa de
       * conversão por etapa: o menu prometia uma coisa e abria outra. O nome passou
       * para a tela que faz aquilo (`/gestao-leads`).
       */
      '/executivo': 'Dashboard Executivo',
      /* O menu diz "Metas e Ranking"; sem isto a barra do topo da MESMA tela dizia
         "Ranking & Metas" — dois nomes para o mesmo lugar. */
      '/ranking': 'Metas e Ranking',
    },
    // Agenda e Tarefas passaram ao núcleo (grupo "Hoje", todos os segmentos) — ver lib/menu.
    modulosExtra: [
      { href: '/imoveis', label: 'Imóveis', icon: 'Home' },
      { href: '/chaves', label: 'Chaves', icon: 'Key' },
      { href: '/simular-financiamento', label: 'Financiamento', icon: 'Calculator' },
      /**
       * RANKING NO MENU DO TIME — e só aqui.
       *
       * A tela existe desde a Sprint 3.1, mas saiu do menu do CRM a pedido do dono
       * da JM: lá o vendedor não pode ver o faturamento do colega. Na imobiliária a
       * decisão do dono é a oposta (19/08/2026) — placar aberto, porque ranking que o
       * time não vê não gamifica nada. Declarar aqui, e não no catálogo comum, é o que
       * sustenta as duas verdades ao mesmo tempo.
       */
      { href: '/ranking', label: 'Metas e Ranking', icon: 'Trophy', grupo: 'Gestão' },
    ],
    /**
     * Dashboard → Pipeline → Agenda: a sequência que o dono pediu (19/08/2026).
     *
     * É o caminho do dia dele: abre o painel, olha o funil, vê os compromissos.
     * Tarefas e Chat seguem no mesmo grupo, depois.
     */
    menuLayout: { Hoje: ['/dashboard', '/leads', '/agenda', '/tarefas', '/chat'] },
    interesseLabel: 'Imóvel interessado',
    equipeLabel: 'Corretor',
    paineisDoLead: ['negocio-imovel', 'match-imoveis'],
    abasExtraConfiguracoes: [{ id: 'portais', label: 'Portais' }],
    capacidades: { agendaVisitas: true, telasProprias: true, integraPortais: true, comissaoPorNegocio: true, captacaoDeImovel: true, clienteComPipeline: true },
  },
  saude: {
    label: 'Saúde / Clínica',
    descricao: 'Clínicas e consultórios: pacientes e agenda.',
    emoji: '🩺',
    hiddenHrefs: ['/pdv', '/estoque', '/catalogo', '/produtos', '/garantia', '/assistencia', '/simular-parcela', '/compras'],
    labelOverrides: { '/clientes': 'Pacientes' },
    interesseLabel: 'Procedimento / especialidade',
    paineisDoLead: [],
    abasExtraConfiguracoes: [{ id: 'agendamento', label: 'Agendamento' }],
    capacidades: { agendaClinica: true, telaInicial: '/agenda' },
  },
  food: {
    label: 'Food / Restaurante',
    descricao: 'Restaurantes e delivery: cardápio e comandas.',
    emoji: '🍽️',
    hiddenHrefs: ['/garantia', '/assistencia', '/simular-parcela'],
    labelOverrides: {},
    modulosExtra: [
      { href: '/cardapio', label: 'Cardápio', icon: 'UtensilsCrossed' },
    ],
    interesseLabel: 'Item do cardápio',
    paineisDoLead: [],
    abasExtraConfiguracoes: [{ id: 'cardapio', label: 'Cardápio' }],
    capacidades: { usaComanda: true },
  },
  concessionaria: {
    label: 'Loja de veículos',
    descricao: 'Compra e venda de carros e motos (seminovos e 0km): estoque, avaliação de usados, test-drive e F&I.',
    emoji: '🚗',
    // Venda vai por proposta + F&I (não PDV); a "compra" é a avaliação de usados (não o módulo de fornecedores).
    hiddenHrefs: ['/pdv', '/compras', '/simular-parcela'],
    labelOverrides: { '/produtos': 'Veículos', '/assistencia': 'Oficina' },
    modulosExtra: [
      { href: '/avaliacoes', label: 'Avaliações', icon: 'ClipboardCheck' },
      { href: '/consulta-fipe', label: 'Consulta FIPE', icon: 'Car' },
      { href: '/simular-financiamento', label: 'Financiamento', icon: 'Calculator' },
    ],
    interesseLabel: 'Veículo interessado',
    paineisDoLead: ['interesse-veiculo', 'financiamento'],
    abasExtraConfiguracoes: [{ id: 'veiculos-portais', label: 'Portais' }],
    capacidades: { usaPlaca: true, automacoesVeiculo: true, matchVeiculo: true },
  },
}

/** Lista ordenada para o seletor no cadastro. */
export const SEGMENTOS_LISTA: { id: Segmento; config: SegmentoConfig }[] =
  (Object.keys(SEGMENTOS) as Segmento[]).map((id) => ({ id, config: SEGMENTOS[id] }))

/** Normaliza um valor vindo do banco para um Segmento válido. */
export function normalizarSegmento(v: string | null | undefined): Segmento {
  return v && v in SEGMENTOS ? (v as Segmento) : SEGMENTO_PADRAO
}

/**
 * `labelDoItem` e `moduloVisivel` viviam aqui e foram removidos em 19/08/2026:
 * zero chamadas no repositório inteiro.
 *
 * Quem responde essas duas perguntas hoje é `lib/menu.ts`, e por um bom motivo —
 * lá a config do BANCO (`segmentos_config`) sobrepõe a estática, e é a lista
 * `modulos_habilitados` do banco que o middleware usa para liberar rota. Duas
 * funções respondendo a mesma pergunta com outra fonte é como se cria divergência
 * silenciosa entre o menu e o que a rota realmente permite.
 *
 * Os CAMPOS seguem em uso: `lib/menu.ts` lê `hiddenHrefs` e `labelOverrides`
 * daqui como fallback, quando o banco não tem override.
 */

/**
 * Esta tela é módulo PRÓPRIO deste segmento?
 *
 * Serve para a página decidir quem entra usando a MESMA fonte do menu. O ranking é
 * o caso: onde o segmento declara a tela como dele, o time inteiro vê; onde não
 * declara, segue valendo a trava de dono/admin. Sem uma fonte só, esconder do menu
 * e liberar na página (ou o contrário) viraria divergência silenciosa.
 */
export function moduloDoSegmento(segmento: string | null | undefined, href: string): boolean {
  const seg = SEGMENTOS[normalizarSegmento(segmento)]
  return (seg.modulosExtra ?? []).some((m) => m.href === href)
}
