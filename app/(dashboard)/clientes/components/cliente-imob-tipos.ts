/**
 * Vocabulário do cliente imobiliário — nas palavras do dono, com os valores do banco.
 *
 * Fica num módulo neutro (sem React) porque a lista, o modal e o formulário de
 * cadastro precisam dos MESMOS rótulos. Duplicar a lista em três telas é como se
 * cria a tela que chama "Em Análise" o que a outra chama "Análise".
 */

export const TIPO_NEGOCIO: { v: string; l: string }[] = [
  { v: 'compra', l: 'Compra' },
  { v: 'locacao', l: 'Locação' },
  { v: 'captacao', l: 'Captação' },
  { v: 'investidor', l: 'Investidor' },
  { v: 'lancamento', l: 'Lançamento' },
]

/**
 * Status da análise cadastral.
 *
 * Existe porque o funil novo tem "Em Análise" e "Aprovados": a etapa dizia que havia
 * uma análise e o cadastro não guardava o resultado dela — o corretor abria o lead e
 * não sabia se o crédito passou.
 */
export const STATUS_APROVACAO: { v: string; l: string; tone: 'neutro' | 'warn' | 'ok' | 'bad' }[] = [
  { v: 'pendente',   l: 'Pendente',   tone: 'neutro' },
  { v: 'em_analise', l: 'Em Análise',  tone: 'warn' },
  { v: 'aprovado',   l: 'Aprovado',   tone: 'ok' },
  { v: 'reprovado',  l: 'Reprovado',  tone: 'bad' },
]

/** Origem do lead, com as opções que o dono usa hoje. */
export const ORIGENS_IMOB: { v: string; l: string }[] = [
  { v: 'site', l: 'Site' },
  { v: 'indicacao', l: 'Indicação' },
  { v: 'redes_sociais', l: 'Redes Sociais' },
  { v: 'portais', l: 'Portais' },
  { v: 'telefone', l: 'Telefone' },
  { v: 'outros', l: 'Outros' },
]

/** Tipos de imóvel que a ficha de preferências oferece. */
export const TIPOS_IMOVEL = [
  'Apartamento', 'Casa', 'Comercial', 'Terreno', 'Cobertura',
  'Flat', 'Kitnet', 'Sobrado', 'Chácara', 'Sala Comercial',
]

/**
 * Características desejadas.
 *
 * Lista aberta no banco (`text[]`), fixa na tela: assim o corretor marca em vez de
 * digitar — e duas fichas não viram "portaria 24h" e "Portaria 24 horas", que o
 * match nunca casaria.
 */
export const CARACTERISTICAS = [
  'Piscina', 'Churrasqueira', 'Varanda', 'Suíte', 'Elevador',
  'Portaria 24h', 'Academia', 'Salão de Festas', 'Playground', 'Jardim',
  'Garagem Coberta', 'Vista Mar', 'Condomínio Fechado', 'Mobiliado', 'Ar Condicionado',
]

export const rotuloTipoNegocio = (v: string | null | undefined) =>
  TIPO_NEGOCIO.find((t) => t.v === v)?.l ?? null

export const statusAprovacao = (v: string | null | undefined) =>
  STATUS_APROVACAO.find((s) => s.v === (v ?? 'pendente')) ?? STATUS_APROVACAO[0]
