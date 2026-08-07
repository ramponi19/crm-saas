import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { normalizarSegmento } from '@/lib/segmentos'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { OrcamentosView, type Orcamento, type UnidadeOpt, type PrecoRef } from './orcamentos-view'

export const metadata = { title: 'Orçamentos' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function OrcamentosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/dashboard')

  // Orçamento é negociação em andamento, colada no lead: cada vendedor vê os
  // seus. O admin vê todos.
  const [{ data: vinculo }, { data: usuarioRow }, { data: empresaPerm }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
    supabase.from('empresas').select('permissoes').eq('id', empresaId).maybeSingle(),
  ])
  const papel = vinculo?.role ?? ''
  const ehGestor = !!usuarioRow?.is_super_admin || papel === 'owner' || papel === 'admin'
  const soMeus = !ehGestor && !!papel
    && !permsDoPapel(papel, (empresaPerm?.permissoes ?? null) as PermissoesMap | null).verVendasOutros

  const baseOrc = supabase.from('orcamentos')
    .select('id, lead_id, tipo, status, cliente_nome, cliente_telefone, aparelho, imei, defeito, prazo_dias, garantia_dias, itens, aparelho_novo, valor_novo, aparelho_usado, valor_entrada, unidade_id, total, valor_devolver, acerto, observacoes, token, created_at')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(200)

  const [{ data }, { data: emp }, { data: unidadesRaw }, { data: tabelaRaw }] = await Promise.all([
    soMeus ? baseOrc.eq('usuario_id', user.id) : baseOrc,
    supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle(),
    supabase.from('inventario_unidades')
      .select('id, preco_venda, condicao, produtos!produto_id(nome)')
      .eq('empresa_id', empresaId).eq('status', 'disponivel').eq('ativo', true).limit(300),
    supabase.from('tabela_precos')
      .select('modelo, armazenamento, condicao, preco_sugerido')
      .eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const orcamentos: Orcamento[] = (data ?? []).map((o) => ({
    ...o, total: Number(o.total) || 0,
    itens: Array.isArray(o.itens) ? (o.itens as unknown as Orcamento['itens']) : [],
  }))

  type UniRow = { id: number; preco_venda: number | null; condicao: string | null; produtos: Embed<{ nome: string | null }> }
  const unidades: UnidadeOpt[] = ((unidadesRaw ?? []) as unknown as UniRow[]).map((u) => ({
    id: u.id,
    label: `${one(u.produtos)?.nome ?? 'Aparelho'}${u.condicao ? ` · ${u.condicao}` : ''}`,
    preco: Number(u.preco_venda) || 0,
  }))

  const tabelaPrecos = ((tabelaRaw ?? []) as unknown as PrecoRef[])

  return <OrcamentosView orcamentosIniciais={orcamentos} segmento={normalizarSegmento(emp?.segmento)} unidades={unidades} tabelaPrecos={tabelaPrecos} />
}
