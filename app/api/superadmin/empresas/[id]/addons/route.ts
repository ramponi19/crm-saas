import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { rastrDb } from '@/lib/rastreamento/db'
import { NextResponse } from 'next/server'

/**
 * Liga/desliga o complemento pago ZapIntel por empresa.
 *
 * Persiste na tabela AUTOCONTIDA `complementos_empresa` — nunca no schema do CRM. Assim
 * o módulo /zapintel continua removível sem tocar em `empresas`.
 * Acesso só de super admin (mesma convenção de /overrides).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { zapintel_ativo?: boolean }
  const patch: Record<string, unknown> = { empresa_id: empresaId, atualizado_em: new Date().toISOString() }
  if ('zapintel_ativo' in body) patch.zapintel_ativo = !!body.zapintel_ativo
  if (!('zapintel_ativo' in body)) {
    return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })
  }

  // upsert: cria a linha na 1ª ativação (colunas não enviadas herdam o default
  // false) e, nas seguintes, altera só o que veio no corpo.
  const { data, error } = await rastrDb()
    .from('complementos_empresa')
    .upsert(patch, { onConflict: 'empresa_id' })
    .select('zapintel_ativo')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'toggle_complemento_zapintel',
    detalhes: patch,
  })
  return NextResponse.json({ ok: true, addon: data })
}
