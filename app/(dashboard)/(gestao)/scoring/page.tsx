import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mergeScoreConfig, type ScoreConfig } from '@/lib/lead-score'
import { ScoringView, type CadenciaOpt } from './scoring-view'

export const metadata = { title: 'Lead scoring' }

export default async function ScoringPage() {
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

  const [{ data: cfgRow }, { data: cads }] = await Promise.all([
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle(),
    supabase.from('cadencias').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
  ])

  const config = mergeScoreConfig((cfgRow?.valor ?? null) as Partial<ScoreConfig> | null)
  const cadencias: CadenciaOpt[] = (cads ?? []).map((c) => ({ id: c.id, nome: c.nome }))

  return <ScoringView configInicial={config} cadencias={cadencias} />
}
