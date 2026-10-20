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
  /** O número como a Meta o reconhece (contacts[0].wa_id) — é a identidade do contato. */
  waId?: string
  error?: string
  provider: WhatsAppProvider
}
