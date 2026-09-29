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

    /**
     * ERRO SEM ARQUIVO: anexa QUEM estava carregado na página.
     *
     * ══ O CASO QUE PEDIU ISTO (29/09/2026) ════════════════════════════════
     *
     * `ReferenceError: Can't find variable: EmptyRanges`, em `/leads`, só no
     * Safari de um Mac. O símbolo não existe em nenhum arquivo do projeto
     * (nem nas dependências), o stacktrace é `undefined:1701` — arquivo SEM
     * NOME — e não há relação com deploy: um dos eventos aconteceu com o
     * deploy mais próximo três horas DEPOIS, o outro sem nenhum deploy em 24h.
     *
     * Tudo aponta para script de terceiro rodando no navegador da pessoa, que
     * o `window.onerror` captura porque ele escuta a página inteira. Só que
     * "aponta" não é "prova", e sem o nome do script a conversa morre aqui.
     *
     * Extensão do Safari injeta script com endereço `safari-web-extension://`;
     * no Chrome é `chrome-extension://`. Listando o que a página carregou no
     * momento do erro, o próximo evento entrega o culpado com nome e sobrenome.
     *
     * `ignoreErrors` já descarta extensão conhecida, mas só quando o texto do
     * erro ou a URL dizem "extension" — este não diz nem uma coisa nem outra,
     * e foi por isso que passou.
     *
     * Olha ONDE O ERRO ESTOUROU — o último quadro —, não a pilha inteira.
     *
     * A primeira versão exigia que NENHUM quadro fosse nosso, e nunca disparava:
     * o SDK embrulha `setTimeout` e `addEventListener`, então quase todo erro
     * assíncrono carrega um quadro do nosso bundle mesmo quando quem quebrou foi
     * código de fora. Só descobri porque disparei um erro de teste em produção e
     * fui ler o que saiu na rede — a regra parecia certa lendo o código.
     *
     * Erro nosso estoura em arquivo nosso e não precisa deste contexto.
     */
    if (typeof document !== 'undefined') {
      const quadros = evento.exception?.values?.[0]?.stacktrace?.frames ?? []
      const ondeEstourou = quadros[quadros.length - 1]?.filename ?? ''
      const ehNosso = ondeEstourou.startsWith('http')
        || ondeEstourou.startsWith('/')
        || ondeEstourou.startsWith('app:')
      if (!ehNosso) {
        const scripts = Array.from(document.querySelectorAll('script'))
        const externos = scripts.map((s) => s.src).filter(Boolean)
        evento.contexts = {
          ...evento.contexts,
          origem_desconhecida: {
            // De onde a página carregou script que NÃO é http(s) — é assim que
            // extensão aparece.
            nao_http: externos.filter((u) => !/^https?:/i.test(u)).slice(0, 20),
            // Domínios de terceiros, sem caminho nem query: o que interessa é
            // QUEM serviu o script, não a URL completa.
            dominios: Array.from(new Set(
              externos
                .filter((u) => /^https?:/i.test(u))
                .map((u) => { try { return new URL(u).host } catch { return '?' } })
                .filter((h) => h !== location.host),
            )).slice(0, 20),
            scripts_inline: scripts.filter((s) => !s.src).length,
            total_de_scripts: scripts.length,
          },
        }
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
