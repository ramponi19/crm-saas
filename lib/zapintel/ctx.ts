import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Contexto do complemento ZapIntel: resolve a empresa ativa do usuário logado,
 * reusando o login do CRM. Redireciona se não houver sessão/empresa.
 *
 * Veio de lib/tracker/ctx.ts quando o Tracker foi removido: o ZapIntel dependia
 * dele, e mover é mais honesto que manter uma pasta morta só por causa de um
 * import.
 */
export async function zapintelEmpresa(): Promise<{ userId: string; empresaId: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin, impersonando_empresa_id, impersonando_expires_at')
    .eq('id', user.id).single()

  // Preview do super admin: cookie próprio aponta a empresa a inspecionar, sem
  // impersonar o CRM inteiro. Só vale para super admin (o cookie é ignorado para
  // qualquer outro usuário) e tem precedência por ser uma ação explícita.
  if (usuario?.is_super_admin) {
    const preview = Number((await cookies()).get('nexus_preview_empresa')?.value)
    if (Number.isFinite(preview) && preview > 0) return { userId: user.id, empresaId: preview }
  }

  // Super admin impersonando → empresa impersonada (consistente com o resto do CRM).
  if (usuario?.is_super_admin && usuario.impersonando_empresa_id && usuario.impersonando_expires_at
      && new Date(usuario.impersonando_expires_at) > new Date()) {
    return { userId: user.id, empresaId: usuario.impersonando_empresa_id }
  }

  const { data: vinculo } = await supabase
    .from('empresa_usuarios').select('empresa_id')
    .eq('usuario_id', user.id).eq('ativo', true).limit(1).maybeSingle()
  if (vinculo?.empresa_id) return { userId: user.id, empresaId: vinculo.empresa_id }

  // Super admin sem empresa vinculada: cai na 1ª empresa (preview da plataforma).
  if (usuario?.is_super_admin) {
    const { data: emp } = await supabase.from('empresas').select('id').order('id', { ascending: true }).limit(1).maybeSingle()
    if (emp?.id) return { userId: user.id, empresaId: emp.id }
  }
  redirect('/entrar')
}
