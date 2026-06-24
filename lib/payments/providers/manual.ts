import type {
  PaymentProvider,
  CriarCobrancaInput,
  CobrancaResult,
  EstornoResult,
  StatusCobranca,
  WebhookResult,
} from '../types'

/**
 * Provedor manual: não integra com nenhuma API externa. Serve de fallback
 * para tenants que ainda não configuraram um provedor real. Cada cobrança
 * fica 'pendente' e é confirmada manualmente pelo usuário no Financeiro.
 */
export class ManualProvider implements PaymentProvider {
  readonly id = 'manual' as const

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResult> {
    return {
      providerRef: `manual-${Date.now()}`,
      status: 'pendente',
      // sem QR, link ou boleto — registro manual
      raw: { manual: true, valor: input.valor, tipo: input.tipo },
    }
  }

  async consultarStatus(): Promise<StatusCobranca> {
    // Sem integração: o status é controlado manualmente no banco.
    return 'pendente'
  }

  async estornar(): Promise<EstornoResult> {
    return { status: 'estornado' }
  }

  async processarWebhook(): Promise<WebhookResult> {
    return { providerRef: null, status: null }
  }
}
