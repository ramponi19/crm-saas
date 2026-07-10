/**
 * data.ts — todo o conteúdo da landing num lugar só (copy, segmentos, planos,
 * módulos, comparativo, FAQ). As seções em `sections/` só renderizam isto.
 *
 * Cores hex aqui são data-driven (dots do funil do mock), como no mock aprovado.
 */

/* ------------------------------------------------------------------ */
/*  Segmentos — alimentam o mock vivo do hero                          */
/* ------------------------------------------------------------------ */

export type Tone = 'ok' | 'warn' | 'ink3'
export type FunilCol = { name: string; dot: string; leads: [string, string][] }
export type Segment = {
  label: string
  para: string // slug da página SEO /para/[segmento]
  empresa: string
  inicial: string
  nav: [string, string, string]
  url: string
  k1: { label: string; value: string; sub: string; tone: Tone }
  k2: { value: string; sub: string }
  k3: { label: string; value: string; sub: string; tone: Tone }
  funil: string
  cols: FunilCol[]
}

export const SEGS: Record<string, Segment> = {
  varejo: {
    label: 'Varejo', para: 'lojas', empresa: 'JM Store', inicial: 'J', nav: ['PDV', 'Estoque', 'Clientes'],
    url: 'app.usenexus.com.br/dashboard',
    k1: { label: 'Vendas hoje', value: 'R$ 8.420', sub: '+12,4% vs ontem', tone: 'ok' },
    k2: { value: '14', sub: '6 aguardando resposta' },
    k3: { label: 'Tarefas hoje', value: '9', sub: '2 vencem às 18h', tone: 'warn' },
    funil: 'Funil de vendas — julho',
    cols: [
      { name: 'Novo', dot: '#9199A3', leads: [['Larissa M.', 'iPhone 15 · Instagram'], ['Cauã R.', 'Fone JBL · balcão']] },
      { name: 'Em contato', dot: '#5C6470', leads: [['Douglas P.', 'Xiaomi 13 · WhatsApp']] },
      { name: 'Negociação', dot: '#2E5CE6', leads: [['Vanessa T.', 'MacBook · R$ 7,9 mil']] },
      { name: 'Fechamento', dot: '#B45309', leads: [['Igor S.', 'S24 · Pix enviado']] },
      { name: 'Convertido', dot: '#188A54', leads: [['Ana Paula', 'iPhone 13 · R$ 3.450']] },
    ],
  },
  imob: {
    label: 'Imobiliária', para: 'imobiliarias', empresa: 'Horizonte Imóveis', inicial: 'H', nav: ['Imóveis', 'Agenda', 'Proprietários'],
    url: 'app.usenexus.com.br/imoveis',
    k1: { label: 'Visitas hoje', value: '6', sub: '2 confirmadas p/ manhã', tone: 'ok' },
    k2: { value: '11', sub: '4 vindos do portal' },
    k3: { label: 'Propostas ativas', value: '3', sub: 'R$ 1,2 mi em negociação', tone: 'ink3' },
    funil: 'Funil de vendas — imóveis',
    cols: [
      { name: 'Lead novo', dot: '#9199A3', leads: [['Fam. Andrade', 'Apto 2q · Centro'], ['Bruno L.', 'Casa · até 450 mil']] },
      { name: 'Visita agendada', dot: '#2E5CE6', leads: [['Marta C.', 'qui 10h · Ed. Solar']] },
      { name: 'Visita feita', dot: '#5C6470', leads: [['Paulo H.', 'pediu 2ª visita']] },
      { name: 'Proposta', dot: '#B45309', leads: [['Fam. Nogueira', 'R$ 380 mil']] },
      { name: 'Fechamento', dot: '#188A54', leads: [['Renata V.', 'crédito aprovado']] },
    ],
  },
  auto: {
    label: 'Veículos', para: 'concessionarias', empresa: 'Riviera Motors', inicial: 'R', nav: ['Veículos', 'Pátio', 'Oficina'],
    url: 'app.usenexus.com.br/veiculos',
    k1: { label: 'Test-drives hoje', value: '4', sub: 'Corolla 14h · T-Cross 16h', tone: 'ink3' },
    k2: { value: '17', sub: '9 de portais de veículos' },
    k3: { label: 'Avaliações de usado', value: '2', sub: 'HB20 2021 em análise', tone: 'warn' },
    funil: 'Funil — seminovos',
    cols: [
      { name: 'Novo', dot: '#9199A3', leads: [['Felipe A.', 'Onix 2022 · OLX'], ['Débora S.', 'SUV até 120 mil']] },
      { name: 'Test-drive', dot: '#2E5CE6', leads: [['Marcos V.', 'Compass · sáb 10h']] },
      { name: 'Aval. do usado', dot: '#5C6470', leads: [['Juliana P.', 'troca: Argo 2020']] },
      { name: 'Proposta + F&I', dot: '#B45309', leads: [['Sérgio T.', 'ficha no banco']] },
      { name: 'Fechamento', dot: '#188A54', leads: [['Camila R.', 'Creta faturado']] },
    ],
  },
  saude: {
    label: 'Saúde', para: 'clinicas', empresa: 'Clínica Vitalle', inicial: 'V', nav: ['Agenda', 'Pacientes', 'Procedimentos'],
    url: 'app.usenexus.com.br/agenda',
    k1: { label: 'Consultas hoje', value: '18', sub: 'confirmadas no WhatsApp', tone: 'ok' },
    k2: { value: '7', sub: '3 pediram encaixe' },
    k3: { label: 'Faltas evitadas', value: '5', sub: 'lembrete D-1 automático', tone: 'ok' },
    funil: 'Jornada do paciente',
    cols: [
      { name: 'Novo contato', dot: '#9199A3', leads: [['Beatriz N.', 'avaliação · Instagram']] },
      { name: 'Agendado', dot: '#2E5CE6', leads: [['Sr. Almeida', 'retorno qui 09h'], ['Luana F.', '1ª consulta sex']] },
      { name: 'Em atendimento', dot: '#5C6470', leads: [['Marcela D.', 'sala 2']] },
      { name: 'Retorno', dot: '#B45309', leads: [['João Pedro', '30 dias · fisio']] },
      { name: 'Concluído', dot: '#188A54', leads: [['Rosa M.', 'alta + NPS']] },
    ],
  },
  food: {
    label: 'Food', para: 'restaurantes', empresa: 'Trattoria Bene', inicial: 'T', nav: ['Comandas', 'Cardápio', 'Entregas'],
    url: 'app.usenexus.com.br/pedidos',
    k1: { label: 'Pedidos hoje', value: '64', sub: 'ticket médio R$ 62', tone: 'ok' },
    k2: { value: '22', sub: 'delivery via WhatsApp' },
    k3: { label: 'Mesas abertas', value: '8', sub: '2 pedindo a conta', tone: 'warn' },
    funil: 'Fluxo de pedidos — agora',
    cols: [
      { name: 'Recebido', dot: '#9199A3', leads: [['#341 · Larissa', '2 massas · delivery']] },
      { name: 'Na cozinha', dot: '#2E5CE6', leads: [['#339 · mesa 6', 'risoto + vinho'], ['#340 · balcão', 'pizza margherita']] },
      { name: 'Pronto', dot: '#5C6470', leads: [['#338 · mesa 2', 'sobremesas']] },
      { name: 'Em entrega', dot: '#B45309', leads: [['#336 · Léo', 'bairro Sta. Cruz']] },
      { name: 'Entregue', dot: '#188A54', leads: [['#334 · Rodrigo', 'pago no Pix']] },
    ],
  },
  servicos: {
    label: 'Serviços', para: 'servicos', empresa: 'TechFix Assistência', inicial: 'T', nav: ['Ordens de Serviço', 'Orçamentos', 'Garantias'],
    url: 'app.usenexus.com.br/ordens',
    k1: { label: 'OS abertas', value: '23', sub: '5 aguardando peça', tone: 'warn' },
    k2: { value: '9', sub: '6 pediram orçamento' },
    k3: { label: 'Prontas p/ retirada', value: '7', sub: 'aviso enviado no WhatsApp', tone: 'ok' },
    funil: 'Esteira de ordens de serviço',
    cols: [
      { name: 'Novo', dot: '#9199A3', leads: [['iPhone 12 · Caio', 'tela quebrada']] },
      { name: 'Diagnóstico', dot: '#5C6470', leads: [['Note Dell · Vera', 'não liga']] },
      { name: 'Orçamento', dot: '#2E5CE6', leads: [['S22 · Henrique', 'R$ 480 · aguarda ok']] },
      { name: 'Em reparo', dot: '#B45309', leads: [['Moto G · Paty', 'conector']] },
      { name: 'Entregue', dot: '#188A54', leads: [['iPad · Sr. Luiz', 'garantia 90d']] },
    ],
  },
}

