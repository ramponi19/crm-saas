import type { SupabaseClient } from '@supabase/supabase-js'
import { minutosUteis, HORARIO_PADRAO, type HorarioLoja } from './horario-util'

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
  const base = db.from('leads')
    .select('id, responsavel_id, responsavel_desde, created_at, devolucoes')
    .eq('empresa_id', empresaId).eq('ativo', true).not('responsavel_id', 'is', null)
    .limit(500)
  const { data: leads } = finais.length
    ? await base.not('kanban_status', 'in', `(${finais.join(',')})`)
    : await base
  if (!leads?.length) return { devolvidos: 0, avaliados: 0 }

  const ids = (leads as LeadDono[]).map((l) => l.id)
  const { data: msgs } = await db.from('lead_mensagens')
    .select('lead_id, direcao, created_at')
    .eq('empresa_id', empresaId).in('lead_id', ids)
    .order('created_at', { ascending: false }).limit(4000)

  // Última mensagem de cada lado, por lead.
  const ultima = new Map<number, { recebida?: string; enviada?: string }>()
  for (const m of (msgs ?? []) as { lead_id: number; direcao: string; created_at: string }[]) {
    const reg = ultima.get(m.lead_id) ?? {}
    if (m.direcao === 'recebida') { if (!reg.recebida) reg.recebida = m.created_at }
    else if (!reg.enviada) reg.enviada = m.created_at
    ultima.set(m.lead_id, reg)
  }

  const vencidos: number[] = []
  for (const l of leads as LeadDono[]) {
    const marco = marcoDeCobranca(l, ultima.get(l.id))
    if (!marco) continue
    if (minutosUteis(new Date(marco), new Date(agora), horario) >= cfg.minutos) vencidos.push(l.id)
  }
  if (!vencidos.length) return { devolvidos: 0, avaliados: leads.length }

  // Condicional no responsável: se alguém assumiu entre a leitura e a escrita,
  // a linha não é tocada — o dono novo não perde o lead por corrida.
  let devolvidos = 0
  for (const id of vencidos) {
    const lead = (leads as LeadDono[]).find((l) => l.id === id)!
    const { data } = await db.from('leads')
      .update({
        responsavel_id: null, responsavel_desde: null,
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
