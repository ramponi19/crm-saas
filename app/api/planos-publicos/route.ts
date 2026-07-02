import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Planos públicos para vitrine/cadastro — mesma fonte do checkout (planos_config).
 * Só expõe campos de marketing (nome, preço, features), nunca dados sensíveis.
 * Filtra planos ativos e pagos (Free fica de fora da oferta pública).
 */
export async function GET() {
  try {
    const svc = createServiceClient()
    const { data, error } = await svc
      .from('planos_config')
      .select('id, nome, descricao, preco_centavos, features, destaque, ordem')
      .eq('ativo', true)
      .gt('preco_centavos', 0)
      .order('ordem')
    if (error) throw error
    return NextResponse.json({ plans: data ?? [] })
  } catch {
    return NextResponse.json({ plans: [] })
  }
}
