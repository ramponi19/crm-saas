import type { ModuloPlano } from '@/lib/plano'
import type { CampoPadrao } from '@/core/campos'

/**
 * O MANIFESTO DOS MÓDULOS (core.modulos_manifesto, interface I22 do
 * 04-INTERFACES-E-REGRAS.md) — 22/10/2026, Central de Módulos.
 *
 * Um registro por módulo que o dono pode ver na Central (/modulos): a chave em
 * `empresa_modulos.modulo`, o endereço que ele ocupa no menu e o que ele é, numa
 * frase do balcão. Instalar = linha ativa em `empresa_modulos`; desinstalar = a
 * mesma linha com `ativo = false`. O menu e a trava de rota leem essa camada
 * (lib/empresa-config.ts → `instaladosDoManifesto`), por cima do que já vinha do
 * plano e do superadmin.
 *
 * Arquivo SÓ DE DADOS: o proxy importa (a cada rota), então nada de tela aqui.
 *
 * Fora daqui de propósito:
 *   - o núcleo (Dashboard, Leads, Clientes, Tarefas) e o que veio do /admin
 *     (Insights e Automações): não se instala nem se tira;
 *   - as configurações (/configuracoes/*): parametrizam módulo, não são um.
 *
 * `emPreparacao`: a tela ainda não serve para qualquer empresa. O tile aparece,
 * sem botão de instalar (decisão do Lucas, 22/10/2026: a Agenda, por exemplo,
 * vira módulo único na viagem — ver o 05, Parte 4).
 */

/**
 * Painéis próprios que um módulo põe no card do lead. É um tipo, e não string
 * livre, de propósito: errar o nome viraria painel que some sem erro nenhum. Os
 * componentes estão em components/modules/leads/paineis-vertical.tsx.
 */
export type PainelDoLead = 'match-imoveis' | 'negocio-imovel' | 'interesse-veiculo' | 'financiamento'
  // 17/11/2026: os dois painéis que o card mostrava SEMPRE, fora do manifesto. Reservar exige o
  // Estoque; orçar exige Orçamentos. O card os desenha no lugar de sempre (precisam de mais que o leadId).
  | 'reserva-estoque' | 'orcamento'

/**
 * O QUE UM MÓDULO FAZ NAS TELAS DOS OUTROS (29/10/2026, fim do molde por vertical).
 *
 * Ligado o módulo, a empresa ganha o comportamento; desligado, perde. Até aqui
 * cada vertical declarava estas chaves no molde estático — agora quem as traz é
 * o módulo, e a empresa tem o que os módulos ligados dela trazem.
 */
export interface CapacidadesDoModulo {
  /** Painel de visitas e agendamento de visita no lead. */
  agendaVisitas?: boolean
  /** Dashboard e Relatórios próprios da vertical. */
  telasProprias?: boolean
  /** Integrações mostram portais e site além dos canais. */
  integraPortais?: boolean
  /** Financeiro ganha a aba de comissão por negócio (captador e vendedor). */
  comissaoPorNegocio?: boolean
  /** Cliente é a mesma pessoa do funil: a ficha mostra etapa, score e responsável. */
  clienteComPipeline?: boolean
  /** Ranking conta imóveis captados, além de leads. */
  captacaoDeImovel?: boolean
  /** Automações oferecem o bloco de veículos. */
  automacoesVeiculo?: boolean
  /** Match de interesse por veículo em vez de imóvel. */
  matchVeiculo?: boolean
  /** PDV pede número de comanda (mesa/balcão). */
  usaComanda?: boolean
}

export type GrupoModulo = 'comunicacao' | 'pipeline' | 'vendas' | 'estoque' | 'posvenda' | 'insights' | 'inteligencia'

