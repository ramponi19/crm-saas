import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import type { ScoreConfig } from '@/lib/lead-score'

// Salva a config de lead scoring do tenant (configuracoes_sistema.lead_scoring). Admin.
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const config = (await req.json().catch(() => ({}))) as Partial<ScoreConfig>

  const svc = createServiceClient()
  const { error } = await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'lead_scoring', valor: config as never },
    { onConflict: 'empresa_id,chave' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
