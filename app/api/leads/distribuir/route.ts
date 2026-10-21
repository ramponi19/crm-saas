import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { distribuirExistente } from '@/lib/distribuicao'
import { NextResponse } from 'next/server'

/**
 * Distribui leads pelas regras (Sprint 2.2).
 * - { leadId }     → distribui um lead (usado no cadastro manual sem responsável).
 * - { esteira }    → distribui TODOS os leads sem dono (lote, admin) — cobre os
 *                    leads que chegaram pela Meta/portais e ficaram na esteira.
 */
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { leadId?: number; esteira?: boolean }
  const svc = createServiceClient()

  if (body.leadId) {
    const { data: lead } = await svc.from('leads')
      .select('id, origem, valor_estimado, responsavel_id, filial_id')
      .eq('id', body.leadId).eq('empresa_id', empresaId).maybeSingle()
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    const responsavel = await distribuirExistente(svc, empresaId, lead)
    return NextResponse.json({ ok: true, responsavel_id: responsavel })
  }

  if (body.esteira) {
    const [{ data: vinculo }, { data: usuario }] = await Promise.all([
      supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
      supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
    ])
    const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
    if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data: leads } = await svc.from('leads')
      .select('id, origem, valor_estimado, responsavel_id, filial_id')
      .eq('empresa_id', empresaId).eq('ativo', true).is('responsavel_id', null).limit(500)

    // Um lead que falha não para os outros; a falha volta contada (antes o erro da
    // gravação nem era conferido e o lead contava como distribuído).
    let distribuidos = 0
    let falhas = 0
    for (const l of leads ?? []) {
      try {
        const r = await distribuirExistente(svc, empresaId, l)
        if (r) distribuidos++
      } catch (e) {
        falhas++
        console.error('[leads/distribuir]', e instanceof Error ? e.message : e)
      }
    }
    return NextResponse.json({ ok: falhas === 0, distribuidos, falhas })
  }

  return NextResponse.json({ error: 'Nada a distribuir' }, { status: 400 })
}
