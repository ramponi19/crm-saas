import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface SubBody { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

// Salva a inscrição de push do dispositivo do usuário atual.
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as SubBody
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'Inscrição inválida' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      empresa_id: empresaId,
      usuario_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: 'endpoint' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Remove a inscrição (desativar notificações neste dispositivo).
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as SubBody
  if (!body.endpoint) return NextResponse.json({ error: 'Endpoint ausente' }, { status: 400 })

  await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('usuario_id', user.id)
  return NextResponse.json({ ok: true })
}
