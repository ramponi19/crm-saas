/**
 * data.ts — todo o conteúdo da landing num lugar só (copy, mock do hero,
 * planos, módulos, comparativo, FAQ). As seções em `sections/` só renderizam isto.
 *
 * Regra (18/11/2026, plano único + módulos): a landing só promete o que existe.
 * O que vem no plano é o núcleo; o resto é "módulo extra, na Central" — conferir
 * contra core/modulos.ts (`emPreparacao` não entra; `addon` é contratado à parte).
 *
 * Cores hex aqui são data-driven (dots do funil do mock), como no mock aprovado.
 */

/* ------------------------------------------------------------------ */
/*  Mock do hero — um exemplo genérico (sem cliente real)              */
/* ------------------------------------------------------------------ */

export type Tone = 'ok' | 'warn' | 'ink3'
export type FunilCol = { name: string; dot: string; leads: [string, string][] }
export type MockProduto = {
  empresa: string
  inicial: string
  usuario: string
  url: string
  k1: { label: string; value: string; sub: string; tone: Tone }
  k2: { value: string; sub: string }
  k3: { label: string; value: string; sub: string; tone: Tone }
  funil: string
  cols: FunilCol[]
}

export const MOCK: MockProduto = {
  empresa: 'Sua empresa', inicial: 'S', usuario: 'Camila',
  url: 'app.usenexus.com.br/dashboard',
  k1: { label: 'Vendas no mês', value: 'R$ 48.250', sub: '+12,4% vs mês anterior', tone: 'ok' },
  k2: { value: '14', sub: '6 aguardando resposta' },
  k3: { label: 'Tarefas hoje', value: '9', sub: '2 vencem às 18h', tone: 'warn' },
  funil: 'Funil de vendas — julho',
  cols: [
    { name: 'Novo', dot: '#9199A3', leads: [['Larissa M.', 'Orçamento · Instagram'], ['Cauã R.', 'Dúvida · WhatsApp']] },
    { name: 'Em contato', dot: '#5C6470', leads: [['Douglas P.', 'Retorno amanhã · Messenger']] },
    { name: 'Negociação', dot: '#2E5CE6', leads: [['Vanessa T.', 'Proposta · R$ 7.900']] },
    { name: 'Fechamento', dot: '#B45309', leads: [['Igor S.', 'Aguardando pagamento']] },
    { name: 'Convertido', dot: '#188A54', leads: [['Ana Paula', 'Pedido · R$ 1.250']] },
  ],
}

/* ------------------------------------------------------------------ */
/*  Como funciona — os três passos da seção clara                      */
/* ------------------------------------------------------------------ */

export const PASSOS: { n: string; title: string; desc: string; detalhe: string }[] = [
  { n: '1', title: 'Crie a conta', desc: '14 dias grátis, sem cartão. A conta fica pronta na hora e você já entra no sistema.', detalhe: 'Teste completo do plano' },
  { n: '2', title: 'Conecte os canais', desc: 'O WhatsApp oficial, o Instagram e o Messenger entram numa caixa de entrada só, a Comunicação.', detalhe: 'WhatsApp · Instagram · Messenger' },
  { n: '3', title: 'Venda com processo', desc: 'Ajuste as etapas, convide a equipe e deixe as automações cuidarem do próximo passo.', detalhe: 'Funil → tarefas → automações' },
]

/* ------------------------------------------------------------------ */
/*  Plano                                                              */
/* ------------------------------------------------------------------ */

/** Formato serializável de um plano vindo do servidor (planos_config). */
export type PlanData = {
  id: string
  name: string
  priceCents: number
  tagline: string
  features: string[]
  featured: boolean
}

/**
 * Fallback caso o banco não responda — o plano único (id 'base' em planos_config).
 * O preço de verdade vem do banco; este é o provisório.
 */
export const FALLBACK_PLAN: PlanData = {
  id: 'base', name: 'Nexus', priceCents: 19700, featured: true,
  tagline: 'Tudo para vender pelo WhatsApp e pelo Instagram.',
  features: [
    '3 usuários',
    '1 número de WhatsApp com Instagram e Messenger',
    '2 lojas',
    'Funil de vendas',
    'Comunicação',
    'Tarefas',
    'Automatize',
    'Etiquetas',
  ],
}

