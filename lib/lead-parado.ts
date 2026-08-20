/**
 * Quando um lead está PARADO, e o quanto isso é grave.
 *
 * Módulo neutro (sem React, sem banco) porque três telas fazem a mesma pergunta:
 * o dashboard do corretor, a Gestão de Leads e — no futuro — qualquer alerta. As
 * faixas viviam dentro do componente do dashboard; a segunda tela copiaria os
 * números, e no dia em que o dono pedisse "crítico é 20 dias" um dos dois lugares
 * ficaria para trás dizendo outra coisa sobre o mesmo lead.
 *
 * O que NÃO está aqui: "aguardando resposta" (lib/esteira.ts). São perguntas
 * diferentes e de propósito separadas — esteira cobra RESPOSTA a uma mensagem do
 * cliente em minutos úteis; parado é ausência de qualquer tratativa por dias.
 */

/** Faixas combinadas com o dono da imobiliária (19/08/2026), no vocabulário dele. */
export type Gravidade = 'critico' | 'alto' | 'moderado' | 'atencao'

export const GRAVIDADES: { id: Gravidade; label: string; desde: number; tone: 'bad' | 'warn' | 'neutro' }[] = [
  { id: 'critico',  label: 'Crítico',  desde: 30, tone: 'bad' },
  { id: 'alto',     label: 'Alto',     desde: 15, tone: 'bad' },
  { id: 'moderado', label: 'Moderado', desde: 7,  tone: 'warn' },
  /**
   * "Atenção" começa em 3 dias, e não em zero.
   *
   * Em zero ela era inalcançável: a tela lista de `DIAS_ATENCAO` para cima, então o
   * card ficava eternamente 0 — e a primeira versão desta tela resolveu isso
   * ESCONDENDO o card, ou seja, entregando menos. Três dias é o ponto em que o lead
   * ainda está quente e já passou tempo suficiente para alguém ter respondido.
   */
  { id: 'atencao',  label: 'Atenção',  desde: 3,  tone: 'neutro' },
]

/**
 * Dois limites, porque são dois usos.
 *
 * `DIAS_ATENCAO` é a porta da tela de Gestão de Leads: tudo que já merece um toque.
 * `DIAS_PARADO` é o resumo do dashboard, que mostra só o que já dói — cockpit com
 * lista de três dias de atraso vira ruído e o corretor para de olhar.
 */
export const DIAS_ATENCAO = GRAVIDADES[GRAVIDADES.length - 1].desde
export const DIAS_PARADO = 7

/** Prioridade do follow-up, no vocabulário de prioridade (não de gravidade). */
export function prioridadeDoFollowUp(dias: number): { label: string; tone: 'bad' | 'warn' | 'neutro' } {
  const g = gravidadeDoAtraso(dias).id
  if (g === 'critico' || g === 'alto') return { label: 'Prioridade Alta', tone: 'bad' }
  if (g === 'moderado') return { label: 'Prioridade Média', tone: 'warn' }
  return { label: 'Prioridade Baixa', tone: 'neutro' }
}

export function gravidadeDoAtraso(dias: number): { id: Gravidade; label: string; tone: 'bad' | 'warn' | 'neutro' } {
  // GRAVIDADES está em ordem decrescente de `desde`: a primeira que couber vale.
  const g = GRAVIDADES.find((x) => dias >= x.desde) ?? GRAVIDADES[GRAVIDADES.length - 1]
  return { id: g.id, label: g.label, tone: g.tone }
}

/**
 * Dias desde a última coisa que aconteceu com o lead.
 *
 * A referência é a mais recente entre mensagem e tratativa, com a criação como
 * piso — lead que nasceu ontem e ninguém tocou está parado há um dia, não há zero.
 * Sem o piso, lead novo e nunca atendido aparecia como se estivesse em dia.
 */
export function diasParado(
  lead: { ultima_mensagem_at?: string | null; ultima_tratativa?: string | null; created_at?: string | null },
  agora: number = Date.now(),
): number {
  const marcos = [lead.ultima_mensagem_at, lead.ultima_tratativa, lead.created_at]
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime())
    .filter((t) => Number.isFinite(t))
  if (!marcos.length) return 0
  const ultimo = Math.max(...marcos)
  return Math.max(0, Math.floor((agora - ultimo) / 864e5))
}
