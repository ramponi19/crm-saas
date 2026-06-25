import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

/**
 * Server-side enforcement. Redirects to /planos if the empresa's plan
 * does not include the requested module.
 */
export async function exigirPlano(modulo: ModuloPlano): Promise<void> {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  if (!empresaId) redirect('/login')

  const { data: empresa } = await supabase
    .from('empresas')
    .select('plano')
    .eq('id', empresaId)
    .single()

  if (!planoTemAcesso(empresa?.plano ?? '', modulo)) {
    redirect(`/planos?upgrade=${modulo}`)
  }
}
