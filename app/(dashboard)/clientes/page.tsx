import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { calcularScore, mergeScoreConfig, type LeadScoreInput, type ScoreConfig } from '@/lib/lead-score'
import { getKanbanColumns, type KanbanColumn } from '@/components/modules/leads/types'
import ClientesView, { type ClienteImob } from './components/clientes-view'

/**
 * Clientes.
 *
 * No varejo a tela fala de quem JÁ COMPROU: compras, total gasto, última compra.
 * Na imobiliária, a mesma palavra significa quem está decidindo — e a ficha precisa
 * mostrar etapa do funil, score, corretor e status da análise cadastral. São duas
 * telas para a mesma palavra, e a capacidade `clienteComPipeline` escolhe qual.
 *
 * O QUE LIGA AS DUAS METADES: `clientes.lead_id`. A jornada (etapa, score) vive em
 * `leads`; a pessoa para efeito de contrato (CPF validado, estado civil) vive em
 * `clientes`. Sem o vínculo, a mesma pessoa apareceria duas vezes no CRM com
 * históricos separados — foi o que a decisão de 20/08/2026 resolveu.
 */
export default async function ClientesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle()
  const cap = SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades
  const imob = !!cap.clienteComPipeline

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome')

  const clientes = clientesRaw ?? []

  // Varejo segue exatamente como estava — nenhuma consulta extra, nenhum risco.
  if (!imob) return <ClientesView clientes={clientes} />

  type ClienteRow = { id: number; lead_id: number | null; corretor_id: string | null }
  const idsLead = [...new Set((clientes as ClienteRow[]).map((c) => c.lead_id).filter((x): x is number => x != null))]

  const [{ data: leadsRaw }, { data: etapasRaw }, { data: membrosRaw }, { data: scoreRow }] = await Promise.all([
    idsLead.length
      ? supabase.from('leads')
          .select('id, kanban_status, origem, valor_estimado, telefone, instagram, msgs_nao_lidas, ultima_mensagem_at, ultima_tratativa, created_at, responsavel_id')
          .in('id', idsLead)
      : Promise.resolve({ data: [] }),
    // Etapas do funil PADRÃO: os rótulos que o dono editou, não os do código.
    supabase.from('funil_etapas').select('slug, label, tipo, ordem, funis!inner(padrao)')
      .eq('empresa_id', empresaId).eq('ativo', true).eq('funis.padrao', true).order('ordem'),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle(),
  ])

  type Embed<T> = T | T[] | null
  const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

  type EtapaRow = { slug: string; label: string; tipo: string | null }
  const doBanco: KanbanColumn[] = ((etapasRaw ?? []) as unknown as EtapaRow[]).map((e) => ({
    id: e.slug,
    label: e.label,
    color: '#7FB0E8',
    tipo: e.tipo === 'negociacao' || e.tipo === 'ganho' || e.tipo === 'perdido' ? e.tipo : undefined,
  }))
  const etapas = doBanco.length > 0 ? doBanco : getKanbanColumns(empresa?.segmento ?? null)

  const equipe = ((membrosRaw ?? []) as unknown as Array<{ usuario_id: string; usuarios: Embed<{ nome: string | null }> }>)
    .map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))
  const nomePorUsuario = new Map(equipe.map((u) => [u.id, u.nome]))

  const scoreCfg = mergeScoreConfig((scoreRow?.valor ?? null) as Partial<ScoreConfig> | null)

  type LeadRow = {
    id: number; kanban_status: string | null; origem: string | null; valor_estimado: number | null
    telefone: string | null; instagram: string | null; msgs_nao_lidas: number | null
    ultima_mensagem_at: string | null; ultima_tratativa: string | null; created_at: string | null
    responsavel_id: string | null
  }
  const leadPorId = new Map(((leadsRaw ?? []) as LeadRow[]).map((l) => [l.id, l]))

  /**
   * A jornada de cada cliente, resolvida no servidor.
   *
   * Score é função pura (`lib/lead-score`), então dá para calcular aqui e mandar
   * pronto — a tela não precisa da regra, só do número, e assim o card do kanban e
   * esta lista mostram o MESMO score.
   */
  const jornada: Record<number, ClienteImob> = {}
  for (const c of clientes as ClienteRow[]) {
    const lead = c.lead_id != null ? leadPorId.get(c.lead_id) : undefined
    const responsavel = lead?.responsavel_id ?? c.corretor_id ?? null
    jornada[c.id] = {
      etapaId: lead?.kanban_status ?? null,
      etapaLabel: lead ? (etapas.find((e) => e.id === (lead.kanban_status ?? 'novo'))?.label ?? '—') : null,
      score: lead ? calcularScore(lead as unknown as LeadScoreInput, scoreCfg).score : null,
      corretorNome: responsavel ? (nomePorUsuario.get(responsavel) ?? '—') : null,
    }
  }

  return (
    <ClientesView
      clientes={clientes}
      imob
      etapas={etapas.map((e) => ({ id: e.id, label: e.label, tipo: e.tipo ?? null }))}
      equipe={equipe}
      jornada={jornada}
    />
  )
}
