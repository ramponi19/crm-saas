// ============================================================================
// Chamadas à Graph API para conectar canais de cliente. SÓ SERVIDOR — usa o
// App Secret, que nunca pode ir para o navegador.
//
// Referência: docs/PLANO-META-MULTITENANT-v2.md (extraído da doc oficial em
// 29/07/2026). Os pontos que mais mordem estão comentados no lugar.
// ============================================================================

const V = process.env.META_GRAPH_VERSION || 'v25.0'
const APP_ID = process.env.META_APP_ID ?? ''
const APP_SECRET = process.env.META_APP_SECRET ?? ''
const G = `https://graph.facebook.com/${V}`

export function metaConfigurada(): boolean {
  return !!(APP_ID && APP_SECRET)
}

type Erro = { erro: string; codigo?: number }
const falha = (j: Record<string, unknown>, padrao: string): Erro => {
  const e = j?.error as { message?: string; code?: number } | undefined
  return { erro: e?.message ?? padrao, codigo: e?.code }
}

/**
 * Troca o código devolvido pelo fluxo de login pelo token do CLIENTE.
 * Precisa do App Secret, por isso só roda no servidor.
 */
export async function trocarCodigoPorToken(code: string): Promise<{ token: string } | Erro> {
  const r = await fetch(
    `${G}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${encodeURIComponent(code)}`,
  )
  const j = await r.json()
  if (!r.ok || !j.access_token) return falha(j, 'Não foi possível concluir a conexão com a Meta.')
  return { token: j.access_token as string }
}

/** Validade e escopos do token. `expires_at: 0` significa que não expira. */
export async function inspecionarToken(token: string): Promise<{
  valido: boolean
  expiraEm: string | null
  acessoDadosExpiraEm: string | null
  escopos: string[]
} | Erro> {
  const appToken = `${APP_ID}|${APP_SECRET}`
  const r = await fetch(`${G}/debug_token?input_token=${token}&access_token=${appToken}`)
  const j = await r.json()
  if (!r.ok || !j.data) return falha(j, 'Não foi possível validar o token.')
  const d = j.data as { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[] }
  const data = (s?: number) => (s && s > 0 ? new Date(s * 1000).toISOString() : null)
  return {
    valido: !!d.is_valid,
    expiraEm: data(d.expires_at),
    acessoDadosExpiraEm: data(d.data_access_expires_at),
    escopos: d.scopes ?? [],
  }
}

/**
 * Assina o app na conta WhatsApp do cliente. SEM CORPO de propósito: corpo
 * serve para sobrescrever a URL por WABA, e num webhook único queremos que
 * caia no endereço configurado no app. Sem este passo o cliente conecta e
 * nunca recebe nada.
 */
