import * as Sentry from '@sentry/nextjs'
import { opcoesComuns, sentryLigado } from '@/lib/sentry-comum'

/**
 * Sentry no SERVIDOR e no EDGE (middleware).
 *
 * Cobre o que o usuário nunca vê: erro dentro de rota de API, falha ao renderizar
 * página, exceção no middleware. Hoje isso vira um 500 na tela do vendedor e
 * nada em lugar nenhum.
 */
export function register() {
  if (!sentryLigado) return
  Sentry.init(opcoesComuns)
}

/**
 * Erro ao renderizar Server Component / rota. O Next chama isto sozinho — sem
 * este gancho, justamente as falhas de servidor ficariam de fora.
 */
export const onRequestError = Sentry.captureRequestError
