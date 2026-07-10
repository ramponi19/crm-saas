import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { dataDaAcao } from '@/lib/cadencia'
import { NextResponse } from 'next/server'

// Inscreve um lead numa cadência (manual, a partir do card do lead).
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { leadId?: number; cadenciaId?: number }
  if (!body.leadId || !body.cadenciaId) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })

  // Lead (RLS garante a empresa) — usa o responsável atual como dono da inscrição.
  const { data: lead } = await supabase.from('leads').select('id, responsavel_id').eq('id', body.leadId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Já inscrito e ativo nessa cadência?
  const { data: existe } = await supabase.from('cadencia_inscricoes')
    .select('id').eq('cadencia_id', body.cadenciaId).eq('lead_id', body.leadId).eq('status', 'ativa').maybeSingle()
  if (existe) return NextResponse.json({ error: 'Lead já está nesta cadência' }, { status: 409 })

  const { data: passos } = await supabase.from('cadencia_passos')
    .select('ordem, dia_offset').eq('cadencia_id', body.cadenciaId).order('ordem', { ascending: true }).limit(1)
  const primeiro = passos?.[0]
  if (!primeiro) return NextResponse.json({ error: 'Cadência sem passos' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('cadencia_inscricoes').insert({
    empresa_id: empresaId,
    cadencia_id: body.cadenciaId,
    lead_id: body.leadId,
    responsavel_id: lead.responsavel_id ?? user.id,
    status: 'ativa',
    passo_ordem: primeiro.ordem,
    proxima_acao_em: dataDaAcao(nowIso, primeiro.dia_offset),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
