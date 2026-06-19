import { createClient } from '@/lib/supabase/server'
import { LeadsView } from '@/components/modules/leads/leads-view'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

export default async function LeadsPage() {
  const supabase = await createClient()

  const { data: leads } = await supabase
    .from('leads')
    .select(`
      id,
      nome,
      telefone,
      instagram,
      origem,
      kanban_status,
      responsavel_id,
      observacoes,
      created_at,
      ativo,
      primeira_msg,
      msgs_nao_lidas,
      ultima_tratativa,
      ultima_mensagem_at,
      produto_interessado,
      convertido_em
    `)
    .eq('ativo', true)
    .order('ultima_mensagem_at', { ascending: false, nullsFirst: false })

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nome, role')
    .order('nome')

  return (
    <LeadsView
      initialLeads={leads ?? []}
      usuarios={usuarios ?? []}
    />
  )
}