export const SEG_KEYS = Object.keys(SEGS)

/* ------------------------------------------------------------------ */
/*  Segmentos — cards da seção clara (linkam as páginas SEO /para/*)   */
/* ------------------------------------------------------------------ */

export const SEG_CARDS: { key: string; title: string; desc: string }[] = [
  { key: 'varejo', title: 'Varejo & lojas', desc: 'PDV com Pix, estoque sincronizado e o funil do WhatsApp no balcão.' },
  { key: 'imob', title: 'Imobiliárias', desc: 'Imóveis, visitas, chaves e leads dos portais caindo direto no funil.' },
  { key: 'auto', title: 'Loja de veículos', desc: 'Test-drive, avaliação de usado, ficha de financiamento e pátio.' },
  { key: 'saude', title: 'Clínicas & saúde', desc: 'Agenda cheia, confirmação D-1 automática e lista de espera.' },
  { key: 'food', title: 'Restaurantes & food', desc: 'Cardápio digital com QR, pedidos por WhatsApp e comandas por mesa.' },
  { key: 'servicos', title: 'Serviços & assistência', desc: 'OS na esteira, orçamento aprovado por link e controle de garantias.' },
]

/* ------------------------------------------------------------------ */
/*  Planos                                                             */
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

/** Fallback caso o banco não responda — mantém a vitrine sempre preenchida. */
export const FALLBACK_PLANS: PlanData[] = [
  { id: 'essencial', name: 'Essencial', priceCents: 4900, featured: false, tagline: 'Para quem está começando a organizar.', features: ['PDV integrado', 'Cadastro de clientes', 'Controle de estoque básico', '1 usuário'] },
  { id: 'profissional', name: 'Profissional', priceCents: 9900, featured: true, tagline: 'O favorito de quem quer crescer.', features: ['Pipeline de vendas', 'Atendimento multicanal', 'Relatórios em tempo real', 'Até 5 usuários'] },
  { id: 'escala', name: 'Escala', priceCents: 19900, featured: false, tagline: 'Para operações que não param.', features: ['Equipe ilimitada', 'Acesso via API', 'Suporte prioritário'] },
]

