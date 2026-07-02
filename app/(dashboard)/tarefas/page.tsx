import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { normalizarSegmento } from '@/lib/segmentos'
import TarefasView from './tarefas-view'
import type { Tables } from '@/types/database'

export const metadata = { title: 'Tarefas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function TarefasPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).single()
  if (normalizarSegmento(empresa?.segmento) !== 'imobiliaria') redirect('/dashboard')

  const { data: vinculo } = await supabase.from('empresa_usuarios').select('role').eq('usuario_id', user!.id).eq('empresa_id', empresaId).maybeSingle()
  const isGestor = ['owner', 'admin'].includes(vinculo?.role ?? '')

  let q = supabase.from('tarefas').select('*, leads(nome)').eq('empresa_id', empresaId)
  if (!isGestor) q = q.eq('responsavel_id', user!.id)

  const [{ data: tarefasRaw }, { data: leads }, { data: membros }] = await Promise.all([
    q.order('concluida').order('vencimento', { nullsFirst: false }),
    supabase.from('leads').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('ultima_mensagem_at', { ascending: false }).limit(200),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  type TarefaRow = Tables<'tarefas'> & { leads: Embed<{ nome: string | null }> }
  const tarefas = ((tarefasRaw ?? []) as unknown as TarefaRow[]).map(t => ({ ...t, lead_nome: one(t.leads)?.nome ?? null }))

  const usuarios = ((membros ?? []) as unknown as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
    .map(m => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  return (
    <TarefasView
      inicial={tarefas}
      leads={leads ?? []}
      usuarios={usuarios}
      empresaId={empresaId}
      meuId={user!.id}
      isGestor={isGestor}
    />
  )
}
