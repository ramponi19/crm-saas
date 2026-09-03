import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

  // Persistir a empresa impersonada — fonte de verdade para o RLS (get_empresa_id
  // considera isto quando o usuário é super admin). Via RPC SECURITY DEFINER
  // `set_impersonation`, chamada com o client AUTENTICADO do super admin.
  // Por quê a RPC: só o service_role tem GRANT de UPDATE em `usuarios`, mas o
  // trigger prevent_privilege_escalation exige auth.uid() = super admin (o
  // service role não tem sessão). A RPC roda como owner (passa o grant),
  // preserva auth.uid() do chamador (passa o trigger) e exige super admin.
  const TTL_SECONDS = 60 * 60 * 4 // 4 horas — deve coincidir com maxAge do cookie

  const { error: updErr } = await supabase.rpc('set_impersonation', {
    p_empresa_id: empresaId,
    p_ttl_seconds: TTL_SECONDS,
  })

  if (updErr) {
    return NextResponse.json({ error: `Falha ao iniciar impersonação: ${updErr.message}` }, { status: 500 })
  }

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
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('impersonando_empresa_id')
      .eq('id', user.id)
      .single()

    /**
     * ⚠️ ESTA LINHA JÁ FOI UM BURACO. Não a troque por `set_impersonation()`.
     *
     * Era exatamente isso: `supabase.rpc('set_impersonation')` sem argumento,
     * com um comentário afirmando que o banco tinha `DEFAULT NULL` no primeiro
     * parâmetro. Não tinha — `set_impersonation()` não existe, a chamada
     * falhava, o erro não era conferido, e a rota devolvia 200 tendo limpado
     * apenas o COOKIE.
     *
     * E o cookie não é quem decide: `getEmpresaId()` aqui e `get_empresa_id()`
     * no banco leem a COLUNA. Resultado: "Sair" não saía de nada, e o
     * superadmin ficava dentro do tenant pelas 4h do TTL.
     *
     * `encerrar_impersonacao()` não recebe parâmetro — não há como chamá-la
     * errado — e o erro é conferido abaixo.
     */
    const { error: fimErr } = await supabase.rpc('encerrar_impersonacao')
    if (fimErr) {
      // Falhar em silêncio aqui é o bug original. Se não deu para encerrar, quem
      // clicou precisa saber — senão sai da tela achando que saiu do tenant.
      return NextResponse.json(
        { error: `Não foi possível encerrar a impersonação: ${fimErr.message}` },
        { status: 500 },
      )
    }

    await logSuperAdminAction({
      adminUserId: user.id,
      empresaId: usuario?.impersonando_empresa_id ?? null,
      acao: 'encerrar_impersonacao',
    })
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
