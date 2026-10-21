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
    .from('funil_etapas').select('id, slug, label, cor, tipo, ativo, ordem, probabilidade, campos_obrigatorios')
    .eq('empresa_id', empresaId).eq('funil_id', funilId ?? -1).order('ordem')

  /**
   * Quantos leads ativos moram em cada etapa.
   *
   * É o que permite excluir com responsabilidade: o lead guarda o SLUG da etapa
   * em `kanban_status`, então apagar uma etapa que tem gente dentro deixaria
   * esses leads apontando para algo que não existe — eles sairiam do kanban sem
   * ninguém perceber, e é justamente o cliente que ainda não comprou.
   */
  const { data: leadsPorEtapa } = await supabase
    .from('leads').select('kanban_status').eq('empresa_id', empresaId).eq('ativo', true)
  const contagem: Record<string, number> = {}
  for (const l of (leadsPorEtapa ?? []) as { kanban_status: string | null }[]) {
    const k = l.kanban_status ?? ''
    if (k) contagem[k] = (contagem[k] ?? 0) + 1
  }

  const etapasEdit: EtapaEdit[] = ((etapas ?? []) as Array<Record<string, unknown>>).map((e) => ({
    id: e.id as number,
    slug: e.slug as string,
    label: e.label as string,
    cor: e.cor as string,
    tipo: e.tipo as string,
    ativo: e.ativo as boolean,
    ordem: e.ordem as number,
    probabilidade: (e.probabilidade as number) ?? 0,
    camposObrigatorios: Array.isArray(e.campos_obrigatorios) ? (e.campos_obrigatorios as string[]) : [],
  }))

  return (
    <>
      <Topbar title="Funil de vendas" />
      <FunilView initial={etapasEdit} funilId={funilId} funis={funis} leadsPorEtapa={contagem} />
    </>
  )
}
