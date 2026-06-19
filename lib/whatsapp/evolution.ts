import type { EvolutionConfig, SendMessageParams, SendMessageResult } from './types'

export async function sendViaEvolution(
  config: EvolutionConfig,
  params: SendMessageParams
): Promise<SendMessageResult> {
  try {
    const url = `${config.api_url}/message/sendText/${config.instance}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.api_key,
      },
      body: JSON.stringify({
        number: params.to,
        text: params.message,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: err, provider: 'evolution' }
    }

    const data = await res.json()
    return {
      success: true,
      messageId: data?.key?.id ?? data?.id,
      provider: 'evolution',
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      provider: 'evolution',
    }
  }
}
