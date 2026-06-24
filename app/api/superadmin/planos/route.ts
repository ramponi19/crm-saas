import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/superadmin'

export async function GET() {
  await requireSuperAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planos_config')
    .select('*')
    .order('ordem')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planos: data })
}

export async function PATCH(req: NextRequest) {
  await requireSuperAdmin()
  const supabase = await createClient()
  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const allowed = ['nome', 'descricao', 'preco_centavos', 'stripe_price_id',
                   'limite_usuarios', 'limite_leads', 'features', 'destaque',
                   'ativo', 'ordem', 'cor']
  const payload = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await supabase
    .from('planos_config')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plano: data })
}
