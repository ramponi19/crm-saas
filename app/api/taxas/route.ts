import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('taxas_pagamento')
    .select('forma_pagamento, bandeira, parcelas, percentual_taxa')
    .eq('ativo', true)
    .order('forma_pagamento').order('bandeira').order('parcelas')

  return NextResponse.json({ taxas: data ?? [] })
}
