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
 *
 * `redirectUri` é OBRIGATÓRIO no fluxo por redirecionamento e tem de ser
 * IDÊNTICO ao usado no diálogo — a Meta responde "Error validating verification
 * code. Please make sure your redirect_uri is identical..." quando ele falta ou
 * difere. (No fluxo antigo, com o SDK, ele não era enviado — foi a origem do erro.)
 */
export async function trocarCodigoPorToken(
  code: string,
  redirectUri?: string,
): Promise<{ token: string } | Erro> {
  const p = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    code,
  })
  if (redirectUri) p.set('redirect_uri', redirectUri)

  const r = await fetch(`${G}/oauth/access_token?${p.toString()}`)
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

/**
 * Descobre sozinho a conta WhatsApp e o número a conectar, partindo só do token.
 *
 * Existe porque em token de USUÁRIO DE SISTEMA os `granular_scopes` vêm sem lista
 * de alvos ("todos"), então não há de onde derivar a WABA — e as arestas
 * `assigned_whatsapp_business_accounts` voltam vazias. O caminho que funciona:
 *   token → Página → portfólio dono da Página → contas WhatsApp do portfólio →
 *   números → escolher o que está em COEXISTÊNCIA.
 *
 * Preferência de escolha, nesta ordem:
 *   1. número em coexistência (is_on_biz_app + CLOUD_API) — o que roda no celular;
 *   2. qualquer número já na Cloud API;
 *   Nunca escolhe número fora da Cloud API: conectar ali não receberia nada.
 */
export async function descobrirWhatsApp(token: string): Promise<{
  wabaId: string
  phoneNumberId: string
  numero: string | null
  nome: string | null
  coexistencia: boolean
  outros: { numero: string | null; coexistencia: boolean }[]
} | Erro> {
  const pega = async (p: string) => {
    const r = await fetch(`${G}/${p}${p.includes('?') ? '&' : '?'}access_token=${token}`)
    return { ok: r.ok, body: await r.json() as Record<string, unknown> }
  }

  const pgs = await pega('me/accounts?fields=id&limit=25')
  const primeira = (pgs.body?.data as Record<string, unknown>[] | undefined)?.[0]
  if (!primeira?.id) return falha(pgs.body, 'O token não alcança nenhuma Página — sem ela não consigo achar o portfólio.')

  const pg = await pega(`${primeira.id}?fields=business`)
  const negocio = (pg.body?.business as Record<string, unknown> | undefined)?.id
  if (!negocio) return falha(pg.body, 'Não consegui identificar o portfólio de negócios da Página.')

  const wabas = await pega(`${negocio}/owned_whatsapp_business_accounts?fields=id,name&limit=50`)
  const lista = (wabas.body?.data as Record<string, unknown>[] | undefined) ?? []
  if (!lista.length) return falha(wabas.body, 'Nenhuma conta de WhatsApp encontrada neste portfólio.')

  type Cand = { wabaId: string; phoneNumberId: string; numero: string | null; nome: string | null; coexistencia: boolean; naApi: boolean; noApp: boolean }
  const candidatos: Cand[] = []

  for (const w of lista) {
    const campos = 'id,display_phone_number,verified_name,is_on_biz_app,platform_type'
    const nums = await pega(`${w.id}/phone_numbers?fields=${campos}&limit=25`)
    for (const n of ((nums.body?.data as Record<string, unknown>[] | undefined) ?? [])) {
      const naApi = n.platform_type === 'CLOUD_API'
      candidatos.push({
        wabaId: String(w.id),
        phoneNumberId: String(n.id),
        numero: (n.display_phone_number as string) ?? null,
        nome: (n.verified_name as string) ?? null,
        coexistencia: !!n.is_on_biz_app && naApi,
        naApi,
        noApp: !!n.is_on_biz_app,
      })
    }
  }

  // Ordem de preferência. O terceiro caso existe por uma situação real: número
  // recém-liberado de outro provedor fica um tempo FORA da Cloud API (aparece
  // como ON_PREMISE / DISCONNECTED) antes de entrar na nova. Rejeitá-lo aqui
  // faria a conexão falhar dizendo "nenhum número na Cloud API", quando na
  // verdade é o número certo, em trânsito. Ele segue no app do celular, então
  // `is_on_biz_app` é o sinal de que pertence mesmo ao lojista.
  const escolhido = candidatos.find((c) => c.coexistencia)
    ?? candidatos.find((c) => c.naApi)
    ?? candidatos.find((c) => c.noApp)
  if (!escolhido) {
    return {
      erro: 'Nenhum número utilizável foi encontrado neste portfólio. '
        + 'Se o número acabou de sair de outro provedor, aguarde alguns minutos e tente de novo; '
        + 'caso contrário, verifique o número no WhatsApp Manager.',
    }
  }

  return {
    wabaId: escolhido.wabaId,
    phoneNumberId: escolhido.phoneNumberId,
    numero: escolhido.numero,
    nome: escolhido.nome,
    coexistencia: escolhido.coexistencia,
    outros: candidatos
      .filter((c) => c.phoneNumberId !== escolhido.phoneNumberId)
      .map((c) => ({ numero: c.numero, coexistencia: c.coexistencia })),
  }
}

