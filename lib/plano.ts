export type ModuloPlano = 'bi' | 'multi_usuario' | 'api' | 'white_label'
export type Plano = 'free' | 'starter' | 'pro'

const MATRIZ: Record<ModuloPlano, Plano[]> = {
  bi:            ['starter', 'pro'],
  multi_usuario: ['starter', 'pro'],
  api:           ['pro'],
  white_label:   ['pro'],
}

export function planoTemAcesso(plano: Plano | string | undefined, modulo: ModuloPlano): boolean {
  if (!plano) return false
  return (MATRIZ[modulo] as string[]).includes(plano)
}

/** O plano mais barato que inclui o recurso (a Central de Módulos diz "no plano X"). */
export function planoMinimo(modulo: ModuloPlano): Plano {
  return MATRIZ[modulo][0]
}
