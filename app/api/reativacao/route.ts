import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { reativarFrios, type ReativacaoConfig } from '@/lib/reativacao'
import { NextResponse } from 'next/server'

async function exigirAdmin(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: number, userId: string) {
  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', userId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', userId).single(),
  ])
  return usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
}

// { executar:true } → roda a reativação agora. Senão → salva a config. Admin.
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { executar?: boolean } & ReativacaoConfig

  if (body.executar) {
    const svc = createServiceClient()
    const r = await reativarFrios(svc, empresaId)
    return NextResponse.json({ ok: true, ...r })
  }

  const config: ReativacaoConfig = {
    ativo: !!body.ativo,
    dias_frio: Math.max(1, Number(body.dias_frio) || 30),
    incluir_perdidos: !!body.incluir_perdidos,
    cadencia_id: body.cadencia_id ? Number(body.cadencia_id) : null,
  }
  const svc = createServiceClient()
  const { error } = await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'reativacao', valor: config as never },
    { onConflict: 'empresa_id,chave' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
