import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

const PROTEGIDOS = ['/dashboard', '/configuracoes']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { hidden?: string[]; labels?: Record<string, string> }
  const hidden = (body.hidden ?? []).filter((h) => typeof h === 'string' && !PROTEGIDOS.includes(h))
  const labels: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.labels ?? {})) {
    if (typeof v === 'string' && v.trim()) labels[k] = v.trim().slice(0, 40)
  }
  const menu_config = { hidden, labels }

  const service = createServiceClient()
  const { error } = await service.from('empresas').update({ menu_config: menu_config as never }).eq('id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
