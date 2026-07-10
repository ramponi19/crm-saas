import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KdsView, type Pedido } from './kds-view'

export const metadata = { title: 'Cozinha (KDS)' }

export default async function KdsPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/dashboard')

  const { data } = await supabase
    .from('pedidos')
    .select('id, mesa, cliente_nome, itens, total, status, observacoes, created_at')
    .eq('empresa_id', empresaId).in('status', ['recebido', 'preparando', 'pronto'])
    .order('created_at', { ascending: true }).limit(200)

  const pedidos: Pedido[] = (data ?? []).map((p) => ({
    id: p.id, mesa: p.mesa, cliente_nome: p.cliente_nome, total: Number(p.total) || 0, status: p.status,
    observacoes: p.observacoes, created_at: p.created_at,
    itens: Array.isArray(p.itens) ? (p.itens as unknown as Pedido['itens']) : [],
  }))

  return <KdsView empresaId={empresaId} inicial={pedidos} />
}
