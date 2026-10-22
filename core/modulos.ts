import type { ModuloPlano } from '@/lib/plano'

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

  { chave: 'fila', href: '/fila', nome: 'Fila do dia', grupo: 'pipeline',
    frase: 'O que cada vendedor precisa fazer hoje: retornos, tarefas e leads esperando resposta.' },
  { chave: 'gestao_leads', href: '/gestao-leads', nome: 'Gestão de Leads', grupo: 'pipeline',
    frase: 'Mostra o lead que parou — sem resposta, sem próximo passo — e quem precisa cobrar, antes que ele esfrie.' },
  { chave: 'agenda', href: '/agenda', nome: 'Agenda', grupo: 'pipeline', emPreparacao: true,
    frase: 'Visitas e atendimentos marcados num calendário só, com o lead e o responsável de cada horário.' },

  { chave: 'orcamentos', href: '/orcamentos', nome: 'Orçamentos', grupo: 'vendas',
    frase: 'Cotação e orçamento com link de aprovação para o cliente.' },
  { chave: 'propostas', href: '/propostas', nome: 'Propostas', grupo: 'vendas',
    frase: 'Proposta formal com itens, condições e validade, pronta para enviar.' },
  { chave: 'pdv', href: '/pdv', nome: 'PDV', grupo: 'vendas',
    frase: 'Venda no balcão com pagamento, troca, encomenda e contrato.' },
  { chave: 'historico', href: '/historico', nome: 'Histórico de vendas', grupo: 'vendas',
    frase: 'Todas as vendas da loja, com a 2ª via dos documentos emitidos.' },
  { chave: 'simular_parcela', href: '/simular-parcela', nome: 'Simular parcela', grupo: 'vendas',
    frase: 'Quanto fica cada parcela com as taxas da sua maquininha e do link de pagamento.' },
  { chave: 'simular_financiamento', href: '/simular-financiamento', nome: 'Financiamento', grupo: 'vendas', emPreparacao: true,
    frase: 'Simulação de financiamento com entrada, prazo e parcela para mandar ao cliente.' },
  { chave: 'avaliacoes', href: '/avaliacoes', nome: 'Avaliação de veículos', grupo: 'vendas', emPreparacao: true,
    frase: 'Vistoria do veículo na troca, com fotos, avarias e o valor oferecido.' },
  { chave: 'consulta_fipe', href: '/consulta-fipe', nome: 'Consulta FIPE', grupo: 'vendas', emPreparacao: true,
    frase: 'O valor de referência do veículo na tabela FIPE, dentro da avaliação.' },

  { chave: 'estoque', href: '/estoque', nome: 'Estoque', grupo: 'estoque',
    frase: 'As unidades da loja com custo, cor, armazenamento e IMEI.' },
  { chave: 'catalogo', href: '/catalogo', nome: 'Produtos', grupo: 'estoque',
    frase: 'O catálogo de modelos e preços que o PDV e os orçamentos usam.' },
  { chave: 'compras', href: '/compras', nome: 'Compras', grupo: 'estoque',
    frase: 'Pedido de compra ao fornecedor e a entrada da mercadoria no estoque.' },
  { chave: 'check_imei', href: '/check-imei', nome: 'Check IMEI', grupo: 'estoque',
    frase: 'Consulta o IMEI antes de comprar ou vender um aparelho.' },
  { chave: 'imoveis', href: '/imoveis', nome: 'Imóveis', grupo: 'estoque', emPreparacao: true,
    frase: 'A carteira de imóveis com fotos, chaves e proprietários.' },
  { chave: 'cardapio', href: '/cardapio', nome: 'Cardápio', grupo: 'estoque', emPreparacao: true,
    frase: 'O cardápio com preços e o pedido do cliente pelo celular.' },
  { chave: 'kds', href: '/kds', nome: 'Cozinha (KDS)', grupo: 'estoque', emPreparacao: true,
    frase: 'A tela da cozinha com os pedidos na ordem em que entraram.' },

  { chave: 'garantia', href: '/garantia', nome: 'Garantia', grupo: 'posvenda',
    frase: 'O prazo de garantia de cada venda e o aviso do que está vencendo.' },
  { chave: 'assistencia', href: '/assistencia', nome: 'Assistência', grupo: 'posvenda',
    frase: 'Ordem de serviço com status, peças e aviso ao cliente.' },

  { chave: 'relatorios', href: '/relatorios', nome: 'Relatórios', grupo: 'insights', plano: 'bi',
    frase: 'Vendas, conversão e equipe por período, com exportação.' },
  { chave: 'financeiro', href: '/financeiro', nome: 'Financeiro', grupo: 'insights',
    frase: 'Contas a pagar e a receber, com categorias e o caixa do mês.' },
  { chave: 'executivo', href: '/executivo', nome: 'Executivo', grupo: 'insights', emPreparacao: true,
    frase: 'O painel do dono: quanto entrou, quanto ainda vai entrar e quem está produzindo.' },

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

/** O módulo pela chave de empresa_modulos. */
export function moduloPorChave(chave: string): ModuloManifesto | undefined {
  return MODULOS.find((m) => m.chave === chave)
}

/** O módulo pelo endereço (o que `modulo_pedidos.modulo` guarda desde a etapa 0). */
export function moduloPorHref(href: string): ModuloManifesto | undefined {
  return MODULOS.find((m) => m.href === href)
}
