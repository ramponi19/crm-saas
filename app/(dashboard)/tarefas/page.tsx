import { createClient, getEmpresaId } from '@/lib/supabase/server'
import TarefasView from './tarefas-view'
import type { Tables } from '@/types/database'
import { embedLead, leadsParaEscolher } from '@/lib/leads'

export const metadata = { title: 'Tarefas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

// Tarefas é módulo de núcleo: disponível em toda empresa.
export default async function TarefasPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const { data: vinculo } = await supabase.from('empresa_usuarios').select('role').eq('usuario_id', user!.id).eq('empresa_id', empresaId).maybeSingle()
  const isGestor = ['owner', 'admin'].includes(vinculo?.role ?? '')

  // A chave vai NOMEADA: desde o corte (20/10) tarefas tem lead_id e negocio_id
  // apontando para negocios, e o embed de leads sem a chave ficou ambíguo (PGRST201) —
  // a lista vinha vazia e criar tarefa falhava, sem erro na tela. O nome vem do contato.
  const SELECT_TAREFA: string = `*, ${embedLead('tarefas_lead_id_fkey')}`
  let q = supabase.from('tarefas').select(SELECT_TAREFA).eq('empresa_id', empresaId)
  // O vendedor vê as dele e as SEM responsável (12/11/2026: tarefa de automação em negócio sem dono);
  // a RLS de tarefas já limita às lojas que ele alcança.
  if (!isGestor) q = q.or(`responsavel_id.eq.${user!.id},responsavel_id.is.null`)

  const [{ data: tarefasRaw }, leads, { data: membros }] = await Promise.all([
    q.order('concluida').order('vencimento', { nullsFirst: false }),
    // Os de conversa mais recente primeiro (era `leads` por ultima_mensagem_at).
    leadsParaEscolher(supabase, empresaId, 200),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  type TarefaRow = Tables<'tarefas'> & { leads: Embed<{ nome: string | null }> }
  const tarefas = ((tarefasRaw ?? []) as unknown as TarefaRow[]).map(t => ({ ...t, lead_nome: one(t.leads)?.nome ?? null }))

  const usuarios = ((membros ?? []) as unknown as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
    .map(m => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  return (
    <TarefasView
      inicial={tarefas}
      leads={leads}
      usuarios={usuarios}
      empresaId={empresaId}
      meuId={user!.id}
      isGestor={isGestor}
    />
  )
}
