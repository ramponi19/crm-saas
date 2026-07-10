import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { reavaliarScores } from '@/lib/scoring-server'
import { NextResponse } from 'next/server'

// Reavalia os scores dos leads e enfileira os que cruzam o threshold na
// cadência-gatilho (botão "Reavaliar agora"). Admin.
export async function POST() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const svc = createServiceClient()
  const r = await reavaliarScores(svc, empresaId)
  return NextResponse.json({ ok: true, ...r })
}
