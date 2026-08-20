import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { diasParado, DIAS_PARADO } from '@/lib/lead-parado'
import { getKanbanColumns, type KanbanColumn } from '@/components/modules/leads/types'
import { GestaoLeadsView, type LeadAtrasado, type EstadoReativacao } from './gestao-leads-view'

export const metadata = { title: 'Gestão de Leads' }

/**
 * Gestão de Leads: quem parou e o que o sistema faz sozinho a respeito.
 *
 * O funil mostra tudo o que está aberto e não distingue o que anda do que apodrece
 * — lead esquecido dentro de "Em Proposta" tem cara de progresso. Esta tela separa
 * por tempo sem tratativa e dá a ação na mesma linha.
 *
 * NÃO inventa conceito novo: as faixas vêm de `lib/lead-parado.ts` (as mesmas do
 * dashboard) e a automação é a reativação que já existe (`lib/reativacao.ts`,
 * configurada em Administração → Cadências e disparada pelo cron). Aqui só se vê o
 * estado dela e se pode rodar na hora.
 */
export default async function GestaoLeadsPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/login')

  const [{ data: vinculo }, { data: empresa }, { data: usuarioLogado }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('empresas').select('segmento, permissoes').eq('id', empresaId).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
  ])
  const role = vinculo?.role ?? ''
  const isAdmin = !!(usuarioLogado?.is_super_admin || role === 'owner' || role === 'admin')
  /**
   * Quem não pode ver lead de outro vê ESTA TELA com os leads dele.
   *
   * Cobrar do corretor o próprio atraso é o uso mais óbvio da tela; esconder dele
   * seria transformar acompanhamento em vigilância de mão única. O corte é no
   * servidor, como no funil.
   */
  const restringe = !!role && !permsDoPapel(role, (empresa?.permissoes ?? null) as PermissoesMap | null).verLeadsOutros

  let qLeads = supabase.from('leads')
    .select('id, nome, telefone, kanban_status, funil_id, valor_estimado, responsavel_id, ultima_mensagem_at, ultima_tratativa, created_at')
    .eq('empresa_id', empresaId).eq('ativo', true).limit(1000)
  if (restringe) qLeads = qLeads.eq('responsavel_id', user.id)

  const [
    { data: leadsRaw }, { data: etapasRaw }, { data: membrosRaw },
    { data: tmplRow }, { data: reativRow }, { data: cadenciasRaw },
  ] = await Promise.all([
    qLeads,
    // Etapas do funil PADRÃO, do banco — os rótulos que o dono editou.
    supabase.from('funil_etapas').select('slug, label, tipo, ordem, funis!inner(padrao)')
      .eq('empresa_id', empresaId).eq('ativo', true).eq('funis.padrao', true).order('ordem'),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    // Os textos são da LOJA (mesma chave que a Fila do dia usa) — o CRM não escreve
    // mensagem no lugar do corretor, do mesmo jeito que não escreve cláusula de contrato.
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'mensagens_templates').maybeSingle(),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'reativacao').maybeSingle(),
    supabase.from('cadencias').select('id, nome').eq('empresa_id', empresaId),
  ])

  type EtapaRow = { slug: string; label: string; tipo: string | null }
  const doBanco: KanbanColumn[] = ((etapasRaw ?? []) as unknown as EtapaRow[]).map((e) => ({
    id: e.slug,
    label: e.label,
    color: '#7FB0E8',
    tipo: e.tipo === 'negociacao' || e.tipo === 'ganho' || e.tipo === 'perdido' ? e.tipo : undefined,
  }))
  const colunas = doBanco.length > 0 ? doBanco : getKanbanColumns(empresa?.segmento ?? null)
  const terminais = new Set(colunas.filter((c) => c.tipo === 'ganho' || c.tipo === 'perdido').map((c) => c.id))

  type Embed<T> = T | T[] | null
  const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
  const nomePorUsuario = new Map(
    ((membrosRaw ?? []) as unknown as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
      .map((m) => [m.usuario_id, one(m.usuarios)?.nome ?? '—']),
  )

  type LeadRow = {
    id: number; nome: string | null; telefone: string | null; kanban_status: string | null
    valor_estimado: number | null; responsavel_id: string | null
    ultima_mensagem_at: string | null; ultima_tratativa: string | null; created_at: string | null
  }
  const agora = Date.now()
  const atrasados: LeadAtrasado[] = ((leadsRaw ?? []) as LeadRow[])
    // Etapa terminal fora: lead ganho ou perdido não está parado, está resolvido.
    .filter((l) => !terminais.has(l.kanban_status ?? 'novo'))
    .map((l) => ({
      id: l.id,
      nome: l.nome || 'Lead sem nome',
      telefone: l.telefone,
      etapa: colunas.find((c) => c.id === (l.kanban_status ?? 'novo'))?.label ?? '—',
      responsavel: l.responsavel_id ? (nomePorUsuario.get(l.responsavel_id) ?? '—') : 'sem dono',
      valor: Number(l.valor_estimado) || 0,
      dias: diasParado(l, agora),
    }))
    .filter((l) => l.dias >= DIAS_PARADO)
    .sort((a, b) => b.dias - a.dias)

  const cfg = (reativRow?.valor ?? {}) as { ativo?: boolean; dias_frio?: number; incluir_perdidos?: boolean; cadencia_id?: number | null }
  const cadencias = (cadenciasRaw ?? []) as { id: number; nome: string }[]

  /**
   * Quantos leads já estão numa cadência ativa — é o que responde "a automação
   * está funcionando ou está desligada em silêncio?".
   */
  const { count: inscritos } = await supabase
    .from('cadencia_inscricoes')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('status', 'ativa')

  const reativacao: EstadoReativacao = {
    ativo: !!cfg.ativo,
    diasFrio: Number(cfg.dias_frio) || 30,
    incluirPerdidos: !!cfg.incluir_perdidos,
    cadenciaNome: cfg.cadencia_id ? (cadencias.find((c) => c.id === cfg.cadencia_id)?.nome ?? null) : null,
    inscritosAtivos: inscritos ?? 0,
  }

  return (
    <GestaoLeadsView
      leads={atrasados}
      templates={(tmplRow?.valor ?? {}) as Record<string, string>}
      reativacao={reativacao}
      podeExecutar={isAdmin}
      limiteDias={DIAS_PARADO}
      soMeus={restringe}
    />
  )
}
