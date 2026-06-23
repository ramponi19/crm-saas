import { createClient } from '@/lib/supabase/server'
import EquipeView from './components/equipe-view'

export default async function EquipePage() {
  const supabase = await createClient()

  const mesAtual = new Date().toISOString().slice(0, 7) // "2026-06"
  const inicioMes = `${mesAtual}-01`
  const fimMes = new Date(new Date(inicioMes).getFullYear(), new Date(inicioMes).getMonth() + 1, 1).toISOString()

  const [{ data: usuarios }, { data: metas }, { data: vendasMes }, { data: comissoesMes }] = await Promise.all([
    supabase.from('usuarios').select('*').order('nome'),
    supabase.from('metas_comissoes').select('*').eq('mes_ano', mesAtual),
    supabase.from('vendas')
      .select('vendedor_id, valor_venda, status')
      .gte('data_venda', inicioMes)
      .lt('data_venda', fimMes)
      .eq('status', 'concluida'),
    supabase.from('comissoes')
      .select('*')
      .gte('created_at', inicioMes)
      .lt('created_at', fimMes)
      .eq('status', 'pago'),
  ])

  return (
    <EquipeView
      usuarios={usuarios ?? []}
      metasIniciais={metas ?? []}
      vendasMes={vendasMes ?? []}
      comissoesPagas={comissoesMes ?? []}
      mesAtual={mesAtual}
    />
  )
}
