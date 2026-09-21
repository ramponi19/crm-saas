import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { enviarPush } from '@/lib/push'
import { NextResponse } from 'next/server'

interface NotifyBody { destinatario_id?: string; texto?: string }

// Dispara um push ao destinatário de uma mensagem direta (chamada pelo autor após enviar).
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as NotifyBody
  if (!body.destinatario_id) return NextResponse.json({ error: 'Destinatário ausente' }, { status: 400 })
  if (body.destinatario_id === user.id) return NextResponse.json({ ok: true }) // não notifica a si mesmo

  const { data: autor } = await supabase.from('usuarios').select('nome').eq('id', user.id).maybeSingle()
  const nome = autor?.nome || 'Nova mensagem'
  const texto = (body.texto || '').slice(0, 140)

  // enviarPush filtra por empresa_id → só entrega a inscrições da mesma empresa (isolado por tenant).
  await enviarPush(body.destinatario_id, empresaId, {
    title: nome,
    body: texto,
    url: '/chat',
    tag: `chat-${user.id}`,
    // Mesma chave que a tela usa para "conversa aberta": com ela o service
    // worker cala a notificacao de quem esta sendo lido neste instante.
    conversa: `direto:${user.id}`,
  })
  return NextResponse.json({ ok: true })
}
