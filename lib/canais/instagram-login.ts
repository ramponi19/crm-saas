import { cifrarToken } from '@/lib/canais/crypto'

/**
 * Instagram SEM Página do Facebook — "Instagram API with Instagram Login".
 *
 * ⚠️ Zona sensível (Meta). Este é um conector SEPARADO do que existe em
 * `lib/canais/meta.ts`, não uma variação dele. As diferenças que importam:
 *
 *   | | via Página (o antigo) | via Instagram (este) |
 *   |---|---|---|
 *   | login | facebook.com/dialog/oauth | instagram.com/oauth/authorize |
 *   | app | App ID do Facebook | App ID do INSTAGRAM (outro id) |
 *   | token | da Página | da CONTA do Instagram |
 *   | host da API | graph.facebook.com | graph.instagram.com |
 *   | webhook | POST /{pageId}/subscribed_apps | POST /me/subscribed_apps |
 *   | Página | obrigatória | dispensada |
 *
 * POR QUE EXISTE: uma Página do Facebook aceita UM Instagram profissional — a
 * Meta recusa o segundo com "You can only connect one Instagram Account to each
 * Facebook Page". Então, no caminho antigo, a segunda loja da rede não tinha como
 * conectar o Instagram dela; e a loja que só tem Instagram, sem Página nenhuma,
 * não entrava de jeito nenhum. Num multi-tenant isso não é exceção.
 *
 * Documentação (conferida em 27/08/2026):
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

const V = 'v25.0'
const GRAPH = `https://graph.instagram.com/${V}`
/** Sem versão: os dois endpoints de token não aceitam prefixo de versão. */
const GRAPH_RAW = 'https://graph.instagram.com'
const OAUTH = 'https://api.instagram.com/oauth/access_token'

/**
 * Escopos mínimos para conversar. `instagram_business_basic` é obrigatório junto
 * do de mensagens — a doc lista os dois como requisito do envio.
 */
export const ESCOPOS = ['instagram_business_basic', 'instagram_business_manage_messages'] as const

export interface Erro { erro: string }
export const ehErro = <T,>(v: T | Erro): v is Erro =>
  !!v && typeof v === 'object' && 'erro' in (v as Record<string, unknown>)

/**
 * Credenciais do app do INSTAGRAM, que não são as do app do Facebook.
 *
 * Ficam em variáveis próprias porque são outro par de id/segredo, gerado na aba
 * "Instagram → API setup with Instagram login" do mesmo app da Meta. Usar o id do
 * Facebook aqui falha com "Invalid platform app", que não diz nada sobre a causa.
 */
export const appId = () => (process.env.INSTAGRAM_APP_ID ?? '').trim()
const appSecret = () => (process.env.INSTAGRAM_APP_SECRET ?? '').trim()
export const configurado = () => !!appId() && !!appSecret()

/** Endereço de retorno. Registrado no app da Meta, e igual em ida e volta. */
export const urlRetorno = (base: string) => `${base.replace(/\/$/, '')}/api/canais/instagram/retorno`

/**
 * Janela de autorização.
 *
 * `state` volta intacto e é a defesa de CSRF: quem inicia guarda o valor e
 * confere na volta. Sem isso, um link forjado faria a loja conectar a conta de
 * outra pessoa ao CRM dela.
 */
