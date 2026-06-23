import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsView } from '@/components/modules/leads/leads-view'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

export default async function LeadsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .single()

  if (!vinculo) redirect('/login')

  const empresaId = vinculo.empresa_id

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
  for (const m of msgsNaoLidas ?? []) {
    const id = (m as any).lead_id as number
    if (id != null) contagem[id] = (contagem[id] ?? 0) + 1
  }

  // Sobrescreve msgs_nao_lidas de cada lead com a contagem real
  const leadsComContagem = (leads ?? []).map((l: any) => ({
    ...l,
    msgs_nao_lidas: contagem[l.id] ?? 0,
  }))

  return (
    <LeadsView
      initialLeads={leadsComContagem}
      usuarios={(usuarios ?? []).map((eu: any) => ({ id: eu.usuario_id, nome: eu.usuarios?.nome ?? '', role: eu.role }))}
    />
  )
}
