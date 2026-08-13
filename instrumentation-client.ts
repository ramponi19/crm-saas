import * as Sentry from '@sentry/nextjs'
import { opcoesComuns, sentryLigado } from '@/lib/sentry-comum'

/**
 * Sentry no NAVEGADOR — é aqui que moram os erros que o vendedor vive.
 *
 * Os três problemas relatados esta semana ("não consigo ouvir áudio", "Empresa
 * não carregada", "Uso da equipe zerado") aconteceram na tela e só chegaram até
 * mim porque alguém contou. Isto existe para a próxima vez chegar sozinho, com
 * linha e usuário.
 *
 * Sem Session Replay de propósito: gravar a tela de um CRM é gravar conversa de
 * cliente, CPF e contrato.
 */
if (sentryLigado) {
  Sentry.init({
    ...opcoesComuns,
    integrations: [],
  })
}

/** Instrumenta as trocas de rota do App Router (exigido pelo SDK). */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