export interface ModuloManifesto {
  /** A linha em empresa_modulos (`^[a-z][a-z0-9_]*$`). */
  chave: string
  /** O endereço no menu e na trava de rota (o "href" do catálogo do menu). */
  href: string
  nome: string
  /** O que o módulo faz, numa frase. */
  frase: string
  grupo: GrupoModulo
  /** Recurso de plano (lib/plano.ts): sem ele no plano, o tile vira pedido. */
  plano?: ModuloPlano
  /** Contratado à parte (o ZapIntel): sempre por pedido, nunca pelo botão do dono. */
  addon?: boolean
  emPreparacao?: boolean
  /**
   * As chaves dos módulos sem os quais este não funciona (04/11/2026, regra "Como
   * nasce um módulo", ponto 1). Instalar liga junto o que falta (a conta é
   * transitiva: Avaliação → PDV → Estoque); desinstalar um requisito fica
   * bloqueado enquanto um módulo ligado depender dele. Ver lib/modulos-central.ts.
   */
  requer?: string[]
  /**
   * Seções de Configurações que o módulo traz (ids do menu de Configurações):
   * existem quando o módulo está ligado para a empresa. Até 22/10/2026 vinham de
   * uma lista por vertical; agora quem as tem é o módulo.
   */
  abasConfiguracoes?: string[]
  /** O que o módulo liga nas outras telas (ver CapacidadesDoModulo). */
  capacidades?: CapacidadesDoModulo
  /**
   * Tabelas que as telas do módulo assinam pelo realtime (`postgres_changes`). Tirar da
   * publicação `supabase_realtime` o que ninguém usa economiza o decodificador de WAL;
   * por isso ativar o módulo exige a tabela DE VOLTA na publicação, por migração:
   * `alter publication supabase_realtime add table public.<tabela>` (09/11/2026).
   */
  realtime?: string[]
  /** Painéis do card do lead, na ordem. */
  paineisDoLead?: PainelDoLead[]
  /**
   * Tabelas do módulo que NÃO têm o prefixo dele (17/11/2026, scripts/check-segmento-modulo.mjs: toda
   * tabela é do core ou de um módulo). Herança do corte: `vendas_*` do PDV, `avaliacao_*` da troca e da
   * FIPE, `visitas` da Agenda, `pedidos` do Cardápio. Tabela nova nasce com o prefixo e não entra aqui.
   */
  tabelas?: string[]
  /**
   * Campos personalizados que o módulo traz (`modulo_dono` = a chave dele), criados ao
   * instalar (lib/modulos-instalacao.ts) e no cadastro com o módulo no preset. Ficam
   * ocultos com o módulo desligado (card do lead, ficha do cliente).
   */
  campos?: CampoPadrao[]
}

export const GRUPOS_MODULO: { id: GrupoModulo; label: string }[] = [
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'posvenda', label: 'Pós-venda' },
  { id: 'insights', label: 'Insights' },
  { id: 'inteligencia', label: 'Inteligência' },
]

