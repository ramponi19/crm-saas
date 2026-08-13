/**
 * Configuração compartilhada do Sentry.
 *
 * POR QUE ESTE ARQUIVO EXISTE: o CRM guarda conversa de cliente, CPF, endereço e
 * contrato. Relatório de erro que carrega isso para fora vira problema maior do
 * que o erro. As decisões de privacidade ficam num lugar só, para os três
 * ambientes (navegador, servidor, edge) não divergirem.
 */

import type { ErrorEvent } from '@sentry/nextjs'

/**
 * DSN do projeto (org ramponi19 / nexus-crm).
 *
 * FICA NO CÓDIGO de propósito. O DSN não é segredo: ele é entregue ao navegador
 * de qualquer forma para o SDK poder enviar o erro — só identifica onde o
 * relatório cai. Deixá-lo depender de variável de ambiente significaria que um
 * deploy sem a variável configurada volta a ser cego, que é exatamente o estado
 * do qual estamos saindo. A variável continua tendo precedência, para trocar de
 * projeto sem mexer no código.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
  ?? 'https://8317899a80096e0a5d468debb66619ee@o4511747634429953.ingest.us.sentry.io/4511905007599616'

/**
 * Só reporta em produção.
 *
 * Em `npm run dev` cada erro de digitação viraria alerta, e o ruído treina a
 * gente a ignorar o painel — que é o jeito mais rápido de tornar o Sentry
 * inútil. `NEXT_PUBLIC_SENTRY_DEV=1` liga localmente quando você quiser testar.
 */
export const sentryLigado = SENTRY_DSN.length > 0
  && (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_DEV === '1')

export const opcoesComuns = {
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // NÃO envie dados pessoais. Sem isto o SDK anexa cabeçalhos, cookies e IP —
  // e num CRM isso significa mandar sessão de vendedor e dado de cliente para
  // um terceiro sem ninguém ter pedido.
  sendDefaultPii: false,

  // Amostra tudo: o volume aqui é de uma loja, não de um site de massa. Erro
  // amostrado é erro que talvez você nunca veja.
  tracesSampleRate: 0,
  sampleRate: 1,

  /**
   * Última barreira antes de sair da máquina: remove o que é ruído nosso e o que
   * pode carregar conteúdo de conversa.
   */
  beforeSend(evento: ErrorEvent) {
    const req = evento.request
    if (req) {
      // Corpo de requisição do chat contém a mensagem do cliente.
      delete req.data
      delete req.cookies
      if (req.headers) {
        delete req.headers.authorization
        delete req.headers.cookie
      }
    }
    return evento
  },

  /**
   * Erros que não são defeito do CRM e só fariam barulho: extensão de navegador,
   * navegação abortada e queda de rede do cliente.
   */
  ignoreErrors: [
    'ResizeObserver loop',
    'AbortError',
    'NetworkError when attempting to fetch resource',
    'Failed to fetch',
    'Load failed',
    /extension\//i,
    /^chrome-extension:/,
  ],
}
