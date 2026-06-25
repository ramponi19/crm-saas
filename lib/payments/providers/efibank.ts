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

function apiBase(modo: string) {
  return modo === 'sandbox'
    ? 'https://pix-h.api.efipay.com.br'
    : 'https://pix.api.efipay.com.br'
}

function mapStatus(s: string): StatusCobranca {
  switch (s) {
    case 'CONCLUIDA': return 'confirmado'
    case 'REMOVIDA_PELO_USUARIO_RECEBEDOR':
    case 'REMOVIDA_PELO_PSP': return 'falhou'
    default: return 'pendente' // ATIVA
  }
}

export class EfiBankProvider implements PaymentProvider {
  readonly id = 'efibank' as const
  private clientId: string
  private clientSecret: string
  private chavePix: string
  private base: string
  private token: string | null = null

  constructor(cred: Credenciais, modo: string = 'producao') {
    if (!cred.client_id || !cred.client_secret || !cred.chave_pix) {
      throw new Error('Efí Bank: client_id, client_secret e chave_pix são obrigatórios')
    }
    this.clientId = cred.client_id
    this.clientSecret = cred.client_secret
    this.chavePix = cred.chave_pix
    this.base = apiBase(modo)
  }

  // Efí exige certificado mTLS em produção; aqui usamos OAuth básico.
  // O certificado é tratado na camada de configuração do tenant (fora do MVP).
  private async getToken(): Promise<string> {
    if (this.token) return this.token
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    const res = await fetch(`${this.base}/oauth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Efí Bank: ${data.error_description ?? 'falha na autenticação'}`)
    this.token = data.access_token
    return this.token as string
  }

  private async authHeaders() {
    const token = await this.getToken()
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaResult> {
    if (input.tipo !== 'pix') {
      throw new Error('Efí Bank: apenas Pix é suportado nesta integração')
    }
    const headers = await this.authHeaders()

    // Criar cobrança imediata
    const res = await fetch(`${this.base}/v2/cob`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        calendario: { expiracao: 3600 },
        devedor: input.pagador?.documento
          ? { cpf: input.pagador.documento, nome: input.pagador.nome ?? 'Cliente' }
          : undefined,
        valor: { original: input.valor.toFixed(2) },
        chave: this.chavePix,
        solicitacaoPagador: input.descricao,
      }),
    })
    const cob = await res.json()
    if (!res.ok) throw new Error(`Efí Bank: ${cob.mensagem ?? 'erro ao criar cobrança'}`)

    // Gerar QR Code a partir do loc.id
    let qrCode: string | null = null
    let qrCodeBase64: string | null = null
    if (cob.loc?.id) {
      const qrRes = await fetch(`${this.base}/v2/loc/${cob.loc.id}/qrcode`, { headers })
      if (qrRes.ok) {
        const qr = await qrRes.json()
        qrCode = qr.qrcode ?? null
        qrCodeBase64 = qr.imagemQrcode ?? null
      }
    }

    return {
      providerRef: cob.txid,
      status: mapStatus(cob.status),
      qrCode,
      qrCodeBase64,
      raw: cob,
    }
  }

  async consultarStatus(providerRef: string): Promise<StatusCobranca> {
    const headers = await this.authHeaders()
    const res = await fetch(`${this.base}/v2/cob/${providerRef}`, { headers })
    if (!res.ok) return 'pendente'
    const data = await res.json()
    return mapStatus(data.status)
  }

  async estornar(providerRef: string): Promise<EstornoResult> {
    const headers = await this.authHeaders()
    // Devolução de Pix exige o e2eid; consultamos a cobrança primeiro.
    const cobRes = await fetch(`${this.base}/v2/cob/${providerRef}`, { headers })
    const cob = await cobRes.json()
    const e2eid = cob?.pix?.[0]?.endToEndId
    if (!e2eid) throw new Error('Efí Bank: pagamento não encontrado para estorno')
    const valor = cob?.pix?.[0]?.valor
    const idDevolucao = `dev${Date.now()}`.slice(0, 35)
    const res = await fetch(`${this.base}/v2/pix/${e2eid}/devolucao/${idDevolucao}`, {
      method: 'PUT', headers, body: JSON.stringify({ valor }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`Efí Bank: ${data.mensagem ?? 'erro ao estornar'}`)
    return { status: 'estornado', raw: data }
  }

  async processarWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    // Efí Bank envia x-gw-signature: HMAC-SHA256(rawBody, clientSecret) em hex
    const sig = headers['x-gw-signature']
    if (sig) {
      const expected = createHmac('sha256', this.clientSecret).update(rawBody).digest('hex')
      try {
        if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
          throw new Error('Efí Bank: assinatura inválida')
        }
      } catch (e) {
        if ((e as Error).message === 'Efí Bank: assinatura inválida') throw e
        // Buffer de tamanho diferente — assinatura inválida
        throw new Error('Efí Bank: assinatura inválida')
      }
    } else {
      console.warn('[efibank] x-gw-signature ausente — validação de assinatura ignorada')
    }

    let body: { pix?: Array<{ txid?: string; horario?: string }> }
    try { body = JSON.parse(rawBody) } catch { return { providerRef: null, status: null } }
    const pix = body.pix?.[0]
    if (!pix?.txid) return { providerRef: null, status: null }
    return {
      providerRef: pix.txid,
      status: 'confirmado',
      pagoEm: pix.horario ?? new Date().toISOString(),
    }
  }
}
