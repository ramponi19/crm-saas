import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcularRanking, valorMetrica } from '@/lib/ranking'
import { RankingView, type MetaUi, type MembroOpt } from './ranking-view'

export const metadata = { title: 'Ranking & Metas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const now = new Date()
  const sp = await searchParams
  const periodo = /^\d{4}-\d{2}$/.test(sp.periodo ?? '') ? sp.periodo! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = !!(usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin')

  // O ranking compara o resultado de TODO MUNDO — é tela de gestão, e saiu do
  // menu do CRM a pedido do dono. Tirar do menu não bastaria: sem esta trava o
  // vendedor continuaria vendo o faturamento dos colegas digitando a URL,
  // justamente o que o isolamento por vendedor existe para impedir.
  if (!isAdmin) redirect('/dashboard')

  const [linhas, { data: metasRaw }, { data: membrosRaw }] = await Promise.all([
    calcularRanking(supabase, empresaId, periodo),
    supabase.from('metas').select('id, escopo, usuario_id, tipo, alvo, periodo').eq('empresa_id', empresaId).eq('periodo', periodo).order('id', { ascending: true }),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const linhaByUser = new Map(linhas.map((l) => [l.usuario_id, l]))
  const nomeByUser = new Map(linhas.map((l) => [l.usuario_id, l.nome]))

  const metas: MetaUi[] = (metasRaw ?? []).map((m) => {
    const realizado = m.escopo === 'equipe'
      ? linhas.reduce((s, l) => s + valorMetrica(l, m.tipo), 0)
      : valorMetrica(linhaByUser.get(m.usuario_id ?? ''), m.tipo)
    return {
      id: m.id, escopo: m.escopo, tipo: m.tipo, alvo: Number(m.alvo) || 0,
      usuario_nome: m.escopo === 'equipe' ? 'Equipe' : (nomeByUser.get(m.usuario_id ?? '') ?? '—'),
      realizado,
    }
  })

  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const membros: MembroOpt[] = ((membrosRaw ?? []) as unknown as MembroRow[]).map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  return <RankingView periodo={periodo} linhas={linhas} metas={metas} membros={membros} isAdmin={isAdmin} />
}
