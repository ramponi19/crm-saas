import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { planoTemAcesso, type ModuloPlano } from '@/lib/plano'
export type { ModuloPlano, Plano } from '@/lib/plano'
export { planoTemAcesso } from '@/lib/plano'

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
