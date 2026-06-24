import { createClient, getEmpresaId } from '@/lib/supabase/server'
import EquipeView from './components/equipe-view'
import type { Tables } from '@/types/database'

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

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

  type VinculoRow = { role: string | null; ativo: boolean | null; usuarios: Embed<Tables<'usuarios'>> }
  const usuariosMapped = ((usuarios ?? []) as unknown as VinculoRow[])
    .map(eu => {
      const u = one(eu.usuarios)
      return u ? { ...u, role: eu.role } : null
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

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