export function urlAutorizacao(base: string, state: string): string {
  const p = new URLSearchParams({
    client_id: appId(),
    redirect_uri: urlRetorno(base),
    response_type: 'code',
    scope: ESCOPOS.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`
}

async function json(r: Response): Promise<Record<string, unknown>> {
  const t = await r.text()
  try { return JSON.parse(t) as Record<string, unknown> } catch { return { _cru: t.slice(0, 300) } }
}

const mensagemDeErro = (j: Record<string, unknown>, padrao: string): string => {
  const e = j.error as { message?: string } | undefined
  const alt = j.error_message as string | undefined
  return e?.message ?? alt ?? (typeof j._cru === 'string' ? j._cru : padrao)
}

/** Código → token curto. Devolve também o id da conta, que a Meta chama `user_id`. */
export async function trocarCodigo(
  code: string,
  base: string,
): Promise<{ token: string; usuarioId: string } | Erro> {
  try {
    const corpo = new URLSearchParams({
      client_id: appId(),
      client_secret: appSecret(),
      grant_type: 'authorization_code',
      redirect_uri: urlRetorno(base),
      code,
    })
    const r = await fetch(OAUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
      signal: AbortSignal.timeout(15000),
    })
    const j = await json(r)
    if (!r.ok || !j.access_token) return { erro: mensagemDeErro(j, 'A Meta recusou o código de autorização.') }
    return { token: String(j.access_token), usuarioId: String(j.user_id ?? '') }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha de rede ao trocar o código' }
  }
}

/**
 * Token curto → token longo (60 dias, renovável).
 *
 * O curto vale uma hora. Guardar o curto significaria integração que para de
 * funcionar no mesmo dia, sem ninguém entender por quê.
 */
export async function tokenLongo(
  tokenCurto: string,
): Promise<{ token: string; expiraEm: string | null } | Erro> {
  try {
    const p = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: appSecret(),
      access_token: tokenCurto,
    })
    const r = await fetch(`${GRAPH_RAW}/access_token?${p.toString()}`, { signal: AbortSignal.timeout(15000) })
    const j = await json(r)
    if (!r.ok || !j.access_token) return { erro: mensagemDeErro(j, 'Não foi possível obter o token de longa duração.') }
    const seg = Number(j.expires_in ?? 0)
    return {
      token: String(j.access_token),
      expiraEm: seg > 0 ? new Date(Date.now() + seg * 1000).toISOString() : null,
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha de rede ao trocar por token longo' }
  }
}

/** Renova o token longo. Exige token com mais de 24h e ainda válido. */
export async function renovarToken(
  token: string,
): Promise<{ token: string; expiraEm: string | null } | Erro> {
  try {
    const p = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })
    const r = await fetch(`${GRAPH_RAW}/refresh_access_token?${p.toString()}`, { signal: AbortSignal.timeout(15000) })
    const j = await json(r)
    if (!r.ok || !j.access_token) return { erro: mensagemDeErro(j, 'Não foi possível renovar o token.') }
    const seg = Number(j.expires_in ?? 0)
    return {
      token: String(j.access_token),
      expiraEm: seg > 0 ? new Date(Date.now() + seg * 1000).toISOString() : null,
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha de rede ao renovar o token' }
  }
}

/**
 * Quem é a conta, perguntado à API. E a Meta devolve DOIS ids.
 *
 * `GET /me` da conta @jmstore_jaguariuna respondeu:
 *   id      = 37856994697280891   → identificador da conta NO ESCOPO DESTE APP
 *   user_id = 17841437924151547   → id da CONTA PROFISSIONAL do Instagram
 *
 * O QUE VALE PARA CASAR O WEBHOOK É O `user_id`. A prova está no canal que já
 * funciona: o `@jmstore_importados`, conectado pela Página, está gravado como
 * 17841460104258132 — o mesmo espaço de id — e recebe Direct há semanas. Na
 * primeira versão eu gravei o `id` e o webhook não casaria com ninguém.
 *
 * Devolve os dois para quem chamar decidir, em vez de esconder a ambiguidade.
 */
export async function perfil(
  token: string,
): Promise<{ id: string; contaProfissionalId: string | null; username: string | null } | Erro> {
  try {
    const r = await fetch(`${GRAPH}/me?fields=id,username,user_id&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(15000),
    })
    const j = await json(r)
    if (!r.ok || !j.id) return { erro: mensagemDeErro(j, 'Não foi possível ler o perfil do Instagram.') }
    return {
      id: String(j.id),
      contaProfissionalId: j.user_id ? String(j.user_id) : null,
      username: j.username ? String(j.username) : null,
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha de rede ao ler o perfil' }
  }
}

/** Assina o webhook NA CONTA. Sem isto o CRM não recebe Direct nenhum. */
export async function assinarWebhook(token: string): Promise<true | Erro> {
  try {
    const r = await fetch(`${GRAPH}/me/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ subscribed_fields: 'messages', access_token: token }).toString(),
      signal: AbortSignal.timeout(15000),
    })
    const j = await json(r)
    if (!r.ok || j.success === false) return { erro: mensagemDeErro(j, 'A Meta recusou assinar o recebimento.') }
    return true
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha de rede ao assinar o webhook' }
  }
}

/** Cancela a assinatura. Usado ao desconectar. */
export async function cancelarWebhook(token: string): Promise<true | Erro> {
  try {
    const r = await fetch(`${GRAPH}/me/subscribed_apps?access_token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) return { erro: mensagemDeErro(await json(r), 'Não foi possível cancelar o recebimento.') }
    return true
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha de rede ao cancelar o webhook' }
  }
}

/** Cifra no mesmo cofre dos outros canais — o token não fica em claro no banco. */
export const cifrar = (token: string) => cifrarToken(token)