export const MODULOS: ModuloManifesto[] = [
  { chave: 'chat', href: '/chat', nome: 'Chat da equipe', grupo: 'comunicacao',
    frase: 'Conversa interna da equipe, com aviso de mensagem nova no menu.' },
  // Módulo Transmissão (10/11/2026): o filtro da lista é o embrião do módulo Públicos.
  { chave: 'transmissao', href: '/transmissao', tabelas: ['transmissoes'], nome: 'Transmissão', grupo: 'comunicacao',
    frase: 'Manda um modelo aprovado do WhatsApp para uma lista da loja e mostra quem recebeu, leu e respondeu.' },
  // Módulo Públicos (12/11/2026): listas salvas por regra. Não requer nada; o "usar público salvo"
  // da Transmissão e o gatilho "entrou no público" do Automatize só existem com ele ligado.
  { chave: 'publicos', href: '/publicos', tabelas: ['publicos'], nome: 'Públicos', grupo: 'comunicacao',
    frase: 'Listas salvas por regra (funil, etapa, etiqueta, última mensagem) que se atualizam sozinhas, para a Transmissão e o Automatize.' },

  { chave: 'fila', href: '/fila', nome: 'Fila do dia', grupo: 'pipeline',
    frase: 'O que cada vendedor precisa fazer hoje: retornos, tarefas e leads esperando resposta.' },
  { chave: 'gestao_leads', href: '/gestao-leads', nome: 'Gestão de Leads', grupo: 'pipeline',
    frase: 'Mostra o lead que parou — sem resposta, sem próximo passo — e quem precisa cobrar, antes que ele esfrie.' },
  { chave: 'agenda', href: '/agenda', nome: 'Agenda', grupo: 'pipeline', emPreparacao: true, abasConfiguracoes: ['agendamento'],
    frase: 'Visitas e atendimentos marcados num calendário só, com o lead e o responsável de cada horário.' },

  { chave: 'orcamentos', href: '/orcamentos', nome: 'Orçamentos', grupo: 'vendas', paineisDoLead: ['orcamento'],
    frase: 'Cotação e orçamento com link de aprovação para o cliente.' },
  { chave: 'propostas', href: '/propostas', nome: 'Propostas', grupo: 'vendas',
    frase: 'Proposta formal com itens, condições e validade, pronta para enviar.' },
  { chave: 'pdv', href: '/pdv', tabelas: ['vendas_vendas', 'vendas_pagamentos', 'vendas_termos', 'vendas_alertas', 'vendas_pre_vendas', 'vendas_contratos', 'vendas_contrato_modelos', 'vendas_contrato_documentos', 'vendas_comissoes'], nome: 'PDV', grupo: 'vendas', requer: ['estoque'], abasConfiguracoes: ['contrato', 'documentos', 'pagamentos'],
    frase: 'Venda no balcão com pagamento, troca, encomenda e contrato.' },
  { chave: 'historico', href: '/historico', nome: 'Histórico de vendas', grupo: 'vendas', requer: ['pdv'],
    frase: 'Todas as vendas da loja, com a 2ª via dos documentos emitidos.' },
  { chave: 'simular_parcela', href: '/simular-parcela', nome: 'Simular parcela', grupo: 'vendas',
    frase: 'Quanto fica cada parcela com as taxas da sua maquininha e do link de pagamento.' },
  { chave: 'simular_financiamento', href: '/simular-financiamento', nome: 'Financiamento', grupo: 'vendas', emPreparacao: true,
    frase: 'Simulação de financiamento com entrada, prazo e parcela para mandar ao cliente.' },
  { chave: 'avaliacoes', href: '/avaliacoes', nome: 'Avaliação de veículos', grupo: 'vendas', emPreparacao: true, requer: ['pdv'], abasConfiguracoes: ['veiculos-portais'],
    capacidades: { automacoesVeiculo: true, matchVeiculo: true }, paineisDoLead: ['interesse-veiculo', 'financiamento'],
    frase: 'Avaliação do veículo na troca, com fotos, avarias e o valor oferecido.' },
  { chave: 'consulta_fipe', href: '/consulta-fipe', nome: 'Consulta FIPE', grupo: 'vendas', emPreparacao: true,
    frase: 'O valor de referência do veículo na tabela FIPE, dentro da avaliação.' },

  { chave: 'estoque', href: '/estoque', nome: 'Estoque', grupo: 'estoque', paineisDoLead: ['reserva-estoque'],
    frase: 'As unidades de cada produto na loja, com custo, variante, número de série e transferência entre lojas.' },
  { chave: 'catalogo', href: '/catalogo', nome: 'Produtos', grupo: 'estoque', requer: ['estoque'],
    frase: 'O catálogo de modelos e preços que o PDV e os orçamentos usam.' },
  { chave: 'compras', href: '/compras', nome: 'Compras', grupo: 'estoque', requer: ['estoque'],
    frase: 'Pedido de compra ao fornecedor e a entrada da mercadoria no estoque.' },
  // A seção Troca (tolerância da avaliação do aparelho) é de celular: veio de Orçamentos em 17/11/2026.
  { chave: 'celulares', href: '/check-imei', nome: 'Celulares e aparelhos', grupo: 'estoque', requer: ['estoque'], abasConfiguracoes: ['troca'],
    frase: 'Para quem vende celular: IMEI, bateria e armazenamento no estoque, troca de aparelho com cotação e checklist, e a consulta de IMEI.' },
  { chave: 'imoveis', href: '/imoveis', nome: 'Imóveis', grupo: 'estoque', emPreparacao: true, abasConfiguracoes: ['portais'],
    capacidades: { agendaVisitas: true, telasProprias: true, integraPortais: true, comissaoPorNegocio: true, captacaoDeImovel: true, clienteComPipeline: true },
    paineisDoLead: ['negocio-imovel', 'match-imoveis'],
    // O cliente da imobiliária (lib/clientes.ts): sem campo de imóvel no core.
    campos: [
      { entidade: 'contato', chave: 'tipo_negocio', rotulo: 'Tipo de negócio', tipo: 'opcao', opcoes: ['compra', 'locacao', 'captacao', 'investidor', 'lancamento'], ordem: 100 },
      { entidade: 'contato', chave: 'valor_pretendido', rotulo: 'Valor pretendido', tipo: 'moeda', ordem: 110 },
      { entidade: 'contato', chave: 'regiao_interesse', rotulo: 'Região de interesse', tipo: 'texto', ordem: 120 },
      { entidade: 'contato', chave: 'status_aprovacao', rotulo: 'Análise cadastral', tipo: 'opcao', opcoes: ['pendente', 'em_analise', 'aprovado', 'reprovado'], ordem: 130 },
      { entidade: 'contato', chave: 'corretor_id', rotulo: 'Corretor', tipo: 'texto', ordem: 140 },
      { entidade: 'contato', chave: 'proprietario', rotulo: 'Proprietário', tipo: 'booleano', ordem: 150 },
    ],
    frase: 'A carteira de imóveis com fotos, chaves e proprietários.' },
  { chave: 'cardapio', href: '/cardapio', nome: 'Cardápio', grupo: 'estoque', emPreparacao: true, abasConfiguracoes: ['cardapio'],
    capacidades: { usaComanda: true },
    frase: 'O cardápio com preços e o pedido do cliente pelo celular.' },
  // `pedidos` saiu da publicação do realtime em 09/11/2026 (ninguém usava o KDS):
  // ativar o KDS exige pôr de volta (ver `realtime` no ModuloManifesto).
  { chave: 'kds', href: '/kds', nome: 'Cozinha (KDS)', grupo: 'estoque', emPreparacao: true, requer: ['cardapio'], realtime: ['cardapio_pedidos'],
    frase: 'A tela da cozinha com os pedidos na ordem em que entraram.' },

  { chave: 'garantia', href: '/garantia', nome: 'Garantia', grupo: 'posvenda', abasConfiguracoes: ['contrato', 'documentos'],
    frase: 'O prazo de garantia de cada venda e o aviso do que está vencendo.' },
  { chave: 'assistencia', href: '/assistencia', nome: 'Assistência', grupo: 'posvenda', requer: ['estoque'], abasConfiguracoes: ['pagamentos'],
    frase: 'Ordem de serviço com status, peças e aviso ao cliente.' },
  // Módulo Pós-venda (Entrega C, docs/design-pos-venda.md §8.8). Liberado em 24/11/2026 (ok do Lucas), primeiro na JM.
  { chave: 'posvenda', href: '/pos-venda', nome: 'Pós-venda', grupo: 'posvenda', abasConfiguracoes: ['posvenda'],
    frase: 'Acompanha cada venda depois do caixa: régua de contatos, pesquisa de satisfação e chamados, com responsável certo.' },

  { chave: 'relatorios', href: '/relatorios', nome: 'Relatórios', grupo: 'insights', plano: 'bi',
    frase: 'Vendas, conversão e equipe por período, com exportação.' },
  { chave: 'financeiro', href: '/financeiro', nome: 'Financeiro', grupo: 'insights', abasConfiguracoes: ['pagamentos'],
    frase: 'Contas a pagar e a receber, com categorias e o caixa do mês.' },
  { chave: 'executivo', href: '/executivo', nome: 'Executivo', grupo: 'insights', emPreparacao: true, requer: ['imoveis'],
    frase: 'O painel do dono: quanto entrou, quanto ainda vai entrar e quem está produzindo.' },

  // Metas e ranking (17/11/2026): era um "extra" da base de uma empresa, sem dono. Em preparação
  // até a tela servir a qualquer empresa (hoje conta visitas e imóveis captados).
  { chave: 'ranking', href: '/ranking', nome: 'Metas e ranking', grupo: 'insights', emPreparacao: true,
    frase: 'A equipe ordenada pelo que vendeu no mês, com a meta de cada um.' },

  // Rastreamento de origem (17/11/2026, decisão do Lucas): links rastreáveis (/i/<código>), pixel do site
  // (/track.js) e conversão para a Meta. Em preparação até os relatórios de retorno por origem.
  { chave: 'rastreamento', href: '/rastreamento', nome: 'Rastreamento de origem', grupo: 'insights', emPreparacao: true,
    frase: 'Links rastreáveis e o pixel do site: de onde veio cada lead e cada venda.' },

  { chave: 'inteligencia', href: '/zapintel', nome: 'ZapIntel', grupo: 'inteligencia', addon: true,
    frase: 'Lê as conversas do WhatsApp e mostra por que a loja vende e por que perde.' },
]

