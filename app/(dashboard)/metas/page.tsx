import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { MetasView, type MetaVendedor } from './metas-view'

export const metadata = { title: 'Metas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function MetasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  const now = new Date()
  const mesAno = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const [{ data: prefRow }, { data: membrosRaw }, { data: metasRaw }, { data: vendasRaw }, { data: etapasRaw }, { data: leadsRaw }] = await Promise.all([
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'preferencias').maybeSingle(),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('metas_comissoes').select('usuario_id, meta_vendas_valor').eq('empresa_id', empresaId).eq('mes_ano', mesAno),
    supabase.from('vendas').select('vendedor_id, valor_venda, data_venda, status').eq('empresa_id', empresaId).gte('data_venda', inicio).lt('data_venda', fim),
    supabase.from('funil_etapas').select('funil_id, slug, tipo, probabilidade').eq('empresa_id', empresaId),
    supabase.from('leads').select('funil_id, kanban_status, valor_estimado').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const metaEmpresa = Number((prefRow?.valor as { meta_vendas_mes?: number } | null)?.meta_vendas_mes ?? 0)

  // Realizado do mês por vendedor + total (ignora canceladas).
  const realizadoPorVend = new Map<string, number>()
  let realizadoTotal = 0
  for (const v of (vendasRaw ?? []) as Array<{ vendedor_id: string | null; valor_venda: number | null; status: string | null }>) {
    if (v.status === 'cancelada') continue
    const val = Number(v.valor_venda ?? 0)
    realizadoTotal += val
    if (v.vendedor_id) realizadoPorVend.set(v.vendedor_id, (realizadoPorVend.get(v.vendedor_id) ?? 0) + val)
  }

  // Forecast = pipeline aberto ponderado pela probabilidade da etapa.
  const probPorEtapa = new Map<string, { tipo: string; prob: number }>()
  for (const e of (etapasRaw ?? []) as Array<{ funil_id: number | null; slug: string; tipo: string; probabilidade: number }>) {
    probPorEtapa.set(`${e.funil_id}:${e.slug}`, { tipo: e.tipo, prob: e.probabilidade })
  }
  let forecast = 0
  for (const l of (leadsRaw ?? []) as Array<{ funil_id: number | null; kanban_status: string | null; valor_estimado: number | null }>) {
    const et = probPorEtapa.get(`${l.funil_id}:${l.kanban_status}`)
    if (!et || et.tipo === 'ganho' || et.tipo === 'perdido') continue
    forecast += Number(l.valor_estimado ?? 0) * (et.prob / 100)
  }

  const metaPorVend = new Map<string, number>()
  for (const m of (metasRaw ?? []) as Array<{ usuario_id: string; meta_vendas_valor: number | null }>) {
    metaPorVend.set(m.usuario_id, Number(m.meta_vendas_valor ?? 0))
  }

  const vendedores: MetaVendedor[] = ((membrosRaw ?? []) as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
    .map(m => ({
      usuarioId: m.usuario_id,
      nome: one(m.usuarios)?.nome ?? '—',
      meta: metaPorVend.get(m.usuario_id) ?? 0,
      realizado: realizadoPorVend.get(m.usuario_id) ?? 0,
    }))
    .sort((a, b) => b.realizado - a.realizado)

  return (
    <>
      <Topbar title="Metas" />
      <MetasView
        mesAno={mesAno}
        metaEmpresa={metaEmpresa}
        realizadoTotal={realizadoTotal}
        forecast={Math.round(forecast)}
        vendedores={vendedores}
      />
    </>
  )
}
