import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { AparenciaView } from './aparencia-view'
import type { WlMenu } from '@/lib/wl-menu'

export const metadata = { title: 'Aparência' }

export default async function AparenciaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  const { data: emp } = await supabase.from('empresas').select('wl_menu').eq('id', empresaId).single()

  return (
    <>
      <Topbar title="Aparência" />
      <AparenciaView initial={(emp?.wl_menu ?? null) as WlMenu | null} />
    </>
  )
}