/**
 * Versão dos módulos de quem acabou de instalar/desinstalar na Central. A rota
 * /api/modulos/instalar grava este cookie com a hora, e o proxy o põe na chave do
 * cache da trava: QUEM mudou vê a rota liberada (ou travada) na hora, em vez de
 * esperar o minuto do cache. Os outros usuários da loja seguem com o minuto.
 */
export const COOKIE_VERSAO_MODULOS = 'nx_mod'

/**
 * OS ENDEREÇOS DOS MÓDULOS EM PREPARAÇÃO (17/11/2026, regra do Matheus "nada solto"):
 * ficam fora do menu, da trava de rota (o proxy mostra a vitrine "em preparação")
 * e das APIs (`exigirModuloLigado` responde desligado), mesmo que a base da empresa,
 * um preset antigo ou o superadmin os tenha ligado. Na Central aparecem só como
 * "em preparação", sem botão. Tirar `emPreparacao` do manifesto é o que libera.
 */
export const HREFS_EM_PREPARACAO: ReadonlySet<string> = new Set(MODULOS.filter((m) => m.emPreparacao).map((m) => m.href))

/** Todas as seções de Configurações que pertencem a algum módulo. */
export const ABAS_DE_MODULO: string[] = [...new Set(MODULOS.flatMap((m) => m.abasConfiguracoes ?? []))]