export async function assinarWaba(wabaId: string, token: string): Promise<true | Erro> {
  const r = await fetch(`${G}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  if (!r.ok || !j.success) return falha(j, 'Não foi possível assinar o webhook da conta WhatsApp.')
  return true
}

/**
 * Números de uma conta WhatsApp. Rede de segurança: no fluxo de coexistência o
 * evento de conclusão pode devolver só o id da CONTA, sem o do número — e sem o
 * id do número não há como rotear webhook nem enviar mensagem.
 */
export async function numerosDaWaba(wabaId: string, token: string): Promise<{
  numeros: { id: string; numero: string | null; noApp: boolean }[]
} | Erro> {
  const r = await fetch(
    `${G}/${wabaId}/phone_numbers?fields=id,display_phone_number,is_on_biz_app&access_token=${token}`,
  )
  const j = await r.json()
  if (!r.ok || !Array.isArray(j.data)) return falha(j, 'Não foi possível listar os números da conta.')
  return {
    numeros: (j.data as Record<string, unknown>[]).map((n) => ({
      id: String(n.id),
      numero: (n.display_phone_number as string) ?? null,
      noApp: !!n.is_on_biz_app,
    })),
  }
}

/**
 * Confirma que o número entrou em modo coexistência (roda no app do celular E
 * na API). Esperado: is_on_biz_app = true e platform_type = CLOUD_API.
 */
export async function statusDoNumero(phoneNumberId: string, token: string): Promise<{
  coexistencia: boolean
  plataforma: string | null
  numero: string | null
  nomeVerificado: string | null
} | Erro> {
  const campos = 'is_on_biz_app,platform_type,display_phone_number,verified_name'
  const r = await fetch(`${G}/${phoneNumberId}?fields=${campos}&access_token=${token}`)
  const j = await r.json()
  if (!r.ok) return falha(j, 'Não foi possível ler o número conectado.')
  return {
    coexistencia: !!j.is_on_biz_app && j.platform_type === 'CLOUD_API',
    plataforma: (j.platform_type as string) ?? null,
    numero: (j.display_phone_number as string) ?? null,
    nomeVerificado: (j.verified_name as string) ?? null,
  }
}

/**
 * Dispara a sincronização da coexistência: contatos ou histórico.
 *
 * DOIS CUIDADOS que a doc da Meta destaca e não perdoam:
 *  - prazo de 24h após o onboarding; passou, o cliente tem que refazer o fluxo;
 *  - cada tipo só pode ser chamado UMA VEZ. Não existe segunda tentativa.
 * Por isso o request_id é guardado: é o que o suporte da Meta pede.
 */
export async function sincronizarAppDoCelular(
  phoneNumberId: string,
  token: string,
  tipo: 'smb_app_state_sync' | 'history',
): Promise<{ requestId: string | null } | Erro> {
  const r = await fetch(`${G}/${phoneNumberId}/smb_app_data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: tipo }),
  })
  const j = await r.json()
  if (!r.ok) return falha(j, `Não foi possível iniciar a sincronização (${tipo}).`)
  // Sucesso aqui NÃO garante que o cliente compartilhou o histórico — só que a
  // Meta aceitou o pedido.
  return { requestId: (j.request_id as string) ?? null }
}

/**
 * Páginas do cliente + conta do Instagram vinculada a cada uma.
 * Devolve um token POR PÁGINA — é ele que autentica Messenger e Instagram, não
 * o token do usuário.
 */
export async function listarPaginas(tokenUsuario: string): Promise<{
  paginas: { id: string; nome: string; token: string; instagram: { id: string; username: string | null } | null }[]
} | Erro> {
  const campos = 'id,name,access_token,instagram_business_account{id,username}'
  const r = await fetch(`${G}/me/accounts?fields=${campos}&limit=100&access_token=${tokenUsuario}`)
  const j = await r.json()
  if (!r.ok || !Array.isArray(j.data)) return falha(j, 'Não foi possível listar as Páginas.')
  return {
    paginas: (j.data as Record<string, unknown>[]).map((p) => {
      const ig = p.instagram_business_account as { id?: string; username?: string } | undefined
      return {
        id: String(p.id),
        nome: String(p.name ?? ''),
        token: String(p.access_token ?? ''),
        instagram: ig?.id ? { id: String(ig.id), username: ig.username ?? null } : null,
      }
    }),
  }
}

// Campos que o CRM precisa receber da Página. `message_echoes` é o que faz a
// mensagem enviada pelo app do Messenger aparecer no CRM — sem ele o vendedor
// responde pelo celular e o histórico fica furado.
export const CAMPOS_PAGINA = [
  'messages',
  'message_echoes',
  'messaging_postbacks',
  'messaging_optins',
  'message_reactions',
  'messaging_referrals',
] as const

/** Assina o app na Página do cliente (usa o token DA PÁGINA, não o do usuário). */
export async function assinarPagina(pageId: string, tokenPagina: string): Promise<true | Erro> {
  const r = await fetch(
    `${G}/${pageId}/subscribed_apps?subscribed_fields=${CAMPOS_PAGINA.join(',')}&access_token=${tokenPagina}`,
    { method: 'POST' },
  )
  const j = await r.json()
  if (!r.ok || !j.success) return falha(j, 'Não foi possível assinar o webhook da Página.')
  return true
}

export const ehErro = (x: unknown): x is Erro =>
  typeof x === 'object' && x !== null && 'erro' in x
