import { NextResponse } from 'next/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Agentes de IA (Tracker) — config dos 3 agentes + KPIs + base de conhecimento + memória.
 * O MOTOR de análise por IA é stub por ora (não consome tokens); ativar/desativar e a
 * base de conhecimento são reais e persistidos.
 */
export const dynamic = 'force-dynamic'

const TIPOS = ['qualificador', 'closer', 'mentor'] as const

export async function GET() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const [{ data: agentes }, { data: conh }, { data: memoria }] = await Promise.all([
    db.from('tracker_agente').select('tipo, ativo, instrucoes, interacoes, leads_qualif').eq('empresa_id', empresaId),
    db.from('tracker_conhecimento').select('*').eq('empresa_id', empresaId).maybeSingle(),
    db.from('tracker_agente_memoria').select('id, lead_id, agente_tipo, resumo, qualificacao, criado_em').eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(20),
  ])

  const byTipo = new Map((agentes ?? []).map((a) => [a.tipo as string, a]))
  const lista = TIPOS.map((tipo) => {
    const a = byTipo.get(tipo) as { ativo?: boolean; instrucoes?: string | null; interacoes?: number; leads_qualif?: number } | undefined
    return { tipo, ativo: !!a?.ativo, instrucoes: a?.instrucoes ?? '', interacoes: a?.interacoes ?? 0, leads_qualif: a?.leads_qualif ?? 0 }
  })

  const ativos = lista.filter((a) => a.ativo).length
  const interacoesHoje = lista.reduce((s, a) => s + (a.interacoes || 0), 0)
  const leadsQualif = lista.reduce((s, a) => s + (a.leads_qualif || 0), 0)

  return NextResponse.json({
    agentes: lista,
    kpis: { ativos, interacoesHoje, leadsQualif, taxaMedia: null },
    conhecimento: conh ?? {},
    memoria: memoria ?? [],
  })
}

export async function PATCH(req: Request) {
  const { empresaId } = await trackerEmpresa()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400 }) }

  const tipo = String(body.tipo ?? '')
  if (!TIPOS.includes(tipo as typeof TIPOS[number])) return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 })

  const patch: Record<string, unknown> = { empresa_id: empresaId, tipo, atualizado_em: new Date().toISOString() }
  if ('ativo' in body) patch.ativo = !!body.ativo
  if ('instrucoes' in body) patch.instrucoes = String(body.instrucoes ?? '').trim() || null

  const db = rastrDb()
  const { error } = await db.from('tracker_agente').upsert(patch, { onConflict: 'empresa_id,tipo' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
