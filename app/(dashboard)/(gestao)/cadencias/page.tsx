import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CadenciasView, type Cadencia, type PassoUi, type EtapaOpt } from './cadencias-view'

export const metadata = { title: 'Cadências' }

export default async function CadenciasPage() {
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

  const [{ data: cadsRaw }, { data: passosRaw }, { data: etapasRaw }, { data: tmplRow }, { data: reativRow }] = await Promise.all([
    supabase.from('cadencias').select('id, nome, descricao, ativo, gatilho, gatilho_etapa_slug').eq('empresa_id', empresaId).order('created_at', { ascending: true }),
    supabase.from('cadencia_passos').select('cadencia_id, ordem, canal, dia_offset, titulo, template_chave').eq('empresa_id', empresaId).order('ordem', { ascending: true }),
    supabase.from('funil_etapas').select('slug, label, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem', { ascending: true }),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'mensagens_templates').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'reativacao').maybeSingle(),
  ])

  const passosByCad = new Map<number, PassoUi[]>()
  for (const p of passosRaw ?? []) {
    const arr = passosByCad.get(p.cadencia_id) ?? []
    arr.push({ canal: p.canal, dia_offset: p.dia_offset, titulo: p.titulo, template_chave: p.template_chave })
    passosByCad.set(p.cadencia_id, arr)
  }

  const cadencias: Cadencia[] = (cadsRaw ?? []).map((c) => ({
    id: c.id, nome: c.nome, descricao: c.descricao, ativo: c.ativo,
    gatilho: c.gatilho, gatilho_etapa_slug: c.gatilho_etapa_slug,
    passos: passosByCad.get(c.id) ?? [],
  }))

  const etapaMap = new Map<string, string>()
  for (const e of etapasRaw ?? []) if (!etapaMap.has(e.slug)) etapaMap.set(e.slug, e.label)
  const etapas: EtapaOpt[] = [...etapaMap].map(([slug, label]) => ({ slug, label }))

  const templates = Object.keys((tmplRow?.valor ?? {}) as Record<string, string>)
  const reativacao = (reativRow?.valor ?? {}) as { ativo?: boolean; dias_frio?: number; incluir_perdidos?: boolean; cadencia_id?: number | null }

  return <CadenciasView cadenciasIniciais={cadencias} etapas={etapas} templates={templates} reativacao={reativacao} />
}
