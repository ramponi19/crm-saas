import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * "LIBERAR LOTE DO DIA" (24/11/2026; migração 20261124001600). Universal.
 *
 * O mesmo que o agendamento do banco faz de hora em hora: por loja da empresa, se a liberação diária está ligada,
 * a loja abre hoje e já abriu, não é o primeiro dia da semana (quando a opção pede) e o lote de hoje ainda não saiu,
 * entrega os leads da esteira com cliente recente a quem está na roleta, como atribuição manual (fora da devolução
 * automática), com o motivo "liberação diária da esteira". Só dono ou administrador (ou superadmin).
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })

  const service = createServiceClient()
  const { data: eu } = await supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle()
  if (!eu?.is_super_admin) {
    const { data: vinc } = await service.from('empresa_usuarios').select('role')
      .eq('empresa_id', empresaId).eq('usuario_id', user.id).eq('ativo', true).maybeSingle()
    if (!vinc || !['owner', 'admin'].includes(vinc.role)) {
      return NextResponse.json({ error: 'Só o dono ou um administrador libera o lote.' }, { status: 403 })
    }
  }

  const { data, error } = await service.rpc('core_liberar_lote_esteira' as never, { p_empresa: empresaId, p_por: user.id } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lojas = (data ?? {}) as Record<string, { liberados?: number; pulado?: string }>
  const liberados = Object.values(lojas).reduce((t, l) => t + (l.liberados ?? 0), 0)
  return NextResponse.json({ ok: true, liberados, lojas })
}
