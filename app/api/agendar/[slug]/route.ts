import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { escolherResponsavel } from '@/lib/distribuicao'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

// Agendamento online do paciente (público). Cria o lead + a consulta (visita).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id').eq('slug', slug).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404, headers: CORS })

  const b = (await req.json().catch(() => ({}))) as { nome?: string; telefone?: string; data_hora?: string; observacoes?: string }
  const nome = (b.nome || '').trim()
  const dataHora = b.data_hora ? new Date(b.data_hora) : null
  if (!nome || !dataHora || isNaN(dataHora.getTime())) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400, headers: CORS })
  if (dataHora.getTime() < Date.now()) return NextResponse.json({ error: 'Horário no passado' }, { status: 400, headers: CORS })

  // Evita marcar em cima de outra consulta no mesmo horário.
  const { data: conflito } = await svc.from('visitas')
    .select('id').eq('empresa_id', empresa.id).eq('data_hora', dataHora.toISOString()).neq('status', 'cancelada').maybeSingle()
  if (conflito) return NextResponse.json({ error: 'Horário indisponível' }, { status: 409, headers: CORS })

  const responsavel = await escolherResponsavel(svc, empresa.id, { origem: 'agendamento', valor_estimado: null })

  const { data: lead } = await svc.from('leads').insert({
    empresa_id: empresa.id, nome, telefone: (b.telefone || '').trim() || null,
    origem: 'agendamento', kanban_status: 'novo', ativo: true, responsavel_id: responsavel,
    observacoes: 'Agendamento online',
  }).select('id').single()

  const { error } = await svc.from('visitas').insert({
    empresa_id: empresa.id, lead_id: lead?.id ?? null, corretor_id: responsavel,
    data_hora: dataHora.toISOString(), status: 'agendada',
    observacoes: b.observacoes?.trim() || 'Agendado pelo paciente (online)',
  })
  if (error) return NextResponse.json({ error: 'Falha ao agendar' }, { status: 500, headers: CORS })

  return NextResponse.json({ ok: true }, { status: 200, headers: CORS })
}
