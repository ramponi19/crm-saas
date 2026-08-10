/**
 * Traduz a falha do provedor de IA para quem está no balcão.
 *
 * As rotas do assistente repassavam `error.message` do Google direto para a
 * tela. O vendedor recebia:
 *
 *   "Quota exceeded for metric generativelanguage.googleapis.com/
 *    generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash.
 *    Please retry in 49.67s"
 *
 * — texto que não diz a ele o que fazer, manda o lojista para a documentação de
 * uma API que não é dele, e expõe qual provedor está por trás do CRM.
 *
 * O erro cru não se perde: vai para o log do servidor, onde serve.
 */
export function mensagemDoProvedor(status: number, cru: string): string {
  const t = (cru || '').toLowerCase()

  if (t.includes('quota') || t.includes('rate limit') || status === 429) {
    return 'O assistente atingiu o limite do provedor de IA e está indisponível agora. '
      + 'Avise o responsável pelo CRM — é preciso revisar o plano da conta de IA.'
  }
  if (t.includes('api key') || t.includes('api_key') || status === 401 || status === 403) {
    return 'A chave de acesso do assistente foi recusada pelo provedor. Avise o responsável pelo CRM.'
  }
  if (t.includes('not found') || t.includes('is not supported') || status === 404) {
    return 'O modelo de IA configurado não está mais disponível. '
      + 'O responsável pelo CRM precisa escolher outro em Superadmin → Assistente.'
  }
  return 'O assistente está indisponível neste momento. Tente de novo em alguns minutos.'
}

/**
 * Modelo padrão do assistente.
 *
 * Era `gemini-2.0-flash`, que perdeu a cota gratuita — daí o `limit: 0` no erro
 * relatado. Fica num lugar só para não haver três padrões diferentes espalhados
 * pelas rotas; o superadmin sobrepõe em `assistente_config.modelo`.
 */
export const MODELO_PADRAO = 'gemini-2.5-flash'
