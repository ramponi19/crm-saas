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

/**
 * Quem pode o quê no ZapIntel — A MESMA REGRA DAS TELAS, perguntada ao banco.
 *
 * As rotas de API leem com a chave de serviço (passa por cima do RLS) e até
 * 15/10/2026 filtravam só pela empresa: um vendedor de Mogi abria a ficha de um
 * lead de Jaguariúna pelo número, e uma empresa SEM o ZapIntel ligado disparava
 * análise paga. As telas não tinham esse furo porque cada função do banco passa
 * por `zapintel_escopo` (supabase/funcoes/zapintel_dashboard.sql): ZapIntel
 * ativo para a empresa, dono/admin/superadmin veem todas as lojas (mais "sem
 * loja" = 0), vendedor só as dele. Aqui a rota pergunta à mesma função — duas
 * regras para a mesma coisa só servem para divergir.
 *
 * Devolve `null` quando a empresa não tem o ZapIntel (ou o usuário não tem
 * empresa): a rota responde 403.
 */
export async function zapintelAcesso(): Promise<{ userId: string; empresaId: number; lojas: number[] } | null> {
  const { userId, empresaId } = await zapintelEmpresa()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('zapintel_escopo' as never, { p_filial: null, p_empresa: empresaId } as never)
  const linha = (Array.isArray(data) ? data[0] : data) as { empresa: number; filiais: number[] } | null
  if (error || !linha || Number(linha.empresa) !== empresaId) return null
  return { userId, empresaId, lojas: (linha.filiais ?? []).map(Number) }
}

/** O lead está numa loja que este usuário pode ver? Lead sem loja conta como 0. */
export function lojaVisivel(acesso: { lojas: number[] }, filialId: number | null | undefined): boolean {
  return acesso.lojas.includes(Number(filialId ?? 0))
}
