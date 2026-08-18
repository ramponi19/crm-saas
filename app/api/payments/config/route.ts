import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { encryptCredenciais } from '@/lib/payments/crypto'
import { buildProvider, type ProviderId } from '@/lib/payments'

const PROVIDERS_VALIDOS: ProviderId[] = ['manual', 'mercadopago', 'asaas', 'efibank', 'pagseguro']

export async function POST(req: NextRequest) {
  /**
   * Dono ou admin, não "qualquer logado".
   *
   * Esta rota grava a credencial de RECEBIMENTO da loja. Com só a checagem de
   * sessão, um vendedor podia apontar a conta de pagamentos para a chave Pix dele
   * — o link de cobrança continuaria funcionando e o dinheiro entraria em outro
   * lugar. A tela é de admin, mas a tela não é a tranca.
   */
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth
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
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth
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
