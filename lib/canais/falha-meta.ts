import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A META ACEITOU E DEPOIS RECUSOU (11/11/2026).
 *
 * Envio de modelo volta 200 com o id da Meta e, segundos depois, o webhook de status pode trazer
 * "failed" (sem forma de pagamento, número sem WhatsApp...). A Edge passa o item da fila para
 * 'falhou' quando o status chega (falhaDepoisDeAceita, webhook-leads). Mas o status pode chegar
 * ANTES de o servidor do app gravar 'enviada' + mensagem_id — e aí a Edge não acha o item. Por
 * isso quem grava 'enviada'/'executada' confere a mensagem logo depois: se já está 'falhou', passa
 * o item para falha. As duas pontas conferem a outra depois de escrever; qualquer ordem fecha.
 *
 * Falha não conta no teto por hora nem na regra "mesmo modelo em 7 dias" (as duas só olham
 * 'enviada' / 'executada').
 */
export const PREFIXO_RECUSA_META = 'A Meta recusou depois de aceitar: '

export const motivoRecusaMeta = (erro: string | null | undefined) =>
  `${PREFIXO_RECUSA_META}${(erro ?? '').trim() || 'sem motivo informado'}`.slice(0, 300)

/** A mensagem já voltou 'falhou' da Meta? Devolve o motivo para gravar no item, ou null. */
export async function recusadaPelaMeta(svc: SupabaseClient, mensagemId: number | null | undefined): Promise<string | null> {
  if (!mensagemId) return null
  const { data } = await svc.from('mensagens').select('status_entrega, erro_envio').eq('id', mensagemId).maybeSingle()
  const m = data as { status_entrega: string | null; erro_envio: string | null } | null
  return m?.status_entrega === 'falhou' ? motivoRecusaMeta(m.erro_envio) : null
}
