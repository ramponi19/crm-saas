import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildProvider } from '@/lib/payments'
import { decryptCredenciais } from '@/lib/payments/crypto'
import type { ProviderId } from '@/lib/payments/types'

const PROVIDERS_VALIDOS: ProviderId[] = ['mercadopago', 'asaas', 'efibank', 'pagseguro']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  if (!PROVIDERS_VALIDOS.includes(provider as ProviderId)) {
    return NextResponse.json({ error: 'Provedor inválido' }, { status: 400 })
  }

  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k] = v })

  const supabase = createServiceClient()

  try {
    // Precisamos de credenciais de algum tenant deste provedor para consultar o status.
    // Estratégia: primeiro extrair o provider_ref do payload de forma leve, então
    // localizar a cobrança e o tenant dono — e usar as credenciais desse tenant.
    // Para isso, processamos o webhook com um provider "stateless" quando possível.

    // 1) Tentar identificar a cobrança a partir do payload bruto.
    //    Cada provedor expõe o ref de forma diferente; usamos o provider do tenant
    //    correto. Como não sabemos o tenant ainda, primeiro tentamos parsear o ref.
    const refPreliminar = extrairRefPreliminar(provider as ProviderId, rawBody)
    if (!refPreliminar) {
      // Sem ref reconhecível — aceitamos para não causar retries infinitos.
      return NextResponse.json({ ok: true, ignorado: true })
    }

    // 2) Localizar a cobrança e o tenant
    const { data: cobranca } = await supabase
      .from('cobrancas')
      .select('id, empresa_id, status')
      .eq('provider', provider)
      .eq('provider_ref', refPreliminar)
      .single()

    if (!cobranca) {
      return NextResponse.json({ ok: true, naoEncontrada: true })
    }

    // 3) Carregar credenciais do tenant para validar/consultar
    const { data: config } = await supabase
      .from('tenant_payment_config')
      .select('credenciais_cipher, modo')
      .eq('empresa_id', cobranca.empresa_id)
      .single()

    let credenciais: Record<string, string> = {}
    if (config?.credenciais_cipher) {
      try { credenciais = decryptCredenciais(config.credenciais_cipher) } catch {}
    }

    const adapter = buildProvider(provider as ProviderId, credenciais, config?.modo ?? 'producao')
    const result = await adapter.processarWebhook(rawBody, headers)

    if (result.status && result.status !== cobranca.status) {
      await supabase
        .from('cobrancas')
        .update({
          status: result.status,
          pago_em: result.status === 'confirmado' ? (result.pagoEm ?? new Date().toISOString()) : null,
        })
        .eq('id', cobranca.id)

      // Conciliação automática no Financeiro quando confirmado
      if (result.status === 'confirmado') {
        await registrarLancamentoFinanceiro(supabase, cobranca.empresa_id, cobranca.id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[payments/webhook/${provider}]`, err)
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 })
  }
}

/** Extrai o provider_ref de forma leve do payload, por provedor. */
function extrairRefPreliminar(provider: ProviderId, rawBody: string): string | null {
  try {
    const body = JSON.parse(rawBody)
    switch (provider) {
      case 'mercadopago': return body.data?.id ? String(body.data.id) : null
      case 'asaas':       return body.payment?.id ?? null
      case 'efibank':     return body.pix?.[0]?.txid ?? null
      case 'pagseguro':   return body.id ?? null
      default:            return null
    }
  } catch {
    return null
  }
}

/** Cria um lançamento de receita no Financeiro a partir de uma cobrança confirmada. */
async function registrarLancamentoFinanceiro(
  supabase: ReturnType<typeof createServiceClient>,
  empresaId: number,
  cobrancaId: number
) {
  const { data: cobranca } = await supabase
    .from('cobrancas')
    .select('valor, descricao, provider')
    .eq('id', cobrancaId)
    .single()

  if (!cobranca) return

  // Evitar duplicidade: checar se já existe lançamento para esta cobrança
  // (vínculo genérico referencia_id + referencia_tp = 'cobranca')
  const { data: existente } = await supabase
    .from('lancamentos_financeiros')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('referencia_tp', 'cobranca')
    .eq('referencia_id', cobrancaId)
    .maybeSingle()

  if (existente) return

  const hoje = new Date().toISOString().slice(0, 10)
  await supabase.from('lancamentos_financeiros').insert({
    empresa_id: empresaId,
    tipo: 'receita',
    valor: cobranca.valor,
    descricao: cobranca.descricao ?? `Pagamento via ${cobranca.provider}`,
    data_venc: hoje,
    data_pgto: hoje,
    status: 'pago',
    categoria: 'Vendas',
    forma_pgto: cobranca.provider,
    referencia_id: cobrancaId,
    referencia_tp: 'cobranca',
  })
}
