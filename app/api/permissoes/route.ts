import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { PAPEIS_EDITAVEIS, type PermissoesMap } from '@/lib/permissoes'

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

  const body = await req.json().catch(() => ({})) as { permissoes?: PermissoesMap }
  const inp = body.permissoes ?? {}
  // Só persiste os papéis editáveis (owner é sempre total).
  const clean: PermissoesMap = {}
  for (const papel of PAPEIS_EDITAVEIS) {
    const v = inp[papel]
    if (v) clean[papel] = {
      verFinanceiro: !!v.verFinanceiro, verRelatorios: !!v.verRelatorios, verLeadsOutros: !!v.verLeadsOutros,
      excluir: !!v.excluir, exportar: !!v.exportar,
      descontoMax: Math.max(0, Math.min(100, Number(v.descontoMax) || 0)),
    }
  }

  const service = createServiceClient()
  const { error } = await service.from('empresas').update({ permissoes: clean as never }).eq('id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
