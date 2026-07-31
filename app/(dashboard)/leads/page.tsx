import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { LeadsView } from '@/components/modules/leads/leads-view'
import type { Lead, KanbanColumn, Motivo, Funil } from '@/components/modules/leads/types'
import { normalizarSegmento } from '@/lib/segmentos'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { mergeScoreConfig, type ScoreConfig } from '@/lib/lead-score'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

export default async function LeadsPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: leads }, { data: usuarios }, { data: msgsNaoLidas }, { data: empresa }, { data: etapasRaw }, { data: motivosRaw }, { data: funisRaw }] = await Promise.all([
    supabase
      .from('leads')
      .select(`
        id, nome, telefone, instagram, origem, kanban_status,
        responsavel_id, observacoes, created_at, ativo,
        primeira_msg, msgs_nao_lidas, ultima_tratativa,
        ultima_mensagem_at, produto_interessado, convertido_em, funil_id, valor_estimado,
        foto_url
      `)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('ultima_mensagem_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(id, nome)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
    // Contagem real de não-lidas — apenas leads desta empresa
    supabase
      .from('lead_mensagens')
      .select('lead_id, leads!inner(empresa_id)')
      .eq('leads.empresa_id', empresaId)
      .eq('lida', false)
      .eq('direcao', 'recebida'),
    supabase.from('empresas').select('segmento, permissoes').eq('id', empresaId).single(),
    supabase.from('funil_etapas').select('slug, label, cor, tipo, ordem, funil_id, campos_obrigatorios').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    supabase.from('motivos_perda').select('id, label').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    supabase.from('funis').select('id, nome, padrao').eq('empresa_id', empresaId).order('padrao', { ascending: false }).order('nome'),
  ])
  const { data: { user } } = await supabase.auth.getUser()

  // Etapas do funil vindas do banco (fallback = constante do segmento, na view).
  type EtapaRow = { slug: string; label: string; cor: string; tipo: string; ordem: number; funil_id: number | null; campos_obrigatorios: unknown }
  const funilEtapas: KanbanColumn[] = ((etapasRaw ?? []) as EtapaRow[]).map((e) => ({
    id: e.slug,
    label: e.label,
    color: e.cor,
    tipo: e.tipo === 'negociacao' || e.tipo === 'ganho' || e.tipo === 'perdido' ? e.tipo : undefined,
    funilId: e.funil_id ?? undefined,
    camposObrigatorios: Array.isArray(e.campos_obrigatorios) ? (e.campos_obrigatorios as string[]) : [],
  }))

  // Agrupa não-lidas por lead_id
  const contagem: Record<number, number> = {}
  for (const m of (msgsNaoLidas ?? []) as Array<{ lead_id: number | null }>) {
    const id = m.lead_id
    if (id != null) contagem[id] = (contagem[id] ?? 0) + 1
  }

  // Sobrescreve msgs_nao_lidas de cada lead com a contagem real
  const leadsComContagem = ((leads ?? []) as unknown as Lead[]).map(l => ({
    ...l,
    msgs_nao_lidas: contagem[l.id] ?? 0,
  }))

  type UsuarioVinculoRow = { usuario_id: string; role: string | null; usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null }
  const usuariosMapped = ((usuarios ?? []) as unknown as UsuarioVinculoRow[]).map(eu => {
    const u = Array.isArray(eu.usuarios) ? eu.usuarios[0] : eu.usuarios
    return { id: eu.usuario_id, nome: u?.nome ?? '', role: eu.role ?? '' }
  })

  // Visibilidade de leads por permissão: só restringe quando o papel é CONHECIDO
  // e explicitamente sem "ver leads de outros". Papel desconhecido (ex.: superadmin
  // impersonando, que não está em empresa_usuarios) ou owner/admin → vê tudo.
  const meuRole = usuariosMapped.find((u) => u.id === user?.id)?.role ?? ''
  const restringe = !!meuRole && !permsDoPapel(meuRole, (empresa?.permissoes ?? null) as PermissoesMap | null).verLeadsOutros
  const leadsVisiveis = restringe ? leadsComContagem.filter((l) => l.responsavel_id === user?.id) : leadsComContagem

  const { data: scoringRow } = await supabase
    .from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle()
  const scoreConfig = mergeScoreConfig((scoringRow?.valor ?? null) as Partial<ScoreConfig> | null)

  return (
    <LeadsView
      initialLeads={leadsVisiveis}
      usuarios={usuariosMapped}
      empresaId={empresaId}
      segmento={normalizarSegmento(empresa?.segmento)}
      funilEtapas={funilEtapas}
      motivos={(motivosRaw ?? []) as Motivo[]}
      funis={(funisRaw ?? []) as Funil[]}
      scoreConfig={scoreConfig}
      restringe={restringe}
      meuId={user?.id}
    />
  )
}
