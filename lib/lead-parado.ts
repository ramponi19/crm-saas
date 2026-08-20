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
  { id: 'atencao',  label: 'Atenção',  desde: 0,  tone: 'neutro' },
]

/** A partir de quantos dias o lead entra na lista de parados. */
export const DIAS_PARADO = 7

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
