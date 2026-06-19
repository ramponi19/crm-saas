import { createClient } from '@/lib/supabase/server'
import ClientesView from './components/clientes-view'

export default async function ClientesPage() {
  const supabase = await createClient()

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('*')
    .eq('ativo', true)
    .order('nome')

  const { data: vendasRaw } = await supabase
    .from('vendas')
    .select('cliente_id, valor_venda, data_venda')
    .eq('status', 'concluida')

  // Calcular stats por cliente
  const statsMap = new Map<number, { total_vendas: number; valor_total: number; ultima_compra: string | null }>()
  for (const v of vendasRaw ?? []) {
    if (!v.cliente_id) continue
    const s = statsMap.get(v.cliente_id) ?? { total_vendas: 0, valor_total: 0, ultima_compra: null }
    s.total_vendas++
    s.valor_total += Number(v.valor_venda)
    if (!s.ultima_compra || v.data_venda > s.ultima_compra) s.ultima_compra = v.data_venda
    statsMap.set(v.cliente_id, s)
  }

  const clientes = (clientesRaw ?? []).map(c => ({
    ...c,
    total_vendas: statsMap.get(c.id)?.total_vendas ?? 0,
    valor_total: statsMap.get(c.id)?.valor_total ?? 0,
    ultima_compra: statsMap.get(c.id)?.ultima_compra ?? null,
  }))

  return <ClientesView clientes={clientes} />
}