/** As seções de Configurações dos módulos ligados (`ligados` = endereços, como no menu). */
export function abasDosModulos(ligados: Set<string>): string[] {
  // Uma seção pode vir de mais de um módulo (Meios de pagamento: PDV, Assistência, Financeiro).
  return [...new Set(MODULOS.filter((m) => ligados.has(m.href)).flatMap((m) => m.abasConfiguracoes ?? []))]
}

/** O que os módulos ligados trazem, somado (`ligados` = endereços, como no menu). */
export function capacidadesDosModulos(ligados: Set<string>): CapacidadesDoModulo {
  return Object.assign({}, ...MODULOS.filter((m) => ligados.has(m.href)).map((m) => m.capacidades ?? {}))
}

/** Os painéis do card do lead dos módulos ligados, na ordem do manifesto. */
export function paineisDosModulos(ligados: Set<string>): PainelDoLead[] {
  return MODULOS.filter((m) => ligados.has(m.href)).flatMap((m) => m.paineisDoLead ?? [])
}

/** O módulo pela chave de empresa_modulos. */
export function moduloPorChave(chave: string): ModuloManifesto | undefined {
  return MODULOS.find((m) => m.chave === chave)
}

/** O módulo pelo endereço (o que `modulo_pedidos.modulo` guarda desde a etapa 0). */
export function moduloPorHref(href: string): ModuloManifesto | undefined {
  return MODULOS.find((m) => m.href === href)
}
