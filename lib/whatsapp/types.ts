// Só existe um provedor de WhatsApp: a API oficial da Meta. A Evolution foi
// aposentada em 31/07/2026 — ela acessa o WhatsApp por fora dos termos e expõe o
// número do lojista a banimento sem recurso. O tipo continua sendo um união de
// um só membro para não espalhar mudança de assinatura por quem já o importa.
export type WhatsAppProvider = 'official'

export interface SendMessageParams {
  to: string        // número no formato 5511999999999
  message: string
  provider?: WhatsAppProvider  // se omitido, usa o provedor ativo
}

export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
  provider: WhatsAppProvider
}

// Estrutura salva no banco — API Oficial Meta
export interface OfficialConfig {
  ativo: boolean
  provider: 'meta'
  phone_number_id: string
  waba_id: string
  access_token: string
  webhook_verify_token: string
  api_version: string
  api_url: string
}
