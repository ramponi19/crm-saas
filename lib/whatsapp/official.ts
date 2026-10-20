import type { SendMessageParams, SendMessageResult } from './types'

/** Canal de envio já resolvido no servidor (ver lib/whatsapp/index.ts). */
export interface CanalEnvio { phoneNumberId: string; token: string; graph: string }

export async function sendViaOfficial(
  canal: CanalEnvio,
  params: SendMessageParams
): Promise<SendMessageResult> {
  try {
    const url = `https://graph.facebook.com/${canal.graph}/${canal.phoneNumberId}/messages`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${canal.token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: { body: params.message },
      }),
      signal: AbortSignal.timeout(12000), // não trava a request se a Graph pendurar
    })

    if (!res.ok) {
      const err = await res.json()
      const msg = err?.error?.message ?? JSON.stringify(err)
      return { success: false, error: msg, provider: 'official' }
    }

    const data = await res.json()
    const messageId = data?.messages?.[0]?.id
    const waId = data?.contacts?.[0]?.wa_id
    return { success: true, messageId, waId, provider: 'official' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      provider: 'official',
    }
  }
}
