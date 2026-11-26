/**
 * QUEM ESCREVEU, MESMO COM A CHAVE DE SERVIÇO (etapa 1.1c, 26/11/2026; migração 20261126000100).
 *
 * As rotas que gravam com `createServiceClient()` chegam ao banco sem usuário (auth.uid() nulo), e a escrita da
 * plataforma (superadmin dentro de uma empresa) não aparecia na Auditoria. Este `fetch` acompanha o cliente de
 * serviço e, SÓ nas escritas (POST/PATCH/PUT/DELETE: insert, update, upsert, delete e rpc), feitas DENTRO de uma
 * requisição com usuário logado, manda o id dele no cabeçalho `x-nexus-usuario`.
 *
 * Quem decide se vira linha de Auditoria é o banco (plataforma_auditar_escrita): aceita o cabeçalho só de
 * service_role e só se o id for de um superadmin com impersonação ativa. Escrita da equipe continua sem linha nova.
 *
 * O id vem do servidor de autenticação (`auth.getUser()`), nunca do cookie lido cru: um cookie forjado não consegue
 * pôr a escrita na conta de outra pessoa. Só pergunta com o cookie de impersonação presente (pista; ver
 * `vaiPerguntarUsuario`), uma vez por requisição (memória ligada ao objeto de cookies dela).
 * Fora de requisição (rotina, `after()`, script) não há cookies: segue sem cabeçalho, como antes.
 */

export const CABECALHO_USUARIO = 'x-nexus-usuario'

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])

function metodoDe(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
}

/**
 * Embrulha um `fetch`: nas escritas, pergunta quem é o usuário da requisição e, havendo, põe o cabeçalho.
 * Puro e testável: `obterUsuario` é injetado. Erro ao descobrir o usuário nunca derruba a escrita.
 */
export function comUsuarioNasEscritas(
  base: typeof fetch,
  obterUsuario: () => Promise<string | null>,
): typeof fetch {
  return async (input, init) => {
    if (LEITURA.has(metodoDe(input, init))) return base(input, init)
    let uid: string | null = null
    try { uid = await obterUsuario() } catch { uid = null }
    if (!uid) return base(input, init)
    const headers = new Headers(init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined))
    headers.set(CABECALHO_USUARIO, uid)
    return base(input, { ...init, headers })
  }
}

/** Uma verificação por requisição: a chave é o objeto de cookies da própria requisição. */
const porRequisicao = new WeakMap<object, Promise<string | null>>()

/** Cookie que as duas entradas da plataforma gravam (impersonar e laboratório), com o mesmo prazo do banco. */
export const COOKIE_IMPERSONACAO = 'impersonating_empresa_id'

/**
 * Vale a pena perguntar quem é o usuário? Só com sessão do Supabase (`sb-<projeto>-auth-token`, às vezes em pedaços)
 * E com o cookie de impersonação. É só uma pista para não custar uma ida ao servidor de autenticação em toda escrita
 * da equipe: quem decide é o banco, pela coluna impersonando_* do superadmin. Um cookie forjado por quem não é
 * superadmin só custa essa ida e não gera linha nenhuma.
 */
export function vaiPerguntarUsuario(cookies: { name: string; value: string }[]): boolean {
  const sessao = cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token') && c.value !== '')
  const plataforma = cookies.some((c) => c.name === COOKIE_IMPERSONACAO && c.value !== '')
  return sessao && plataforma
}

export async function usuarioDaRequisicao(): Promise<string | null> {
  let loja: { getAll(): { name: string; value: string }[] }
  try {
    const { cookies } = await import('next/headers')
    loja = await cookies()
  } catch {
    return null   // fora de requisição
  }
  if (!vaiPerguntarUsuario(loja.getAll())) return null
  let p = porRequisicao.get(loja)
  if (!p) {
    p = (async () => {
      const { createClient } = await import('./server')
      const sb = await createClient()
      const { data } = await sb.auth.getUser()
      return data.user?.id ?? null
    })().catch(() => null)
    porRequisicao.set(loja, p)
  }
  return p
}

/** O `fetch` que o cliente de serviço usa. */
export const fetchComUsuario: typeof fetch = comUsuarioNasEscritas((input, init) => fetch(input, init), usuarioDaRequisicao)
