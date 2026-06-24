import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getPaymentProvider, type CriarCobrancaInput } from '@/lib/payments'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  const body = await req.json() as Omit<CriarCobrancaInput, 'empresaId'>

  if (!body.tipo || !body.valor || body.valor <= 0) {
    return NextResponse.json({ error: 'Tipo e valor são obrigatórios' }, { status: 400 })
  }

  try {
    const provider = await getPaymentProvider(empresaId)
    const result = await provider.criarCobranca({ ...body, empresaId })

    // Persistir a cobrança
    const { data: cobranca, error } = await supabase
      .from('cobrancas')
      .insert({
        empresa_id: empresaId,
        provider: provider.id,
        provider_ref: result.providerRef,
        tipo: body.tipo,
        valor: body.valor,
        status: result.status,
        descricao: body.descricao ?? null,
        cliente_id: body.clienteId ?? null,
        venda_id: body.vendaId ?? null,
        os_id: body.osId ?? null,
        qr_code: result.qrCode ?? null,
        qr_code_base64: result.qrCodeBase64 ?? null,
        link_pagamento: result.linkPagamento ?? null,
        linha_digitavel: result.linhaDigitavel ?? null,
        vencimento: result.vencimento ?? null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, cobranca })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar cobrança'
    console.error('[payments/charge]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
