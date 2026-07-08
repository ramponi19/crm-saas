import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { FunilView, type EtapaEdit } from './funil-view'

export const metadata = { title: 'Funil' }

export default async function FunilPage({ searchParams }: { searchParams: Promise<{ funil?: string }> }) {
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

  // Funil selecionado (?funil=ID) ou o padrão da empresa (Fase 4.1).
  const { funil: funilParam } = await searchParams
  const { data: funisRaw } = await supabase
    .from('funis').select('id, nome, padrao').eq('empresa_id', empresaId).order('padrao', { ascending: false }).order('nome')
  const funis = (funisRaw ?? []) as { id: number; nome: string; padrao: boolean }[]
  const funilId = (funilParam && funis.some(f => String(f.id) === funilParam))
    ? Number(funilParam)
    : (funis.find(f => f.padrao)?.id ?? funis[0]?.id)

  const { data: etapas } = await supabase
    .from('funil_etapas').select('id, slug, label, cor, tipo, ativo, ordem')
    .eq('empresa_id', empresaId).eq('funil_id', funilId ?? -1).order('ordem')

  return (
    <>
      <Topbar title="Funil de vendas" />
      <FunilView initial={(etapas ?? []) as EtapaEdit[]} funilId={funilId} funis={funis} />
    </>
  )
}
