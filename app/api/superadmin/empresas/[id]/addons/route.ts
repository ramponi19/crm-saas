import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { MODULO_INTELIGENCIA } from '@/lib/empresa-config'
import { NextResponse } from 'next/server'

/**
 * Liga/desliga o complemento pago ZapIntel por empresa.
 *
 * Desde 21/10/2026 é o módulo 'inteligencia' de `empresa_modulos` (origem addon),
 * como o core v1 desenhou — era a tabela à parte `complementos_empresa`. A
 * resposta mantém o formato `{ addon: { zapintel_ativo } }` que a tela espera.
 * Acesso só de super admin (mesma convenção de /overrides).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { zapintel_ativo?: boolean }
  if (!('zapintel_ativo' in body)) {
    return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })
  }
  const ativo = !!body.zapintel_ativo

  // upsert: cria a linha na 1ª ativação; nas seguintes, só liga/desliga.
  const svc = createServiceClient()
  const { data: atual } = await svc.from('empresa_modulos').select('modulo')
    .eq('empresa_id', empresaId).eq('modulo', MODULO_INTELIGENCIA).maybeSingle()
  const { data, error } = atual
    ? await svc.from('empresa_modulos').update({ ativo, updated_at: new Date().toISOString() })
        .eq('empresa_id', empresaId).eq('modulo', MODULO_INTELIGENCIA).select('ativo').single()
    : await svc.from('empresa_modulos').insert({
        empresa_id: empresaId, modulo: MODULO_INTELIGENCIA, origem: 'addon', ativo, instalado_por: auth.userId,
      }).select('ativo').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'toggle_complemento_zapintel',
    detalhes: { empresa_id: empresaId, zapintel_ativo: ativo },
  })
  return NextResponse.json({ ok: true, addon: { zapintel_ativo: !!data?.ativo } })
}
