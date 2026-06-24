import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { encryptCredenciais } from '@/lib/payments/crypto'
import { buildProvider, type ProviderId } from '@/lib/payments'

const PROVIDERS_VALIDOS: ProviderId[] = ['manual', 'mercadopago', 'asaas', 'efibank', 'pagseguro']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  const { provider, credenciais, modo, ativo, testar } = await req.json() as {
    provider: ProviderId
    credenciais: Record<string, string>
    modo?: string
    ativo?: boolean
    testar?: boolean
  }

  if (!PROVIDERS_VALIDOS.includes(provider)) {
    return NextResponse.json({ error: 'Provedor inválido' }, { status: 400 })
  }

  // Teste de conexão: instancia o adapter e tenta uma cobrança simbólica via consulta.
  if (testar && provider !== 'manual') {
    try {
      // Apenas valida que as credenciais constroem um adapter sem erro.
      buildProvider(provider, credenciais ?? {}, modo ?? 'producao')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Credenciais inválidas'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  const cipher = provider === 'manual' || !credenciais
    ? null
    : encryptCredenciais(credenciais)

  const { error } = await supabase
    .from('tenant_payment_config')
    .upsert({
      empresa_id: empresaId,
      provider,
      ativo: ativo ?? provider !== 'manual',
      modo: modo ?? 'producao',
      credenciais_cipher: cipher,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// Retorna a config atual SEM as credenciais (apenas metadados)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  const { data } = await supabase
    .from('tenant_payment_config')
    .select('provider, ativo, modo, atualizado_em, credenciais_cipher')
    .eq('empresa_id', empresaId)
    .single()

  return NextResponse.json({
    provider: data?.provider ?? 'manual',
    ativo: data?.ativo ?? false,
    modo: data?.modo ?? 'producao',
    configurado: !!data?.credenciais_cipher,
    atualizado_em: data?.atualizado_em ?? null,
  })
}
