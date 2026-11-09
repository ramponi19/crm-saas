import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { capacidades, carregarConfigEmpresa } from '@/lib/empresa-config'
import { calcularScore, mergeScoreConfig, type LeadScoreInput, type ScoreConfig } from '@/lib/lead-score'
import { getKanbanColumns, type KanbanColumn } from '@/components/modules/leads/types'
import ClientesView, { type ClienteImob } from './components/clientes-view'
import { comNome } from '@/lib/sem-nome'
import { lerTodosOsClientes } from '@/lib/clientes'
import { COLUNAS_LEAD, conversasDosLeads, leadDoNegocio } from '@/lib/leads'

/**
 * O lead de cada cliente (o negócio do `lead_id`), com a conversa do contato na
 * loja — a view `leads` caiu; etapa vem de funil_etapas, nome/telefone do contato.
 */
async function lerJornadaDosLeads(db: Awaited<ReturnType<typeof createClient>>, empresaId: number, ids: number[]) {
  const { data } = await db.from('negocios').select(COLUNAS_LEAD).in('id', ids)
  const leads = ((data ?? []) as unknown as Record<string, unknown>[]).map(leadDoNegocio)
  const conversas = await conversasDosLeads(db, empresaId, leads)
  const semConversa = { ultima_mensagem_at: null, ultima_recebida_at: null, ultima_enviada_at: null, msgs_nao_lidas: 0 }
  return leads.map((l) => ({ ...l, ...(conversas.get(l.id) ?? semConversa) }))
}

/**
 * Clientes.
 *
 * No varejo a tela fala de quem JÁ COMPROU: compras, total gasto, última compra.
 * Na imobiliária, a mesma palavra significa quem está decidindo — e a ficha precisa
 * mostrar etapa do funil, score, corretor e status da análise cadastral. São duas
 * telas para a mesma palavra, e a capacidade `clienteComPipeline` escolhe qual.
 *
 * O QUE LIGA AS DUAS METADES: o `lead_id` da marca `_cliente` (lib/clientes.ts). A
 * jornada (etapa, score) vive no negócio (`lib/leads`); a pessoa para efeito de contrato (CPF validado,
 * estado civil) vive no cadastro do cliente. Sem o vínculo, a mesma pessoa apareceria duas vezes no CRM com
 * históricos separados — foi o que a decisão de 20/08/2026 resolveu.
 */
export default async function ClientesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const cfg = await carregarConfigEmpresa(supabase, empresaId ?? 0)
  const imob = !!capacidades(cfg).clienteComPipeline

  const clientes = (await lerTodosOsClientes(supabase, empresaId)).map(comNome)

  // Varejo segue exatamente como estava — nenhuma consulta extra, nenhum risco.
  if (!imob) return <ClientesView clientes={clientes} />

  type ClienteRow = { id: number; lead_id: number | null; corretor_id: string | null }
  const idsLead = [...new Set((clientes as ClienteRow[]).map((c) => c.lead_id).filter((x): x is number => x != null))]

  const [leadsRaw, { data: etapasRaw }, { data: membrosRaw }, { data: scoreRow }, { data: motivosRaw }] = await Promise.all([
    idsLead.length ? lerJornadaDosLeads(supabase, empresaId, idsLead) : Promise.resolve([]),
    // Etapas do funil PADRÃO: os rótulos que o dono editou, não os do código.
    supabase.from('funil_etapas').select('slug, label, tipo, ordem, funis!inner(padrao)')
      .eq('empresa_id', empresaId).eq('ativo', true).eq('funis.padrao', true).order('ordem'),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle(),
    // Mover para uma etapa de perda pede o motivo, como no quadro: /api/leads/mover recusa perda sem ele.
    supabase.from('motivos_perda').select('id, label').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
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
  const etapas = doBanco.length > 0 ? doBanco : getKanbanColumns()

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
  const leadPorId = new Map((leadsRaw as LeadRow[]).map((l) => [l.id, l]))

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
      motivos={(motivosRaw ?? []) as { id: number; label: string }[]}
    />
  )
}
