import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('taxas_pagamento')
    .select('forma_pagamento, bandeira, parcelas, percentual_taxa')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('forma_pagamento').order('bandeira').order('parcelas')

  return NextResponse.json({ taxas: data ?? [] })
}
