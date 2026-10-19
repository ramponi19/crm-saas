import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decifrarToken } from '@/lib/canais/crypto'
import type { SendMessageParams, SendMessageResult } from './types'
import { sendViaOfficial, type CanalEnvio } from './official'

const GRAPH = process.env.META_GRAPH_VERSION || 'v25.0'

/**
 * O canal de WhatsApp pelo qual a loja envia — o MESMO que o chat usa
 * (canais_conectados, token cifrado), escolhido pela mesma regra da Edge
 * webhook-leads (`canalDaLoja`): o canal da loja de quem está enviando e, se a
 * loja não tiver, o canal ativo mais recente da empresa.
 *
 * Até 19/10/2026 isto lia `configuracoes_sistema.whatsapp_official`, um token
 * copiado à mão em junho que já tinha caducado ("the user logged out"): o envio
 * do PDV e da OS falhava calado. Não há volta para lá.
 */
async function canalWhatsApp(empresaId: number): Promise<CanalEnvio | null> {
  const sessao = await createClient()
  const { data: filial } = await sessao.rpc('filial_gravacao', { p_empresa: empresaId })
  const svc = createServiceClient()

  const buscar = async (filialId: number | null) => {
    let q = svc.from('canais_conectados')
      .select('external_id, access_token_enc')
      .eq('empresa_id', empresaId).eq('tipo', 'whatsapp').eq('status', 'ativo')
    if (filialId != null) q = q.eq('filial_id', filialId)
    const { data } = await q.order('conectado_em', { ascending: false }).limit(1)
    return data?.[0] ?? null
  }

  const linha = (typeof filial === 'number' ? await buscar(filial) : null) ?? await buscar(null)
  if (!linha?.external_id || !linha.access_token_enc) return null
  try {
    return { phoneNumberId: String(linha.external_id), token: decifrarToken(linha.access_token_enc), graph: GRAPH }
  } catch {
    return null
  }
}

export async function sendWhatsApp(params: SendMessageParams & { empresaId: number }): Promise<SendMessageResult> {
  const canal = await canalWhatsApp(params.empresaId)
  if (!canal) {
    return { success: false, error: 'WhatsApp não conectado. Conecte em Administração > Integrações.', provider: 'official' }
  }
  return sendViaOfficial(canal, params)
}