/**
 * Descobre a conta WhatsApp (WABA) a partir do próprio token do cliente.
 *
 * Necessário no fluxo por REDIRECIONAMENTO: sem o pop-up do SDK não existe o
 * `postMessage` que entrega o waba_id, então ele é derivado dos escopos
 * concedidos ao token — `granular_scopes` traz os ids dos ativos autorizados.
 */
export async function wabaDoToken(token: string): Promise<string | null> {
  try {
    const r = await fetch(`${G}/debug_token?input_token=${token}&access_token=${APP_ID}|${APP_SECRET}`)
    const j = await r.json()
    const escopos = j?.data?.granular_scopes as { scope?: string; target_ids?: string[] }[] | undefined
    if (!escopos) return null
    const alvo = escopos.find((e) => e.scope === 'whatsapp_business_management')
      ?? escopos.find((e) => e.scope === 'whatsapp_business_messaging')
    return alvo?.target_ids?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * Domínios autorizados no app da Meta. O SDK de login recusa em SILÊNCIO quando a
 * página está num domínio fora desta lista — nenhuma janela abre, nenhum erro
 * aparece. Ler isto permite a tela dizer o motivo em vez de deixar o usuário
 * adivinhando (foi exatamente o que travou o primeiro teste real).
 */
export async function dominiosDoApp(): Promise<string[] | null> {
  try {
    if (!metaConfigurada()) return null
    const r = await fetch(`${G}/${APP_ID}?fields=app_domains&access_token=${APP_ID}|${APP_SECRET}`)
    const j = await r.json()
    if (!r.ok || !Array.isArray(j.app_domains)) return null
    return j.app_domains as string[]
  } catch {
    return null
  }
}

// ── Modelos de mensagem (templates) ─────────────────────────────────────────
// São o único caminho para retomar conversa depois de 24h sem o cliente escrever.
// O modelo é criado NA META, em nome da empresa, e passa por análise dela.

/** Submete um modelo à análise da Meta. `corpo` usa {{1}}, {{2}}… */
export async function criarModelo(
  wabaId: string, token: string,
  m: { nome: string; idioma: string; categoria: string; corpo: string; exemplos?: string[] },
): Promise<{ metaId: string | null; status: string } | Erro> {
  const componente: Record<string, unknown> = { type: 'BODY', text: m.corpo }
  // A Meta exige exemplo para cada variável, senão recusa por falta de contexto.
  if (m.exemplos?.length) componente.example = { body_text: [m.exemplos] }

  const r = await fetch(`${G}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: m.nome, language: m.idioma, category: m.categoria, components: [componente],
    }),
  })
  const j = await r.json()
  if (!r.ok) return falha(j, 'A Meta não aceitou o modelo.')
  return { metaId: (j.id as string) ?? null, status: String(j.status ?? 'PENDING') }
}

/** Estado atual dos modelos na Meta — a análise pode levar minutos ou horas. */
export async function listarModelos(wabaId: string, token: string): Promise<{
  modelos: { metaId: string; nome: string; idioma: string; categoria: string; status: string; corpo: string; motivo: string | null }[]
} | Erro> {
  const campos = 'id,name,language,category,status,components,rejected_reason'
  const r = await fetch(`${G}/${wabaId}/message_templates?fields=${campos}&limit=200&access_token=${token}`)
  const j = await r.json()
  if (!r.ok || !Array.isArray(j.data)) return falha(j, 'Não foi possível ler os modelos.')
  return {
    modelos: (j.data as Record<string, unknown>[]).map((t) => {
      const body = (t.components as Record<string, unknown>[] | undefined)
        ?.find((c) => c.type === 'BODY')
      return {
        metaId: String(t.id), nome: String(t.name ?? ''), idioma: String(t.language ?? ''),
        categoria: String(t.category ?? ''), status: String(t.status ?? ''),
        corpo: String(body?.text ?? ''),
        motivo: (t.rejected_reason as string) && t.rejected_reason !== 'NONE'
          ? String(t.rejected_reason) : null,
      }
    }),
  }
}

/** Apaga o modelo na Meta (ela apaga por NOME, não por id). */
export async function apagarModelo(wabaId: string, token: string, nome: string): Promise<true | Erro> {
  const r = await fetch(`${G}/${wabaId}/message_templates?name=${encodeURIComponent(nome)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  })
  const j = await r.json()
  if (!r.ok || !j.success) return falha(j, 'Não foi possível apagar o modelo na Meta.')
  return true
}

// Status da Meta → status guardado aqui.
export function statusDoModelo(metaStatus: string): string {
  const m: Record<string, string> = {
    APPROVED: 'aprovado', PENDING: 'pendente', IN_APPEAL: 'pendente',
    REJECTED: 'rejeitado', PAUSED: 'pausado', DISABLED: 'desativado',
    PENDING_DELETION: 'desativado',
  }
  return m[metaStatus] ?? 'pendente'
}

export const ehErro = (x: unknown): x is Erro =>
  typeof x === 'object' && x !== null && 'erro' in x
