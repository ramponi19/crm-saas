export type WhatsAppProvider = 'evolution' | 'official'

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

// Estrutura salva no banco — Evolution
export interface EvolutionConfig {
  ativo: boolean
  api_url: string
  api_key: string
  instance: string
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
