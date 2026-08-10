import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/superadmin'
import { listarModelos } from '@/lib/assistente-modelos'

/**
 * Modelos que a chave de IA realmente aceita, do mais recomendado ao menos.
 *
 * Existe para o campo de modelo deixar de ser texto livre. Digitado à mão, ele
 * aceita nome de modelo aposentado (ou com erro de digitação) e o assistente só
 * quebra quando um lojista tenta usar — foi assim que o gemini-2.0-flash ficou
 * gravado depois de perder a cota gratuita.
 *
 * Só superadmin: a lista vem do provedor usando a chave da plataforma.
 */
export async function GET() {
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 503 })
  }

  const modelos = await listarModelos(apiKey)
  if (modelos.length === 0) {
    return NextResponse.json(
      { error: 'Não consegui listar os modelos. Verifique se a chave é válida e tem acesso à API.' },
      { status: 502 },
    )
  }
  return NextResponse.json({ modelos })
}
