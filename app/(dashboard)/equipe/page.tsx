import { createClient, getEmpresaId } from '@/lib/supabase/server'
import EquipeView from './components/equipe-view'

export default async function EquipePage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const mesAtual = new Date().toISOString().slice(0, 7) // "2026-06"
  const inicioMes = `${mesAtual}-01`
  const fimMes = new Date(new Date(inicioMes).getFullYear(), new Date(inicioMes).getMonth() + 1, 1).toISOString()

  const [{ data: usuarios }, { data: metas }, { data: vendasMes }, { data: comissoesMes }] = await Promise.all([
    supabase
      .from('empresa_usuarios')
      .select('role, ativo, usuarios!usuario_id(*)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('usuario_id'),
    supabase.from('metas_comissoes').select('*').eq('empresa_id', empresaId).eq('mes_ano', mesAtual),
    supabase.from('vendas')
      .select('vendedor_id, valor_venda, status')
      .eq('empresa_id', empresaId)
      .gte('data_venda', inicioMes)
      .lt('data_venda', fimMes)
      .eq('status', 'concluida'),
    supabase.from('comissoes')
      .select('*')
      .eq('empresa_id', empresaId)
      .gte('created_at', inicioMes)
      .lt('created_at', fimMes)
      .eq('status', 'pago'),
  ])

  const usuariosMapped = (usuarios ?? []).map((eu: any) => ({
    ...eu.usuarios,
    role: eu.role,
  }))

  return (
    <EquipeView
      usuarios={usuariosMapped}
      metasIniciais={metas ?? []}
      vendasMes={vendasMes ?? []}
      comissoesPagas={comissoesMes ?? []}
      mesAtual={mesAtual}
    />
  )
}
