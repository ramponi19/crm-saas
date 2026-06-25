import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireSuperAdmin } from '@/lib/superadmin'
import type { Database } from '@/types/database'

type PlanoUpdate = Database['public']['Tables']['planos_config']['Update']

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
  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const allowed = ['nome', 'descricao', 'preco_centavos', 'stripe_price_id',
                   'limite_usuarios', 'limite_leads', 'features', 'destaque',
                   'ativo', 'ordem', 'cor']
  const payload = Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k))
  )

  // Validate shape of typed fields before they reach the DB
  if ('features' in payload) {
    if (!Array.isArray(payload.features) ||
        !(payload.features as unknown[]).every(f => typeof f === 'string')) {
      return NextResponse.json(
        { error: 'features deve ser um array de strings' },
        { status: 400 }
      )
    }
  }
  if ('preco_centavos' in payload &&
      (typeof payload.preco_centavos !== 'number' || !Number.isInteger(payload.preco_centavos) || (payload.preco_centavos as number) < 0)) {
    return NextResponse.json({ error: 'preco_centavos deve ser um inteiro não-negativo' }, { status: 400 })
  }
  if ('limite_usuarios' in payload &&
      payload.limite_usuarios !== null &&
      (typeof payload.limite_usuarios !== 'number' || !Number.isInteger(payload.limite_usuarios) || (payload.limite_usuarios as number) < 1)) {
    return NextResponse.json({ error: 'limite_usuarios deve ser um inteiro positivo ou null' }, { status: 400 })
  }
  if ('limite_leads' in payload &&
      payload.limite_leads !== null &&
      (typeof payload.limite_leads !== 'number' || !Number.isInteger(payload.limite_leads) || (payload.limite_leads as number) < 1)) {
    return NextResponse.json({ error: 'limite_leads deve ser um inteiro positivo ou null' }, { status: 400 })
  }
  if ('ordem' in payload &&
      (typeof payload.ordem !== 'number' || !Number.isInteger(payload.ordem))) {
    return NextResponse.json({ error: 'ordem deve ser um inteiro' }, { status: 400 })
  }
  if ('ativo' in payload && typeof payload.ativo !== 'boolean') {
    return NextResponse.json({ error: 'ativo deve ser boolean' }, { status: 400 })
  }
  if ('destaque' in payload && typeof payload.destaque !== 'boolean') {
    return NextResponse.json({ error: 'destaque deve ser boolean' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { data, error } = await serviceClient
    .from('planos_config')
    .update(payload as PlanoUpdate)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plano: data })
}
