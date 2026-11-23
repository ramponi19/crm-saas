/**
 * PREVIEW NÃO GRAVA SEGREDO (decisão do Lucas, 23/11/2026; docs/design-pos-venda.md §8.6).
 *
 * Os previews da Vercel usam o banco da PRODUÇÃO, mas com chaves de TESTE no cofre de canais
 * (CHANNEL_ENCRYPTION_KEY) e no de pagamento/segredos (PAYMENT_ENCRYPTION_KEY). Um segredo cifrado
 * no preview seria gravado no banco real e ficaria ilegível para a produção: o canal da loja parava
 * de enviar, o gateway parava de cobrar, o portal parava de entrar lead. Por isso, no preview:
 *   - a cifra recusa (backstop: cifrarToken, encryptCredenciais, gravarSegredo);
 *   - as rotas de tela que gravam segredo respondem 403 com `codigo: 'PREVIEW_SEM_SEGREDO'`
 *     antes de falar com a Meta ou com o gateway.
 * Produção e desenvolvimento local não mudam (VERCEL_ENV é 'production' ou não existe).
 */
export const CODIGO_PREVIEW = 'PREVIEW_SEM_SEGREDO'
export const MENSAGEM_PREVIEW =
  'Este é um ambiente de pré-visualização: conectar canal, configurar pagamento e gerar token ficam bloqueados aqui. Use o sistema de produção.'

export function emPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'preview'
}

/** Para a cifra: lança antes de cifrar qualquer coisa no preview. */
export function barrarCifraNoPreview(onde: string): void {
  if (emPreview()) throw new Error(`${CODIGO_PREVIEW}: ${onde} não grava segredo no preview.`)
}

/** Para as rotas: a resposta 403 no preview, ou null fora dele. */
export function recusaNoPreview(): Response | null {
  return emPreview() ? Response.json({ error: MENSAGEM_PREVIEW, codigo: CODIGO_PREVIEW }, { status: 403 }) : null
}
