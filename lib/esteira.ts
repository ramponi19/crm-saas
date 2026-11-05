import type { SupabaseClient } from '@supabase/supabase-js'
import { minutosUteis, HORARIO_PADRAO, type HorarioLoja } from './horario-util'
import { conversasDosLeads } from './leads'

/**
 * Devolução de lead à esteira por falta de resposta.
 *
 * Regra combinada com o dono da loja:
 *  - só RESPONDER o cliente segura o lead. Abrir a conversa e sair não segura —
 *    senão bastava clicar em tudo de manhã para travar a esteira o dia inteiro.
 *  - o relógio corre só no HORÁRIO DE FUNCIONAMENTO. Lead que chega 22h não é
 *    devolvido 22h15 com a loja fechada e ninguém tendo falhado.
 *  - devolve para a esteira (sem dono), não para outro vendedor: quem distribui
 *    é a tela de Distribuição, que já existe e tem critério próprio.
 */

export interface ConfigDevolucao { ativo: boolean; minutos: number }
export const DEVOLUCAO_PADRAO: ConfigDevolucao = { ativo: true, minutos: 30 }

interface LeadDono {
  id: number; responsavel_id: string; responsavel_desde: string | null
  created_at: string | null; devolucoes: number | null
}

/** `string`: com relação embutida o parser de tipos do supabase-js estoura. */
const SELECT_DONO: string = 'id, contato_id, filial_id, responsavel_id, created_at, devolucoes, dados, etapa:funil_etapas!etapa_id!inner(slug)'
type NegocioDono = {
  id: number; contato_id: number; filial_id: number | null; responsavel_id: string
  created_at: string | null; devolucoes: number | null; dados: { _lead?: { responsavel_desde?: string | null } } | null
}

/** Evita varrer a cada render do servidor quando várias abas abrem juntas. */
const ultimaVarredura = new Map<number, number>()
const INTERVALO_MS = 60_000

export interface ResultadoDevolucao { devolvidos: number; avaliados: number }

