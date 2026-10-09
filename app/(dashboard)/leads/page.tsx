import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { LeadsView } from '@/components/modules/leads/leads-view'
import type { Lead, KanbanColumn, Motivo, Funil } from '@/components/modules/leads/types'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { mergeScoreConfig, type ScoreConfig } from '@/lib/lead-score'
import { devolverLeadsSemResposta } from '@/lib/esteira'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

/**
 * TRAZ TODOS OS LEADS, nao os primeiros mil.
 *
 * ══ O QUE ACONTECIA (09/10/2026) ═══════════════════════════════════════════
 *
 * A consulta nao paginava, e o PostgREST corta em 1000 linhas EM SILENCIO. Com
 * 2.198 leads ativos, a tela mostrava 1.000 e escondia o resto — e como a ordem
 * e pela conversa mais recente, o que sumia era a cauda antiga.
 *
 * Nao era so a lista: os contadores do topo sao calculados sobre o que foi
 * carregado, entao TODOS mentiam. Medido em Mogi Guacu:
 *
 *   leads ativos ....... tela 1.000   banco 1.841
 *   aguardando resposta  tela   632   banco   754
 *   na esteira ......... tela   951   banco 1.763
 *
 * Oitocentos leads invisiveis, a maioria SEM DONO. Lead sem dono que ninguem ve
 * e lead que ninguem atende — e o "1.000" tinha cara de numero da operacao,
 * nao de teto de consulta.
 *
 * O mesmo teto de 1000 ja havia mordido a busca do Cmd+K e o ZapIntel. Quando
 * uma consulta pode passar de mil linhas, ou ela pagina ou ela mente.
 */
async function todosOsLeads(
  supabase: SupabaseClient,
  empresaId: number,
): Promise<Lead[]> {
  const PAGINA = 1000
  const fora: Lead[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data } = await supabase
      .from('leads')
      .select(`
        id, nome, telefone, instagram, origem, kanban_status,
        responsavel_id, observacoes, created_at, ativo,
        primeira_msg, msgs_nao_lidas, ultima_tratativa,
        ultima_mensagem_at, produto_interessado, convertido_em, funil_id, valor_estimado,
        foto_url, ultima_recebida_at, ultima_enviada_at
      `)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .order('ultima_mensagem_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(de, de + PAGINA - 1)
    const lote = (data ?? []) as unknown as Lead[]
    fora.push(...lote)
    if (lote.length < PAGINA) break
  }
  return fora
}

export default async function LeadsPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [leads, { data: usuarios }, { data: msgsNaoLidas }, { data: empresa }, { data: etapasRaw }, { data: motivosRaw }, { data: funisRaw }] = await Promise.all([
    todosOsLeads(supabase, empresaId),
    supabase
      .from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(id, nome)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
    /**
     * Contagem real de não-lidas, JÁ AGRUPADA PELO BANCO.
     *
     * Antes vinha uma linha por mensagem para agrupar aqui. Com 1.437 não lidas
     * na JM, a resposta da API era cortada e o cabeçalho anunciou "145
     * aguardando resposta" onde eram 174 — vinte e nove conversas de cliente
     * fora do contador, erro que cresce com a base e sempre para menos.
     *
     * A view devolve uma linha por lead COM pendência (174), e já filtra lead
     * arquivado. Ver a migração `contar_nao_lidas_no_banco`.
     */
    supabase.from('v_leads_nao_lidas').select('lead_id, nao_lidas').eq('empresa_id', empresaId),
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

  // A view já vem agrupada: uma linha por lead, com o total dele.
  const contagem: Record<number, number> = {}
  for (const r of (msgsNaoLidas ?? []) as Array<{ lead_id: number | null; nao_lidas: number | null }>) {
    if (r.lead_id != null) contagem[r.lead_id] = r.nao_lidas ?? 0
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
  // Devolve à esteira quem passou do prazo sem responder. Roda aqui, na abertura
  // do funil, e não num cron: é exatamente quando alguém vai olhar a lista, e
  // não depende do plano da Vercel permitir cron de minuto em minuto. Tem
  // trava de 60s por empresa, então várias abas abrindo juntas não varrem em
  // duplicado. Falhar não pode derrubar a tela.
  //
  // `after()`: roda DEPOIS de a página ir para a tela. A varredura lê até 500
  // leads e 4.000 mensagens, e estava no caminho crítico — todo mundo esperava
  // por ela para ver o funil. O que ela muda (lead voltou para a esteira) chega
  // pelo realtime, que a lista já escuta, então nada se perde por não esperar.
  after(async () => {
    try {
      await devolverLeadsSemResposta(supabase as unknown as SupabaseClient, empresaId)
    } catch (e) {
      console.error('[leads] devolução à esteira falhou:', e)
    }
  })

  const meuRole = usuariosMapped.find((u) => u.id === user?.id)?.role ?? ''
  const restringe = !!meuRole && !permsDoPapel(meuRole, (empresa?.permissoes ?? null) as PermissoesMap | null).verLeadsOutros
  // A ESTEIRA (lead sem responsável) é de todos. O filtro guardava só o que já
  // tinha dono igual ao usuário, então lead novo — que nasce sem responsável —
  // ficava invisível justamente para quem deveria pegá-lo: o vendedor abria o
  // CRM e via o funil vazio. "Não ver lead de outros" é sobre lead DE OUTRO, e
  // lead sem dono não é de ninguém.
  const leadsVisiveis = restringe
    ? leadsComContagem.filter((l) => l.responsavel_id === user?.id || l.responsavel_id == null)
    : leadsComContagem

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
      equipeLabel={SEGMENTOS[normalizarSegmento(empresa?.segmento)].equipeLabel ?? 'Vendedor'}
    />
  )
}
