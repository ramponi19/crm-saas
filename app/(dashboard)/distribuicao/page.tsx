import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DistribuicaoView, type Regra, type Membro } from './distribuicao-view'

export const metadata = { title: 'Distribuição de leads' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function DistribuicaoPage() {
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

  const [{ data: regrasRaw }, { data: membrosRaw }, { count: semDono }] = await Promise.all([
    supabase.from('distribuicao_regras').select('id, ordem, nome, ativo, criterio, config, destinatarios').eq('empresa_id', empresaId).order('ordem', { ascending: true }),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).is('responsavel_id', null),
  ])

  const regras: Regra[] = (regrasRaw ?? []).map((r) => ({
    id: r.id, nome: r.nome, ativo: r.ativo, criterio: r.criterio,
    config: (r.config ?? {}) as Record<string, unknown>,
    destinatarios: (Array.isArray(r.destinatarios) ? r.destinatarios : []) as string[],
  }))

  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const membros: Membro[] = ((membrosRaw ?? []) as unknown as MembroRow[])
    .map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  return <DistribuicaoView regrasIniciais={regras} membros={membros} semDono={semDono ?? 0} />
}
