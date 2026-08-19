import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { mesclarTaxas, type TaxasComissao } from '@/lib/comissao-imob'

/**
 * Taxas de comissão da imobiliária (`configuracoes_sistema` → chave `comissao_imob`).
 *
 * Só dono e admin: é a régua que define quanto cada corretor recebe.
 *
 * E a mudança vale para os negócios SEGUINTES. Os já fechados guardam a própria taxa
 * congelada — senão mexer aqui reescreveria o que foi combinado meses atrás, e o
 * corretor veria a comissão dele mudar sozinha.
 */
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { empresaId } = auth

  const bruto = (await req.json().catch(() => ({}))) as Partial<TaxasComissao>
  // `mesclarTaxas` já descarta negativo e não-número, caindo no padrão de mercado.
  const taxas = mesclarTaxas(bruto)

  /**
   * As partes não podem passar de 100% da comissão.
   *
   * Captador e vendedor levando 60% cada faria a imobiliária pagar 20% do próprio
   * bolso em cada negócio — e descobrir isso no fim do mês, pela conta que não fecha.
   */
  if (taxas.parte_captador + taxas.parte_vendedor > 100) {
    return NextResponse.json({
      error: 'Captador e vendedor somam mais de 100% da comissão. Reveja a divisão.',
    }, { status: 400 })
  }

  const svc = createServiceClient()
  const { error } = await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'comissao_imob', valor: taxas as never },
    { onConflict: 'empresa_id,chave' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, taxas })
}
