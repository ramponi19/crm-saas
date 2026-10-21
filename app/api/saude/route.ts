import { NextResponse } from 'next/server'

/**
 * SAÚDE PARA O MONITOR DE UPTIME (21/10/2026).
 *
 * O monitor batia em `GET /`, que é a página mais cara que existe para ele: o
 * proxy confere a sessão no Auth, a página confere DE NOVO, lê `planos_config` e
 * renderiza a landing inteira no servidor — a cada minuto, o dia todo, cobrado
 * como CPU ativa da Vercel (o teto do plano é 4 h/mês).
 *
 * Esta rota responde só que o app está de pé e qual versão está no ar. Não toca
 * no banco nem no Auth, e fica FORA do matcher do proxy.ts (o middleware nem
 * acorda). Apontar o monitor para cá: GET ou HEAD /api/saude.
 *
 * Não responde "o banco está de pé" de propósito: para isso o monitor teria de
 * consultar o banco a cada minuto, e o banco do plano free também tem teto.
 */
export const dynamic = 'force-dynamic'

const CABECALHOS = { 'cache-control': 'no-store' }

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      regiao: process.env.VERCEL_REGION ?? null,
      em: new Date().toISOString(),
    },
    { headers: CABECALHOS },
  )
}

export function HEAD() {
  return new NextResponse(null, { status: 200, headers: CABECALHOS })
}
