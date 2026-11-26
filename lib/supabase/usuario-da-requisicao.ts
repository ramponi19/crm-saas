import { cookies } from 'next/headers'
import { createClient } from './server'
import { registrarObterUsuario, vaiPerguntarUsuario } from './usuario-na-escrita'

/**
 * Quem é o usuário desta requisição, para o cabeçalho de escrita do cliente de serviço (1.1c; ver
 * lib/supabase/usuario-na-escrita.ts). SÓ SERVIDOR: carregado pelo instrumentation.ts, nunca por componente
 * (scripts/check-servico.mjs recusa outro importador).
 *
 * O id vem do servidor de autenticação (`auth.getUser()`), nunca do cookie lido cru: um cookie forjado não consegue
 * pôr a escrita na conta de outra pessoa. Só pergunta com o cookie de impersonação presente (pista), uma vez por
 * requisição (memória ligada ao objeto de cookies dela). Fora de requisição (rotina, after(), script): nulo.
 */
const porRequisicao = new WeakMap<object, Promise<string | null>>()

export async function usuarioDaRequisicao(): Promise<string | null> {
  let loja: Awaited<ReturnType<typeof cookies>>
  try {
    loja = await cookies()
  } catch {
    return null   // fora de requisição
  }
  if (!vaiPerguntarUsuario(loja.getAll())) return null
  let p = porRequisicao.get(loja)
  if (!p) {
    p = (async () => {
      const sb = await createClient()
      const { data } = await sb.auth.getUser()
      return data.user?.id ?? null
    })().catch(() => null)
    porRequisicao.set(loja, p)
  }
  return p
}

/** Liga o gancho (instrumentation.ts, runtime nodejs). */
export function registrarUsuarioNaEscrita(): void {
  registrarObterUsuario(usuarioDaRequisicao)
}
