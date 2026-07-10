import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MarketingView, type Solicitacao } from './marketing-view'

export const metadata = { title: 'Marketing' }

export default async function MarketingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const { data } = await supabase
    .from('solicitacoes_marketing')
    .select('id, item, objetivo, canais, status, solicitante_id, created_at')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(300)

  const itens: Solicitacao[] = (data ?? []).map((s) => ({
    id: s.id, item: s.item, objetivo: s.objetivo, status: s.status,
    canais: Array.isArray(s.canais) ? (s.canais as string[]) : [],
    solicitante_id: s.solicitante_id, created_at: s.created_at,
  }))

  return <MarketingView itensIniciais={itens} meuId={user.id} />
}
