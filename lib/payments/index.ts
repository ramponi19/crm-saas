import type { PaymentProvider, ProviderId } from './types'
import { decryptCredenciais } from './crypto'
import { ManualProvider } from './providers/manual'
import { MercadoPagoProvider } from './providers/mercadopago'
import { AsaasProvider } from './providers/asaas'
import { EfiBankProvider } from './providers/efibank'
import { PagSeguroProvider } from './providers/pagseguro'
import { createClient } from '@/lib/supabase/server'

export * from './types'

interface TenantConfig {
  provider: ProviderId
  ativo: boolean
  modo: string
  credenciais: Record<string, string>
}

/** Carrega a configuração de pagamento de um tenant, descriptografando as credenciais. */
export async function getTenantPaymentConfig(empresaId: number): Promise<TenantConfig> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenant_payment_config')
    .select('provider, ativo, modo, credenciais_cipher')
    .eq('empresa_id', empresaId)
    .single()

  if (!data) {
    return { provider: 'manual', ativo: false, modo: 'producao', credenciais: {} }
  }

  let credenciais: Record<string, string> = {}
  if (data.credenciais_cipher) {
    try {
      credenciais = decryptCredenciais(data.credenciais_cipher)
    } catch (err) {
      console.error('[payments] falha ao descriptografar credenciais:', err)
    }
  }

  return {
    provider: data.provider as ProviderId,
    ativo: data.ativo,
    modo: data.modo,
    credenciais,
  }
}

/** Instancia o adapter do provedor a partir de id, credenciais e modo. */
export function buildProvider(
  provider: ProviderId,
  credenciais: Record<string, string>,
  modo: string
): PaymentProvider {
  switch (provider) {
    case 'mercadopago': return new MercadoPagoProvider(credenciais)
    case 'asaas':       return new AsaasProvider(credenciais, modo)
    case 'efibank':     return new EfiBankProvider(credenciais, modo)
    case 'pagseguro':   return new PagSeguroProvider(credenciais, modo)
    case 'manual':
    default:            return new ManualProvider()
  }
}

/** Retorna o provedor de pagamento ativo de um tenant pronto para uso. */
export async function getPaymentProvider(empresaId: number): Promise<PaymentProvider> {
  const config = await getTenantPaymentConfig(empresaId)
  if (!config.ativo) return new ManualProvider()
  return buildProvider(config.provider, config.credenciais, config.modo)
}
