import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { cofreConfigurado } from '@/lib/canais/crypto'
import { basePublica } from '@/lib/url-publica'
import { configurado, urlAutorizacao, urlRetorno } from '@/lib/canais/instagram-login'

/**
 * Abre o login do Instagram — o caminho SEM Página do Facebook.
 *
 * Devolve a URL em vez de redirecionar: o clique vem da tela, e é ela que navega.
 * Assim a resposta de erro chega como aviso legível em vez de uma página branca.
 */
export const COOKIE_STATE = 'ig_login_state'

export async function POST(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error

  if (!configurado()) {
    return NextResponse.json({
      error: 'O conector do Instagram não está configurado no servidor (INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET).',
    }, { status: 400 })
  }
  if (!cofreConfigurado()) {
    return NextResponse.json({
      error: 'A chave de criptografia dos canais não está configurada — sem ela o sistema se recusa a guardar o acesso.',
    }, { status: 400 })
  }

  const { base, local } = basePublica(new URL(req.url).origin)
  /**
   * Recusa em ambiente local com a razão na mão.
   *
   * O `redirect_uri` tem de estar cadastrado no app da Meta, e `localhost` não
   * está nem pode estar. Sem esta checagem o lojista veria a recusa da Meta, que
   * não explica nada.
   */
  if (local) {
    return NextResponse.json({
      error: 'Este ambiente é local. O login do Instagram só funciona pelo endereço público do CRM, que é o cadastrado no app da Meta.',
    }, { status: 400 })
  }

  /**
   * `state` é a defesa de CSRF: volta intacto da Meta e é comparado com o cookie.
   * Sem isso, um link forjado faria a loja conectar a conta de outra pessoa.
   */
  const state = crypto.randomUUID().replace(/-/g, '')
  const jar = await cookies()
  jar.set(COOKIE_STATE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 600,
  })

  return NextResponse.json({ url: urlAutorizacao(base, state), retorno: urlRetorno(base) })
}