/** As duas linhas que todo card de plano mostra, venha ele do banco ou do fallback. */
export const PLANO_TESTE = '14 dias grátis, sem cartão'
export const PLANO_EXTRAS = 'Módulos extras na Central'

export const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/* ------------------------------------------------------------------ */
/*  Módulos (bento) — `extra`: módulo da Central, fora do plano        */
/* ------------------------------------------------------------------ */

export type ModuleCard = { key: string; title: string; desc: string; span: string; extra?: boolean }
export const MODULES: ModuleCard[] = [
  { key: 'atendimento', title: 'Comunicação', desc: 'WhatsApp oficial, Instagram e Messenger num só painel — cada conversa vira lead com dono e próximo passo.', span: 'lg:col-span-7' },
  { key: 'funil', title: 'Funil de vendas', desc: 'Kanban com as suas etapas, motivo de perda obrigatório e prazo de resposta em cada card.', span: 'lg:col-span-5' },
  { key: 'automacao', title: 'Automatize', desc: 'Entrou na etapa, recebeu etiqueta: manda o modelo, cria a tarefa ou avisa o gestor.', span: 'lg:col-span-4' },
  { key: 'tarefas', title: 'Tarefas', desc: 'Retornos com prazo e responsável — ninguém esquece um lead.', span: 'lg:col-span-4' },
  { key: 'estoque', title: 'Estoque & PDV', desc: 'Balcão com caixa e estoque em tempo real. Módulo extra, na Central.', span: 'lg:col-span-4', extra: true },
  { key: 'relatorios', title: 'Conversão e metas', desc: 'Passagem entre etapas, tempo de 1º contato por vendedor e forecast do funil ponderado por etapa.', span: 'lg:col-span-7' },
  { key: 'financeiro', title: 'Financeiro', desc: 'A pagar, a receber e o caixa do mês. Módulo extra, na Central.', span: 'lg:col-span-5', extra: true },
]

/* ------------------------------------------------------------------ */
/*  Comparativo honesto                                                */
/* ------------------------------------------------------------------ */

export type CompareVal = boolean | 'meio'
export const COMPARE: { label: string; nexus: CompareVal; planilha: CompareVal; generico: CompareVal }[] = [
  { label: 'Funil, conversas e tarefas num lugar só', nexus: true, planilha: false, generico: 'meio' },
  { label: 'WhatsApp oficial integrado', nexus: true, planilha: false, generico: false },
  { label: 'Instagram e Messenger na mesma caixa de entrada', nexus: true, planilha: false, generico: 'meio' },
  { label: 'Automações por etapa e etiqueta', nexus: true, planilha: false, generico: 'meio' },
  { label: 'Módulos extras só quando precisar', nexus: true, planilha: false, generico: 'meio' },
  { label: 'Preço em Real, suporte em português', nexus: true, planilha: true, generico: false },
]

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

export const FAQ = [
  { q: 'Preciso de cartão de crédito para testar?', a: 'Não. O teste de 14 dias é liberado na hora, sem cartão. Se gostar, você assina o plano para continuar.' },
  { q: 'O que vem no plano?', a: '3 usuários, 1 número de WhatsApp com Instagram e Messenger, 2 lojas, funil de vendas, Comunicação, tarefas, Automatize e etiquetas. PDV, estoque, financeiro e os outros módulos são extras: você liga na Central quando precisar.' },
  { q: 'O WhatsApp é o oficial?', a: 'Sim, usamos a API oficial do WhatsApp (Meta). Sua conta fica segura e as conversas ficam registradas no funil.' },
  { q: 'Funciona para o meu negócio?', a: 'Se você vende conversando com o cliente pelo WhatsApp, Instagram ou Messenger, funciona. As etapas do funil e as etiquetas são suas: você monta do jeito que a sua equipe trabalha.' },
  { q: 'Posso cancelar quando quiser?', a: 'Pode. Sem fidelidade e sem multa: você cancela pelo portal de pagamento, em Configurações → Faturamento.' },
]
