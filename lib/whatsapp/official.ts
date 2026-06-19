import type { OfficialConfig, SendMessageParams, SendMessageResult } from './types'

export async function sendViaOfficial(
  config: OfficialConfig,
  params: SendMessageParams
): Promise<SendMessageResult> {
  try {
    const url = `${config.api_url}/${config.api_version}/${config.phone_number_id}/messages`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.access_token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: { body: params.message },
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      const msg = err?.error?.message ?? JSON.stringify(err)
      return { success: false, error: msg, provider: 'official' }
    }

    const data = await res.json()
    const messageId = data?.messages?.[0]?.id
    return { success: true, messageId, provider: 'official' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      provider: 'official',
    }
  }
}
