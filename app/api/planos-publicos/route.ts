import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { excedeuLimite } from '@/lib/rate-limit'

/**
 * Planos públicos para vitrine/cadastro — mesma fonte do checkout (planos_config).
 * Só expõe campos de marketing (nome, preço, features), nunca dados sensíveis.
 * Filtra planos ativos e pagos (Free fica de fora da oferta pública).
 */
export async function GET(req: Request) {
  const svc = createServiceClient()
  if (await excedeuLimite(svc, 'planos-publicos', req, 120)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em alguns minutos.' }, { status: 429 })
  }
  try {
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
