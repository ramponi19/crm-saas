import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "ESPERANDO RESPOSTA" — UMA DEFINIÇÃO SÓ (11/11/2026, aprovada pelo Lucas).
 *
 * A regra mora no banco (`esperando_resposta`, migração 20261111000300): a
 * última mensagem do CLIENTE, com os canais da loja juntos, chegou nas últimas
 * 72 h e a loja não respondeu depois dela — envio que falhou não conta como
 * resposta. Por negócio principal (contato + loja), ativo, fora de funil
 * interno. Candidatos e não-clientes vêm marcados à parte e ficam fora da conta.
 *
 * Painel do ZapIntel, Assistente, Comunicação e quadro leem a MESMA função —
 * a tela não refaz a conta. Aqui, a leitura para quem está logado
 * (`esperando_resposta_visiveis`: empresa e lojas da sessão).
 */

export interface Esperando {
  negocio_id: number
  contato_id: number
  filial_id: number | null
  /** A mensagem do cliente que está sem resposta. */
  desde: string
  /** Candidato ou não-cliente: fora da conta. */
  a_parte: boolean
}

/** Contato + loja: a chave da conversa da loja, com todos os canais. */
export const chaveContatoLoja = (contato: number, filial: number | null | undefined) => `${contato}:${filial ?? 0}`

export interface MapaEsperando {
  /** negócio → desde quando espera (só os que contam: sem os "à parte"). */
  porNegocio: Map<number, string>
  /** contato + loja → desde quando espera (só os que contam). */
  porContatoLoja: Map<string, string>
}

export const MAPA_VAZIO: MapaEsperando = { porNegocio: new Map(), porContatoLoja: new Map() }

export function mapaDoEsperando(linhas: Esperando[]): MapaEsperando {
  const porNegocio = new Map<number, string>()
  const porContatoLoja = new Map<string, string>()
  for (const l of linhas) {
    if (l.a_parte) continue
    porNegocio.set(Number(l.negocio_id), l.desde)
    porContatoLoja.set(chaveContatoLoja(Number(l.contato_id), l.filial_id == null ? null : Number(l.filial_id)), l.desde)
  }
  return { porNegocio, porContatoLoja }
}

/** Os que esperam resposta, no alcance da sessão (RLS de empresa e loja dentro da função). */
export async function lerEsperando(db: SupabaseClient): Promise<MapaEsperando> {
  const { data, error } = await db.rpc('esperando_resposta_visiveis')
  if (error) throw new Error(`esperando resposta: ${error.message}`)
  return mapaDoEsperando((data ?? []) as Esperando[])
}

/**
 * A conversa (contato + CANAL) é a que tem a mensagem sem resposta? A regra é
 * por contato + loja; da conversa, entra a do canal em que o cliente falou por
 * último — quem escreveu no Instagram e foi respondido no WhatsApp não espera.
 */
export function conversaEsperando(
  c: { contato_id: number | null; filial_id: number | null; ultima_recebida_at: string | null },
  mapa: MapaEsperando,
): boolean {
  if (c.contato_id == null) return false
  const desde = mapa.porContatoLoja.get(chaveContatoLoja(c.contato_id, c.filial_id))
  if (!desde || !c.ultima_recebida_at) return false
  // Mesmo instante (a conversa guarda o created_at da mensagem); 1 s de folga para arredondamento.
  return new Date(c.ultima_recebida_at).getTime() >= new Date(desde).getTime() - 1_000
}
