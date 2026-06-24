import type {
  PaymentProvider,
  CriarCobrancaInput,
  CobrancaResult,
  EstornoResult,
  StatusCobranca,
  WebhookResult,
  Credenciais,
} from '../types'

function apiBase(modo: string) {
  return modo === 'sandbox'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3'
}

function mapStatus(s: string): StatusCobranca {
  switch (s) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH': return 'confirmado'
    case 'REFUNDED':
    case 'REFUND_REQUESTED': return 'estornado'
    case 'OVERDUE': return 'expirado'
    default: return 'pendente'
  }
}

const TIPO_ASAAS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'BOLETO',
  cartao: 'CREDIT_CARD',
  link: 'UNDEFINED',
}

export class AsaasProvider implements PaymentProvider {
  readonly id = 'asaas' as const
  private apiKey: string
  private base: string

  constructor(cred: Credenciais, modo: string = 'producao') {
    if (!cred.api_key) throw new Error('Asaas: api_key ausente')
    this.apiKey = cred.api_key
    this.base = apiBase(modo)
  }

  private headers() {
    return { access_token: this.apiKey, 'Content-Type': 'application/json' }
  }

  /** Garante um cliente Asaas a partir dos dados do pagador. */
  private async getCustomer(input: CriarCobrancaInput): Promise<string> {
    const doc = input.pagador?.documento
    const body = {
      name: input.pagador?.nome ?? 'Cliente',
      email: input.pagador?.email,
      cpfCnpj: doc,
      mobilePhone: input.pagador?.telefone,
    }
    const res = await fetch(`${this.base}/customers`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Asaas: ${data.errors?.[0]?.description ?? 'erro ao criar cliente'}`)
    return data.id
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResult> {
    const customer = await this.getCustomer(input)
    const vencimento = input.vencimento ?? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

    const res = await fetch(`${this.base}/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        customer,
        billingType: TIPO_ASAAS[input.tipo] ?? 'UNDEFINED',
        value: input.valor,
        dueDate: vencimento,
        description: input.descricao,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Asaas: ${data.errors?.[0]?.description ?? 'erro ao criar cobrança'}`)

    const result: CobrancaResult = {
      providerRef: data.id,
      status: mapStatus(data.status),
      linkPagamento: data.invoiceUrl ?? null,
      linhaDigitavel: data.identificationField ?? null,
      vencimento: data.dueDate ?? null,
      raw: data,
    }

    // Para Pix, buscar o QR Code
    if (input.tipo === 'pix') {
      const qrRes = await fetch(`${this.base}/payments/${data.id}/pixQrCode`, { headers: this.headers() })
      if (qrRes.ok) {
        const qr = await qrRes.json()
        result.qrCode = qr.payload ?? null
        result.qrCodeBase64 = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null
      }
    }

    return result
  }

  async consultarStatus(providerRef: string): Promise<StatusCobranca> {
    const res = await fetch(`${this.base}/payments/${providerRef}`, { headers: this.headers() })
    if (!res.ok) return 'pendente'
    const data = await res.json()
    return mapStatus(data.status)
  }

  async estornar(providerRef: string): Promise<EstornoResult> {
    const res = await fetch(`${this.base}/payments/${providerRef}/refund`, {
      method: 'POST', headers: this.headers(),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Asaas: ${data.errors?.[0]?.description ?? 'erro ao estornar'}`)
    return { status: 'estornado', raw: data }
  }

  async processarWebhook(rawBody: string): Promise<WebhookResult> {
    let body: { event?: string; payment?: { id?: string; status?: string; paymentDate?: string } }
    try { body = JSON.parse(rawBody) } catch { return { providerRef: null, status: null } }

    const pay = body.payment
    if (!pay?.id) return { providerRef: null, status: null }
    const status = mapStatus(pay.status ?? '')
    return {
      providerRef: pay.id,
      status,
      pagoEm: status === 'confirmado' ? (pay.paymentDate ?? new Date().toISOString()) : null,
    }
  }
}
