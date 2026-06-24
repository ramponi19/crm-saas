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
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com'
}

function mapStatus(s: string): StatusCobranca {
  switch (s) {
    case 'PAID':
    case 'AVAILABLE': return 'confirmado'
    case 'REFUNDED': return 'estornado'
    case 'CANCELED':
    case 'DECLINED': return 'falhou'
    default: return 'pendente' // WAITING, IN_ANALYSIS, AUTHORIZED
  }
}

export class PagSeguroProvider implements PaymentProvider {
  readonly id = 'pagseguro' as const
  private token: string
  private base: string

  constructor(cred: Credenciais, modo: string = 'producao') {
    if (!cred.token) throw new Error('PagSeguro: token ausente')
    this.token = cred.token
    this.base = apiBase(modo)
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResult> {
    // PagSeguro Orders API com QR Code Pix ou link
    const reference = `emp${input.empresaId}-${Date.now()}`
    const valorCents = Math.round(input.valor * 100)

    const body: Record<string, unknown> = {
      reference_id: reference,
      customer: {
        name: input.pagador?.nome ?? 'Cliente',
        email: input.pagador?.email ?? 'cliente@example.com',
        tax_id: input.pagador?.documento,
      },
      items: [{
        name: input.descricao ?? 'Cobrança',
        quantity: 1,
        unit_amount: valorCents,
      }],
    }

    if (input.tipo === 'pix') {
      body.qr_codes = [{ amount: { value: valorCents } }]
    }

    const res = await fetch(`${this.base}/orders`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(`PagSeguro: ${data.error_messages?.[0]?.description ?? 'erro ao criar cobrança'}`)
    }

    const qr = data.qr_codes?.[0]
    const linkPay = qr?.links?.find((l: { rel: string; href: string }) => l.rel === 'PAY')?.href
      ?? data.links?.find((l: { rel: string; href: string }) => l.rel?.includes('PAY'))?.href
      ?? null

    return {
      providerRef: data.id,
      status: 'pendente',
      qrCode: qr?.text ?? null,
      qrCodeBase64: qr?.links?.find((l: { rel: string; media: string; href: string }) => l.media === 'image/png')?.href ?? null,
      linkPagamento: linkPay,
      raw: data,
    }
  }

  async consultarStatus(providerRef: string): Promise<StatusCobranca> {
    const res = await fetch(`${this.base}/orders/${providerRef}`, { headers: this.headers() })
    if (!res.ok) return 'pendente'
    const data = await res.json()
    const charge = data.charges?.[0]
    return charge ? mapStatus(charge.status) : 'pendente'
  }

  async estornar(providerRef: string): Promise<EstornoResult> {
    // Estorno requer o charge_id; consultamos a order primeiro.
    const orderRes = await fetch(`${this.base}/orders/${providerRef}`, { headers: this.headers() })
    const order = await orderRes.json()
    const chargeId = order.charges?.[0]?.id
    if (!chargeId) throw new Error('PagSeguro: cobrança não encontrada para estorno')
    const res = await fetch(`${this.base}/charges/${chargeId}/cancel`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({}),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`PagSeguro: ${data.error_messages?.[0]?.description ?? 'erro ao estornar'}`)
    return { status: 'estornado', raw: data }
  }

  async processarWebhook(rawBody: string): Promise<WebhookResult> {
    let body: { id?: string; charges?: Array<{ status?: string; paid_at?: string }> }
    try { body = JSON.parse(rawBody) } catch { return { providerRef: null, status: null } }
    if (!body.id) return { providerRef: null, status: null }
    const charge = body.charges?.[0]
    const status = charge ? mapStatus(charge.status ?? '') : null
    return {
      providerRef: body.id,
      status,
      pagoEm: status === 'confirmado' ? (charge?.paid_at ?? new Date().toISOString()) : null,
    }
  }
}
