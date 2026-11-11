/**
 * Chamada servidor do app → Edge `webhook-leads` nos caminhos SEM usuário logado
 * (Automatize: `send_template_automacao`; Transmissão: `send_template_transmissao`).
 *
 * Até 11/11/2026 o app mandava a SUPABASE_SERVICE_ROLE_KEY e a Edge comparava por igualdade
 * de texto com a chave que o Supabase injeta nela — válidas as duas, mas não a MESMA string:
 * no smoke da Transmissão todo envio voltou 401. Agora é um segredo só desta ponte,
 * EDGE_INTERNAL_SECRET (Vercel Production + segredos da Edge), no cabeçalho
 * `x-edge-internal-secret`. Sem a variável, o cabeçalho vai vazio e a Edge recusa (falha fechada).
 */
export const CABECALHO_EDGE_INTERNA = 'x-edge-internal-secret'

export function urlEdgeWebhook(action: string): string {
  // EDGE_WEBHOOK_URL só no teste local (Edge rodando no deno); em produção é a Edge do Supabase.
  const base = process.env.EDGE_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook-leads`
  return `${base}?action=${action}`
}

export function cabecalhosEdgeInterna(): Record<string, string> {
  return { 'Content-Type': 'application/json', [CABECALHO_EDGE_INTERNA]: (process.env.EDGE_INTERNAL_SECRET ?? '').trim() }
}