export const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/* ------------------------------------------------------------------ */
/*  Módulos (bento)                                                    */
/* ------------------------------------------------------------------ */

export type ModuleCard = { key: string; title: string; desc: string; span: string }
export const MODULES: ModuleCard[] = [
  { key: 'atendimento', title: 'Atendimento', desc: 'WhatsApp oficial, Instagram e Messenger num só painel — cada conversa vira lead com dono e próximo passo.', span: 'lg:col-span-7' },
  { key: 'funil', title: 'Funil de vendas', desc: 'Kanban com etapas do seu segmento, motivo de perda obrigatório e automações quando o lead para.', span: 'lg:col-span-5' },
  { key: 'pix', title: 'Cobrança & Pix', desc: 'Cobre dentro da conversa e concilie sozinho.', span: 'lg:col-span-4' },
  { key: 'agenda', title: 'Agenda', desc: 'Visitas, consultas e test-drives com lembrete D-1.', span: 'lg:col-span-4' },
  { key: 'estoque', title: 'Estoque & PDV', desc: 'Balcão e online com caixa e estoque em tempo real.', span: 'lg:col-span-4' },
  { key: 'relatorios', title: 'Relatórios', desc: 'Receita, conversão, forecast ponderado e ranking do time — atualizados a cada venda.', span: 'lg:col-span-7' },
  { key: 'financeiro', title: 'Financeiro', desc: 'A pagar, a receber e fluxo de caixa sem planilha.', span: 'lg:col-span-5' },
]

/* ------------------------------------------------------------------ */
/*  Números (prova social)                                             */
/* ------------------------------------------------------------------ */

export type Stat = { value: number; format: (n: number) => string; label: string; sub: string }
export const STATS: Stat[] = [
  { value: 247, format: (n) => String(Math.round(n)), label: 'empresas ativas', sub: 'em 6 segmentos' },
  { value: 31, format: (n) => `${Math.round(n)} mil`, label: 'leads atendidos', sub: 'WhatsApp, Instagram e portais' },
  { value: 4.8, format: (n) => `R$ ${n.toFixed(1).replace('.', ',')} mi`, label: 'vendidos por mês', sub: 'registrados na plataforma' },
  { value: 112, format: (n) => `${Math.round(n)}s`, label: 'tempo médio de resposta', sub: 'com SLA cronometrado', },
]

/* ------------------------------------------------------------------ */
/*  Comparativo honesto                                                */
/* ------------------------------------------------------------------ */

export type CompareVal = boolean | 'meio'
export const COMPARE: { label: string; nexus: CompareVal; planilha: CompareVal; generico: CompareVal }[] = [
  { label: 'Tudo num sistema só', nexus: true, planilha: false, generico: 'meio' },
  { label: 'WhatsApp oficial integrado', nexus: true, planilha: false, generico: false },
  { label: 'Fala a língua do seu segmento', nexus: true, planilha: 'meio', generico: false },
  { label: 'Cobrança por Pix nativa', nexus: true, planilha: false, generico: false },
  { label: 'Migração assistida', nexus: true, planilha: false, generico: 'meio' },
  { label: 'Preço em Real, suporte em português', nexus: true, planilha: true, generico: false },
]

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

export const FAQ = [
  { q: 'Preciso de cartão de crédito para testar?', a: 'Não. O teste de 14 dias é liberado na hora, sem cartão. Você só escolhe um plano se decidir continuar.' },
  { q: 'Consigo migrar meus dados da planilha?', a: 'Sim. A migração é assistida: nosso time importa seus clientes, produtos e histórico para você começar já com tudo no lugar.' },
  { q: 'O WhatsApp é o oficial?', a: 'Sim, usamos a API oficial do WhatsApp (Meta). Sua conta fica segura e as conversas ficam registradas no funil.' },
  { q: 'Funciona para o meu segmento?', a: 'O Nexus se adapta a varejo, imobiliária, loja de veículos, saúde, food e serviços — com funil, campos e relatórios já no vocabulário da sua operação.' },
  { q: 'Posso cancelar quando quiser?', a: 'Pode. Sem fidelidade e sem multa. Você mantém o acesso até o fim do período já pago.' },
]
