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
async function canalWhatsApp(empresaId: number): Promise<(CanalEnvio & { canalId: number }) | null> {
  const sessao = await createClient()
  const { data: filial } = await sessao.rpc('filial_gravacao', { p_empresa: empresaId })
  const svc = createServiceClient()

  const buscar = async (filialId: number | null) => {
    let q = svc.from('canais_conectados')
      .select('id, external_id, access_token_enc')
      .eq('empresa_id', empresaId).eq('tipo', 'whatsapp').eq('status', 'ativo')
    if (filialId != null) q = q.eq('filial_id', filialId)
    const { data } = await q.order('conectado_em', { ascending: false }).limit(1)
    return data?.[0] ?? null
  }

  const linha = (typeof filial === 'number' ? await buscar(filial) : null) ?? await buscar(null)
  if (!linha?.external_id || !linha.access_token_enc) return null
  try {
    return {
      canalId: Number(linha.id),
      phoneNumberId: String(linha.external_id), token: decifrarToken(linha.access_token_enc), graph: GRAPH,
    }
  } catch {
    return null
  }
}

export async function sendWhatsApp(
  params: SendMessageParams & { empresaId: number; usuarioId?: string | null },
): Promise<SendMessageResult> {
  const canal = await canalWhatsApp(params.empresaId)
  if (!canal) {
    return { success: false, error: 'WhatsApp não conectado. Conecte em Administração > Integrações.', provider: 'official' }
  }
  const result = await sendViaOfficial(canal, params)
  if (result.success) await registrarEnviada(params, canal.canalId, result)
  return result
}

/**
 * O QUE SAI PELO PDV E PELA OS FICA NA CONVERSA, como o que sai pelo chat.
 *
 * Até 20/10/2026 este envio não gravava nada: o Lucas recebeu o recibo no
 * celular e o modal do lead não mostrava a saída. Grava pela mesma
 * mensagem_registrar da Edge, na conversa do contato com este canal — a loja
 * é a do canal. Mensagem enviada não reabre nem cria negócio (um recibo não
 * pode reabrir o lead de quem acabou de comprar): sem negócio na loja, ela
 * fica na conversa e aparece no card quando houver um.
 *
 * A mensagem JÁ SAIU quando isto roda: falhar aqui não muda a resposta, só
 * registra o erro.
 */
async function registrarEnviada(
  params: SendMessageParams & { empresaId: number; usuarioId?: string | null },
  canalId: number,
  result: SendMessageResult,
) {
  const identidade = result.waId ?? params.to.replace(/\D/g, '')
  const { error } = await createServiceClient().rpc('mensagem_registrar' as never, {
    p_empresa: params.empresaId, p_canal_id: canalId, p_external_id: result.messageId ?? null,
    p_dados: {
      identidade, origem: 'whatsapp', direcao: 'enviada', conteudo: params.message, tipo: 'texto', lida: true,
      usuario_id: params.usuarioId ?? null,
      // Primeiro estado; o webhook de status depois promove para entregue/lida.
      status_entrega: 'enviada', status_em: new Date().toISOString(),
    },
  } as never)
  if (error) console.error('[whatsapp/send] gravar mensagem enviada:', error.message)
}
