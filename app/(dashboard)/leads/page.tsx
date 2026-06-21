import { createClient } from '@/lib/supabase/server'
import { LeadsView } from '@/components/modules/leads/leads-view'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

export default async function LeadsPage() {
  const supabase = await createClient()

  const [{ data: leads }, { data: usuarios }, { data: msgsNaoLidas }] = await Promise.all([
    supabase
      .from('leads')
      .select(`
        id, nome, telefone, instagram, origem, kanban_status,
        responsavel_id, observacoes, created_at, ativo,
        primeira_msg, msgs_nao_lidas, ultima_tratativa,
        ultima_mensagem_at, produto_interessado, convertido_em
      `)
      .eq('ativo', true)
      .order('ultima_mensagem_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('usuarios')
      .select('id, nome, role')
      .order('nome'),
    // Contagem real de não-lidas (recebidas e ainda não lidas)
    supabase
      .from('lead_mensagens')
      .select('lead_id')
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
      usuarios={usuarios ?? []}
    />
  )
}
