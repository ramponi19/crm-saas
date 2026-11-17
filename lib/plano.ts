export type ModuloPlano = 'bi' | 'multi_usuario' | 'api' | 'white_label'
export type Plano = 'free' | 'starter' | 'pro' | 'unlimited'

const MATRIZ: Record<ModuloPlano, Plano[]> = {
  bi:            ['starter', 'pro', 'unlimited'],
  multi_usuario: ['starter', 'pro', 'unlimited'],
  api:           ['pro', 'unlimited'],
  white_label:   ['pro', 'unlimited'],
}

export function planoTemAcesso(plano: Plano | string | undefined, modulo: ModuloPlano): boolean {
  if (!plano) return false
  return (MATRIZ[modulo] as string[]).includes(plano)
}

/** O plano mais barato que inclui o recurso (a Central de Módulos diz "no plano X"). */
export function planoMinimo(modulo: ModuloPlano): Plano {
  return MATRIZ[modulo][0]
}
