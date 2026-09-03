import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'

/**
 * As duas regras da loja: o bônus e o corte de bateria.
 *
 * O corte não é decoração. Hoje o checklist manda conferir a saúde da bateria
 * "abaixo do corte da sua loja" e não diz qual é — então cada vendedor decide de
 * cabeça, e dois vendedores dão dois valores para o mesmo aparelho. Com o corte
 * gravado, a tela mostra o número e a conversa acaba.
 */

interface Body {
  bonus_seminovo?: number | string
  corte_bateria?: number | string
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await cotacaoDeTrocaLiberada())) return NextResponse.json({ error: 'Módulo não liberado' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Body

  const patch: Record<string, unknown> = { empresa_id: empresaId, atualizado_em: new Date().toISOString() }
  if ('bonus_seminovo' in b) patch.bonus_seminovo = Math.max(0, Number(b.bonus_seminovo) || 0)
  if ('corte_bateria' in b) {
    // 0–100 porque é percentual de saúde de bateria. Fora disso a avaria de
    // bateria nunca se aplicaria (corte 0) ou se aplicaria sempre (corte > 100).
    const n = Math.round(Number(b.corte_bateria) || 0)
    patch.corte_bateria = Math.min(100, Math.max(0, n))
  }

  const { error } = await supabase.from('troca_regras')
    .upsert(patch as never, { onConflict: 'empresa_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
