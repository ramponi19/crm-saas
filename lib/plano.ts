export type ModuloPlano = 'bi' | 'multi_usuario' | 'api' | 'white_label'
export type Plano = 'base' | 'free' | 'starter' | 'pro' | 'unlimited'

/**
 * PLANO ÚNICO (18/11/2026): toda empresa nova nasce no 'base' (planos_config). Os quatro antigos ficam só
 * para o histórico; quem estava neles passou para o 'base' sem perder nada do que usava (migração
 * 20261118000100). O que vai além do plano é módulo ou extra, com preço em precos_adicionais.
 */
export const PLANO_BASE = 'base'

const MATRIZ: Record<ModuloPlano, Plano[]> = {
  bi:            ['base', 'starter', 'pro', 'unlimited'],
  multi_usuario: ['base', 'starter', 'pro', 'unlimited'],
  api:           ['pro', 'unlimited'],
  white_label:   ['base', 'pro', 'unlimited'],
}

export function planoTemAcesso(plano: Plano | string | undefined, modulo: ModuloPlano): boolean {
  if (!plano) return false
  return (MATRIZ[modulo] as string[]).includes(plano)
}

/** O plano mais barato que inclui o recurso (a Central de Módulos diz "no plano X"). */
export function planoMinimo(modulo: ModuloPlano): Plano {
  return MATRIZ[modulo][0]
}
