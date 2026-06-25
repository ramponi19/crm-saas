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
