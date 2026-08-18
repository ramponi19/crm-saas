/**
 * O que cada plano libera. Módulo NEUTRO — sem React, sem `'use client'`.
 *
 * Vivia dentro de `lib/empresa-context.tsx`, que é componente de cliente. Quando
 * uma rota de API importou `temAcesso` de lá, a rota passou a carregar um módulo
 * cliente no servidor e estourou com 500 de corpo vazio — o tipo de erro que não
 * diz nada em log. Regra prática: matriz de regra de negócio não mora em arquivo
 * de UI.
 */

export type Plano = 'free' | 'starter' | 'pro'

export type ModuloPago = 'bi' | 'multi_usuario' | 'api' | 'white_label'

const MATRIZ: Record<ModuloPago, Plano[]> = {
  bi:            ['starter', 'pro'],
  multi_usuario: ['starter', 'pro'],
  api:           ['pro'],
  white_label:   ['pro'],
}

export function temAcesso(plano: Plano | undefined | null, modulo: ModuloPago): boolean {
  return plano ? MATRIZ[modulo].includes(plano) : false
}
