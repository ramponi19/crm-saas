import { NextResponse } from 'next/server'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(req: Request) {
  try {
    const { to, message } = await req.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const result = await sendWhatsApp({ to, message })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
