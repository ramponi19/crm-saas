import * as Sentry from '@sentry/nextjs'
import { opcoesComuns, sentryLigado } from '@/lib/sentry-comum'

/**
 * Sentry no SERVIDOR e no EDGE (middleware).
 *
 * Cobre o que o usuário nunca vê: erro dentro de rota de API, falha ao renderizar
 * página, exceção no middleware. Hoje isso vira um 500 na tela do vendedor e
 * nada em lugar nenhum.
 */
export async function register() {
  // Auditoria da plataforma nas rotas com chave de serviço (1.1c): o cliente de serviço pergunta por este gancho
  // quem é o usuário da requisição. Só no runtime nodejs (as rotas; o edge não grava com a chave de serviço).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registrarUsuarioNaEscrita } = await import('./lib/supabase/usuario-da-requisicao')
    registrarUsuarioNaEscrita()
  }
  if (!sentryLigado) return
  Sentry.init(opcoesComuns)
}

/**
 * Erro ao renderizar Server Component / rota. O Next chama isto sozinho — sem
 * este gancho, justamente as falhas de servidor ficariam de fora.
 */
export const onRequestError = Sentry.captureRequestError
