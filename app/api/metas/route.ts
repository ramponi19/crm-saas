import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// Define a meta mensal de vendas de um vendedor (Fase 4.4). Owner/admin.
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { usuarioId?: string; mesAno?: string; meta?: number }
  if (!body.usuarioId || !body.mesAno) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  const meta = Math.max(0, Number(body.meta) || 0)

  const svc = createServiceClient()
  const { data: existente } = await svc
    .from('metas_comissoes')
    .select('id')
    .eq('empresa_id', empresaId).eq('usuario_id', body.usuarioId).eq('mes_ano', body.mesAno)
    .maybeSingle()

  if (existente) {
    const { error } = await svc.from('metas_comissoes').update({ meta_vendas_valor: meta }).eq('id', existente.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await svc.from('metas_comissoes').insert({
      empresa_id: empresaId, usuario_id: body.usuarioId, mes_ano: body.mesAno,
      meta_vendas_valor: meta, meta_vendas_qtd: 0, percentual_comissao_padrao: 0,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
