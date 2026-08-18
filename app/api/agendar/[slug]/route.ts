import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { escolherResponsavel } from '@/lib/distribuicao'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { excedeuLimite } from '@/lib/rate-limit'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

// Agendamento online do paciente (público). Cria o lead + a consulta (visita).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id, segmento').eq('slug', slug).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404, headers: CORS })

  /**
   * A loja precisa USAR agenda para receber agendamento.
   *
   * A tela é liberada por segmento, a rota não era: um POST no slug de qualquer
   * empresa criava lead + consulta numa loja que não tem agenda nenhuma. O lead
   * entrava na roleta, consumia o limite do plano e ninguém ia ver a "consulta",
   * porque a tela não existe ali. Mesmo 404: a rota não conta quem existe.
   */
  const cap = SEGMENTOS[normalizarSegmento(empresa.segmento)].capacidades
  if (!cap.agendaClinica && !cap.agendaVisitas) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404, headers: CORS })
  }

  // Cada agendamento cria um LEAD, que entra na roleta e consome o limite do
  // plano da loja. Sem teto, dava para encher o funil de quem quisesse.
  if (await excedeuLimite(svc, 'agendar', req, 20)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' }, { status: 429, headers: CORS })
  }

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