export async function devolverLeadsSemResposta(
  db: SupabaseClient,
  empresaId: number,
  opts: { forcar?: boolean } = {},
): Promise<ResultadoDevolucao> {
  const agora = Date.now()
  if (!opts.forcar) {
    const ultima = ultimaVarredura.get(empresaId) ?? 0
    if (agora - ultima < INTERVALO_MS) return { devolvidos: 0, avaliados: 0 }
  }
  ultimaVarredura.set(empresaId, agora)

  const [{ data: cfgRow }, { data: horarioRow }] = await Promise.all([
    db.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'devolucao_esteira').maybeSingle(),
    db.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'horario').maybeSingle(),
  ])
  const cfg: ConfigDevolucao = { ...DEVOLUCAO_PADRAO, ...((cfgRow?.valor ?? {}) as Partial<ConfigDevolucao>) }
  if (!cfg.ativo || !(cfg.minutos > 0)) return { devolvidos: 0, avaliados: 0 }
  const horario: HorarioLoja = { ...HORARIO_PADRAO, ...((horarioRow?.valor ?? {}) as Partial<HorarioLoja>) }

  // Etapas finais não entram: lead ganho ou perdido não tem resposta pendente.
  const { data: etapasFinais } = await db.from('funil_etapas')
    .select('slug').eq('empresa_id', empresaId).in('tipo', ['ganho', 'perdido'])
  const finais = (etapasFinais ?? []).map((e: { slug: string }) => e.slug)

  // Sem reatribuir o builder (`q = q.not(...)`): o TypeScript recursa no tipo
  // encadeado do PostgREST e estoura com "type instantiation excessively deep".
  // Direto no negócio (a view `leads` caiu): a etapa entra pelo slug, com !inner.
  const base = db.from('negocios')
    .select(SELECT_DONO)
    .eq('empresa_id', empresaId).eq('ativo', true).not('responsavel_id', 'is', null)
    .limit(500)
  const { data: linhas } = finais.length
    ? await base.not('etapa.slug', 'in', `(${finais.join(',')})`)
    : await base
  const negocios = (linhas ?? []) as unknown as NegocioDono[]
  if (!negocios.length) return { devolvidos: 0, avaliados: 0 }
  const leads: (LeadDono & { contato_id: number; filial_id: number | null })[] = negocios.map((n) => ({
    id: n.id, contato_id: n.contato_id, filial_id: n.filial_id, responsavel_id: n.responsavel_id,
    responsavel_desde: n.dados?._lead?.responsavel_desde ?? null, created_at: n.created_at, devolucoes: n.devolucoes,
  }))

  // Última mensagem de cada lado, por lead: a conversa do contato na loja, só no
  // negócio principal (a mesma regra da antiga `lead_mensagens`). Antes vinha das
  // 4000 mensagens mais novas da empresa; a conversa já guarda as duas marcas.
  // Sem as conversas não dá para saber quem respondeu: a varredura para aqui (sem
  // elas, todo lead pareceria "pegou e sumiu" e seria devolvido).
  let conversas: Awaited<ReturnType<typeof conversasDosLeads>>
  try {
    conversas = await conversasDosLeads(db, empresaId, leads)
  } catch (e) {
    console.error('[esteira] conversas dos leads:', e)
    return { devolvidos: 0, avaliados: 0 }
  }
  const ultima = new Map<number, { recebida?: string; enviada?: string }>()
  for (const [id, c] of conversas) {
    ultima.set(id, { recebida: c.ultima_recebida_at ?? undefined, enviada: c.ultima_enviada_at ?? undefined })
  }

  const vencidos: number[] = []
  for (const l of leads) {
    const marco = marcoDeCobranca(l, ultima.get(l.id))
    if (!marco) continue
    if (minutosUteis(new Date(marco), new Date(agora), horario) >= cfg.minutos) vencidos.push(l.id)
  }
  if (!vencidos.length) return { devolvidos: 0, avaliados: leads.length }

  // Condicional no responsável: se alguém assumiu entre a leitura e a escrita,
  // a linha não é tocada — o dono novo não perde o lead por corrida.
  let devolvidos = 0
  for (const id of vencidos) {
    const lead = leads.find((l) => l.id === id)!
    // Colunas do negócio. `responsavel_desde` fica no JSON: a view gravava o null
    // com jsonb_strip_nulls, que não apagava a chave; o próximo dono a reescreve.
    const { data } = await db.from('negocios')
      .update({
        responsavel_id: null,
        devolvido_em: new Date(agora).toISOString(),
        devolucoes: (lead.devolucoes ?? 0) + 1,
      })
      .eq('id', id).eq('responsavel_id', lead.responsavel_id).select('id')
    if (data?.length) devolvidos++
  }
  return { devolvidos, avaliados: leads.length }
}

/**
 * O cliente está esperando resposta AGORA? — versão que só olha o lead.
 *
 * Mesma regra do `marcoDeCobranca`, lendo as colunas que o trigger do banco
 * mantém (`ultima_recebida_at` / `ultima_enviada_at`). Existe para que o card do
 * kanban e a ausência decidam igual à esteira, sem varrer mensagens e sem
 * inventar um segundo conceito de "pendente".
 */
export function aguardandoResposta(lead: {
  ultima_recebida_at?: string | null; ultima_enviada_at?: string | null
}): boolean {
  const recebida = lead.ultima_recebida_at
  if (!recebida) return false
  const enviada = lead.ultima_enviada_at
  return !enviada || new Date(enviada) < new Date(recebida)
}

/**
 * A partir de quando o vendedor está devendo resposta.
 *
 * - cliente escreveu depois da última resposta → conta da mensagem do cliente.
 * - nunca houve mensagem nenhuma → conta de quando ele assumiu (pegou e sumiu).
 * - ele já respondeu e o cliente não voltou → não deve nada, não devolve.
 */
export function marcoDeCobranca(
  lead: { responsavel_desde: string | null; created_at: string | null },
  msgs: { recebida?: string; enviada?: string } | undefined,
): string | null {
  const assumiu = lead.responsavel_desde ?? lead.created_at
  const recebida = msgs?.recebida
  const enviada = msgs?.enviada

  if (recebida && (!enviada || new Date(recebida) > new Date(enviada))) {
    // Cobra do mais recente entre a pergunta do cliente e a posse do lead: quem
    // acabou de assumir um lead com mensagem de ontem tem o prazo cheio.
    if (assumiu && new Date(assumiu) > new Date(recebida)) return assumiu
    return recebida
  }
  if (!recebida && !enviada) return assumiu
  return null
}
