import { NextResponse } from 'next/server'
import { gerarPixelJs } from '@/lib/rastreamento/pixel'

/**
 * Serve o pixel first-party em /track.js — mesmo domínio do app, para os cookies
 * de atribuição serem first-party na LP do cliente que embutir o script.
 *
 * A base da API é a própria origem (NEXT_PUBLIC_APP_URL), então o pixel fala com
 * /api/rastreamento/* deste app.
 */
export const dynamic = 'force-static'
export const revalidate = 3600

export function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const js = gerarPixelJs(base)
  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
