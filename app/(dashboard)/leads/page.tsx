import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { LeadsView } from '@/components/modules/leads/leads-view'
import type { Lead } from '@/components/modules/leads/types'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

export default async function LeadsPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: leads }, { data: usuarios }, { data: msgsNaoLidas }] = await Promise.all([
    supabase
      .from('leads')
      .select(`
        id, nome, telefone, instagram, origem, kanban_status,
        responsavel_id, observacoes, created_at, ativo,
        primeira_msg, msgs_nao_lidas, ultima_tratativa,
        ultima_mensagem_at, produto_interessado, convertido_em
      `)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('ultima_mensagem_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('empresa_usuarios')
      .select('usuario_id, role, usuarios!usuario_id(id, nome)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
    // Contagem real de não-lidas — apenas leads desta empresa
    supabase
      .from('lead_mensagens')
      .select('lead_id, leads!inner(empresa_id)')
      .eq('leads.empresa_id', empresaId)
      .eq('lida', false)
      .eq('direcao', 'recebida'),
  ])

  // Agrupa não-lidas por lead_id
  const contagem: Record<number, number> = {}
  for (const m of (msgsNaoLidas ?? []) as Array<{ lead_id: number | null }>) {
    const id = m.lead_id
    if (id != null) contagem[id] = (contagem[id] ?? 0) + 1
  }

  // Sobrescreve msgs_nao_lidas de cada lead com a contagem real
  const leadsComContagem = ((leads ?? []) as unknown as Lead[]).map(l => ({
    ...l,
    msgs_nao_lidas: contagem[l.id] ?? 0,
  }))

  type UsuarioVinculoRow = { usuario_id: string; role: string | null; usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null }
  const usuariosMapped = ((usuarios ?? []) as unknown as UsuarioVinculoRow[]).map(eu => {
    const u = Array.isArray(eu.usuarios) ? eu.usuarios[0] : eu.usuarios
    return { id: eu.usuario_id, nome: u?.nome ?? '', role: eu.role ?? '' }
  })

  return (
    <LeadsView
      initialLeads={leadsComContagem}
      usuarios={usuariosMapped}
    />
  )
}
