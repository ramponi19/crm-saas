import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { registrarMensagemDoLead } from '@/lib/leads'

const TIPOS = ['texto', 'imagem', 'video', 'audio', 'documento']

/**
 * POST — registra na conversa do lead uma mensagem de canal SEM integração (a anotação
 * de atendimento presencial do chat: canal "manual", "site", "indicação"...). Os canais
 * da Meta passam pela Edge, que grava sozinha.
 *
 * Era o insert do navegador na view `lead_mensagens`. Agora: a sessão precisa enxergar o
 * negócio (RLS), e a gravação vai pela `mensagem_registrar` (serviço), com o autor — a
 * mesma função por onde a Edge grava, que acha ou abre a conversa do contato na loja.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const negocioId = Number(id)
  if (!Number.isFinite(negocioId)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { data: neg } = await db.from('negocios').select('id, empresa_id').eq('id', negocioId).maybeSingle()
  if (!neg) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const conteudo = typeof b?.conteudo === 'string' ? b.conteudo : ''
  const origem = typeof b?.origem === 'string' && b.origem ? b.origem : 'manual'
  const tipo = typeof b?.tipo === 'string' && TIPOS.includes(b.tipo) ? b.tipo : 'texto'
  const midiaUrl = typeof b?.midia_url === 'string' ? b.midia_url : null
  if (!conteudo.trim() && !midiaUrl) return NextResponse.json({ error: 'mensagem vazia' }, { status: 400 })
  if (['whatsapp', 'instagram', 'messenger'].includes(origem)) {
    return NextResponse.json({ error: 'canal da Meta envia pela Edge' }, { status: 400 })
  }

  const r = await registrarMensagemDoLead(createServiceClient(), neg.empresa_id as number, negocioId, {
    direcao: 'enviada', conteudo, origem, tipo, lida: true, usuario_id: user.id, midia_url: midiaUrl,
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ id: r.id })
}
