import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ENVIO PELA EDGE `webhook-leads` — compartilhado pelo card do lead e pela Inbox
 * (/comunicacao, 04/11/2026). Era local do lead-modal.tsx; saiu daqui sem mudar
 * uma linha do comportamento.
 *
 * ⚠️ Zona sensível (Meta). A entrega real acontece na Edge Function, pela Graph
 * API. NÃO alterar a lógica abaixo sem alinhamento — impacta a aprovação de API
 * da Meta.
 */
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook-leads`

/**
 * Erro do envio com o código da Edge. `timeout_meta` é diferente dos outros: a
 * mensagem JÁ FOI GRAVADA (como falha_envio) e pode até ter chegado ao cliente —
 * a bolha fica na conversa com "Tentar de novo", em vez de sumir e voltar para o
 * campo de texto, o que levaria a mandar duas vezes sem perceber.
 */
export class ErroEnvio extends Error {
  constructor(mensagem: string, readonly codigo?: string) { super(mensagem) }
}

export const ehTimeoutMeta = (e: unknown) => e instanceof ErroEnvio && e.codigo === 'timeout_meta'

/** Tipo de mídia do upload (/api/chat/upload) → `mensagens.tipo`. */
export const TIPO_DB: Record<'image' | 'video' | 'audio', string> = { image: 'imagem', video: 'video', audio: 'audio' }

/**
 * Manda o token da SESSÃO, não a anon key. A anon key é pública (vai no bundle do
 * front), então antes qualquer pessoa que a copiasse conseguia disparar mensagem
 * pela conta do cliente. A Edge exige este token e confere se o usuário pertence
 * à empresa dona do lead.
 */
export async function entregarViaEdge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  action: 'send' | 'send_meta' | 'send_template',
  payload: Record<string, unknown>,
) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Entre novamente para enviar.')

  const res = await fetch(`${FUNCTIONS_URL}?action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (data as { error?: string }).error) {
    const { error, codigo } = data as { error?: string; codigo?: string }
    throw new ErroEnvio(error ?? 'Falha ao enviar a mensagem', codigo)
  }
}
