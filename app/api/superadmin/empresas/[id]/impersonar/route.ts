import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSuperAdminAction, requireSuperAdminApi } from '@/lib/superadmin'

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

  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error
  const { userId, supabase } = ctx

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
    adminUserId: userId,
    empresaId,
    acao: 'impersonar',
    detalhes: { empresa_nome: empresa.nome },
  })

  // Persistir a empresa impersonada na coluna do usuário — é a fonte de verdade
  // para o RLS (get_empresa_id considera isto quando o usuário é super admin).
  const TTL_SECONDS = 60 * 60 * 4 // 4 horas — deve coincidir com maxAge do cookie
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()

  const serviceClient = createServiceClient()
  await serviceClient
    .from('usuarios')
    .update({ impersonando_empresa_id: empresaId, impersonando_expires_at: expiresAt })
    .eq('id', userId)

  const res = NextResponse.json({ ok: true, empresa: empresa.nome })
  res.cookies.set(IMPERSONATE_COOKIE, String(empresaId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  })
  return res
}

// Encerrar impersonação
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const serviceClient = createServiceClient()
    await serviceClient
      .from('usuarios')
      .update({ impersonando_empresa_id: null, impersonando_expires_at: null })
      .eq('id', user.id)
  }

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
