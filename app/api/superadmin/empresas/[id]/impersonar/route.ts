import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logSuperAdminAction } from '@/lib/superadmin'

const IMPERSONATE_COOKIE = 'impersonating_empresa_id'

// Iniciar impersonação de uma empresa
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (!usuario?.is_super_admin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Confirmar que a empresa existe (RLS de super admin permite a leitura)
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, nome')
    .eq('id', empresaId)
    .single()

  if (!empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  }

  await logSuperAdminAction({
    adminUserId: user.id,
    empresaId,
    acao: 'impersonar',
    detalhes: { empresa_nome: empresa.nome },
  })

  const res = NextResponse.json({ ok: true, empresa: empresa.nome })
  res.cookies.set(IMPERSONATE_COOKIE, String(empresaId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 4, // 4 horas
  })
  return res
}

// Encerrar impersonação
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(IMPERSONATE_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
