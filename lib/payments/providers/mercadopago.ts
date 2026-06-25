import { createHmac, timingSafeEqual } from 'crypto'
import type {
  PaymentProvider,
  CriarCobrancaInput,
  CobrancaResult,
  EstornoResult,
  StatusCobranca,
  WebhookResult,
  Credenciais,
} from '../types'

const MP_API = 'https://api.mercadopago.com'

// Mapeia status do MP → nosso status genérico
function mapStatus(mpStatus: string): StatusCobranca {
  switch (mpStatus) {
    case 'approved': return 'confirmado'
    case 'refunded':
    case 'charged_back': return 'estornado'
    case 'cancelled':
    case 'rejected': return 'falhou'
    case 'expired': return 'expirado'
    default: return 'pendente' // pending, in_process, authorized
  }
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly id = 'mercadopago' as const
  private accessToken: string
  private webhookSecret: string | null

  constructor(cred: Credenciais) {
    if (!cred.access_token) throw new Error('Mercado Pago: access_token ausente')
    this.accessToken = cred.access_token
    this.webhookSecret = cred.webhook_secret ?? null
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    }
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResult> {
    if (input.tipo === 'pix') {
      // Pix via Payments API
      const res = await fetch(`${MP_API}/v1/payments`, {
        method: 'POST',
        headers: { ...this.headers(), 'X-Idempotency-Key': `${input.empresaId}-${Date.now()}` },
        body: JSON.stringify({
          transaction_amount: input.valor,
          description: input.descricao ?? 'Cobrança',
          payment_method_id: 'pix',
          payer: {
            email: input.pagador?.email ?? 'cliente@example.com',
            first_name: input.pagador?.nome,
            identification: input.pagador?.documento
              ? { type: input.pagador.documento.length > 11 ? 'CNPJ' : 'CPF', number: input.pagador.documento }
              : undefined,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(`Mercado Pago: ${data.message ?? 'erro ao criar Pix'}`)
      const tx = data.point_of_interaction?.transaction_data
      return {
        providerRef: String(data.id),
        status: mapStatus(data.status),
        qrCode: tx?.qr_code ?? null,
        qrCodeBase64: tx?.qr_code_base64 ? `data:image/png;base64,${tx.qr_code_base64}` : null,
        raw: data,
      }
    }

    // Link de pagamento (Checkout Pro / Preference)
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        items: [{
          title: input.descricao ?? 'Cobrança',
          quantity: 1,
          unit_price: input.valor,
          currency_id: 'BRL',
        }],
        payer: { email: input.pagador?.email, name: input.pagador?.nome },
        metadata: { empresa_id: input.empresaId },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Mercado Pago: ${data.message ?? 'erro ao criar link'}`)
    return {
      providerRef: String(data.id),
      status: 'pendente',
      linkPagamento: data.init_point ?? null,
      raw: data,
    }
  }

  async consultarStatus(providerRef: string): Promise<StatusCobranca> {
    const res = await fetch(`${MP_API}/v1/payments/${providerRef}`, { headers: this.headers() })
    if (!res.ok) return 'pendente'
    const data = await res.json()
    return mapStatus(data.status)
  }

  async estornar(providerRef: string): Promise<EstornoResult> {
    const res = await fetch(`${MP_API}/v1/payments/${providerRef}/refunds`, {
      method: 'POST',
      headers: { ...this.headers(), 'X-Idempotency-Key': `refund-${providerRef}-${Date.now()}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Mercado Pago: ${data.message ?? 'erro ao estornar'}`)
    return { status: 'estornado', raw: data }
  }

  async processarWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    // MP assina com x-signature: "ts=<timestamp>,v1=<hmac>"
    // Template: "id:<data_id>;request-id:<x-request-id>;ts:<timestamp>;"
    if (this.webhookSecret) {
      const xSig = headers['x-signature'] ?? ''
      const xReqId = headers['x-request-id'] ?? ''
      const tsMatch = xSig.match(/ts=([^,]+)/)
      const v1Match = xSig.match(/v1=([^,]+)/)
      if (!tsMatch || !v1Match) throw new Error('Mercado Pago: x-signature ausente ou malformado')

      const ts = tsMatch[1]
      const v1 = v1Match[1]

      let dataId = ''
      try { dataId = String((JSON.parse(rawBody) as { data?: { id?: string } }).data?.id ?? '') } catch {}

      const template = `id:${dataId};request-id:${xReqId};ts:${ts};`
      const expected = createHmac('sha256', this.webhookSecret).update(template).digest('hex')
      try {
        if (!timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))) {
          throw new Error('Mercado Pago: assinatura inválida')
        }
      } catch (e) {
        if ((e as Error).message === 'Mercado Pago: assinatura inválida') throw e
        throw new Error('Mercado Pago: assinatura inválida')
      }
    } else {
      console.warn('[mercadopago] webhook_secret não configurado — validação de assinatura ignorada')
    }

    // MP envia { type, data: { id } }. Consultamos o pagamento para obter status atual.
    let body: { type?: string; action?: string; data?: { id?: string } }
    try { body = JSON.parse(rawBody) } catch { return { providerRef: null, status: null } }

    const paymentId = body.data?.id
    if (!paymentId || (body.type && body.type !== 'payment')) {
      return { providerRef: null, status: null }
    }

    const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, { headers: this.headers() })
    if (!res.ok) return { providerRef: String(paymentId), status: null }
    const data = await res.json()
    const status = mapStatus(data.status)
    return {
      providerRef: String(paymentId),
      status,
      pagoEm: status === 'confirmado' ? (data.date_approved ?? new Date().toISOString()) : null,
    }
  }
}
