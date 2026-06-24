// ============================================================
// lib/payments/types.ts — contratos genéricos, agnósticos de provedor
// ============================================================

export type ProviderId = 'manual' | 'mercadopago' | 'asaas' | 'efibank' | 'pagseguro'

export type TipoCobranca = 'pix' | 'boleto' | 'link' | 'cartao'

export type StatusCobranca =
  | 'pendente'
  | 'confirmado'
  | 'estornado'
  | 'expirado'
  | 'falhou'

export interface CriarCobrancaInput {
  empresaId: number
  tipo: TipoCobranca
  valor: number
  descricao?: string
  clienteId?: number | null
  vendaId?: number | null
  osId?: number | null
  vencimento?: string | null // ISO date para boleto
  /** Dados do pagador, exigidos por alguns provedores (ex.: boleto) */
  pagador?: {
    nome?: string
    email?: string
    documento?: string // CPF/CNPJ
    telefone?: string
  }
}

export interface CobrancaResult {
  providerRef: string
  status: StatusCobranca
  qrCode?: string | null          // Pix copia-e-cola
  qrCodeBase64?: string | null    // imagem do QR (data URI)
  linkPagamento?: string | null
  linhaDigitavel?: string | null  // boleto
  vencimento?: string | null
  raw?: unknown                   // resposta bruta do provedor (debug)
}

export interface EstornoResult {
  status: StatusCobranca
  raw?: unknown
}

/** Resultado normalizado do processamento de um webhook de provedor. */
export interface WebhookResult {
  /** Referência da cobrança no provedor, para casar com nossa tabela. */
  providerRef: string | null
  status: StatusCobranca | null
  pagoEm?: string | null
}

/**
 * Contrato que todo adapter de provedor deve implementar.
 * As credenciais já vêm descriptografadas no construtor do adapter.
 */
export interface PaymentProvider {
  readonly id: ProviderId
  criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResult>
  consultarStatus(providerRef: string): Promise<StatusCobranca>
  estornar(providerRef: string): Promise<EstornoResult>
  /**
   * Processa o corpo de um webhook do provedor. Recebe o payload bruto e os
   * headers para validação de assinatura. Retorna o resultado normalizado.
   */
  processarWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>
}

/** Credenciais por provedor — shape livre, validado por cada adapter. */
export type Credenciais = Record<string, string>
