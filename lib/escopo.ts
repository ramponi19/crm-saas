import type { SupabaseClient } from '@supabase/supabase-js'
import { permsDoPapel, type PermissoesMap } from './permissoes'

/**
 * Decide se o usuário vê apenas o que é DELE (vendas, histórico, orçamentos,
 * números do dashboard) ou o da empresa inteira.
 *
 * Existia copiado em três telas, e o dashboard vazava o faturamento da loja para
 * o vendedor mesmo com a regra escrita — três cópias, três chances de errar em
 * silêncio. Aqui é um lugar só.
 *
 * FALHA FECHADO, e isso é o ponto principal. A versão anterior tinha
 * `!!papel && ...`: se o papel não fosse determinado, o usuário caía em "vê
 * tudo". Numa checagem de permissão, dúvida tem de restringir, não liberar —
 * senão qualquer falha de leitura vira vazamento de faturamento.
 */
export interface Escopo {
  /** true = filtrar por este usuário. */
  soMeu: boolean
  userId: string | null
  papel: string
  /** Por que decidiu assim — vai para o log quando restringe por dúvida. */
  motivo: string
}

export async function escopoDoUsuario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  empresaId: number,
): Promise<Escopo> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { soMeu: true, userId: null, papel: '', motivo: 'sem sessão' }

  const [{ data: vinculo }, { data: usuarioRow }, { data: empresa }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role')
      .eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
    supabase.from('empresas').select('permissoes').eq('id', empresaId).maybeSingle(),
  ])

  // Super admin (inclusive impersonando) enxerga a empresa inteira: é o papel de
  // suporte, e sem isso ele não consegue conferir a loja de ninguém.
  if (usuarioRow?.is_super_admin) return { soMeu: false, userId: user.id, papel: 'superadmin', motivo: 'super admin' }

  const papel = (vinculo?.role as string | undefined) ?? ''
  if (papel === 'owner' || papel === 'admin') {
    return { soMeu: false, userId: user.id, papel, motivo: 'dono ou admin' }
  }
  if (!papel) {
    // Antes isto liberava tudo. Não dá para distinguir "papel novo" de "leitura
    // que falhou", e o custo de errar para cada lado é assimétrico: restringir
    // atrapalha uma pessoa, liberar mostra o faturamento da loja a quem não deve.
    return { soMeu: true, userId: user.id, papel: '', motivo: 'papel não determinado — restringindo por segurança' }
  }

  const perms = permsDoPapel(papel, (empresa?.permissoes ?? null) as PermissoesMap | null)
  return perms.verVendasOutros
    ? { soMeu: false, userId: user.id, papel, motivo: 'permissão verVendasOutros' }
    : { soMeu: true, userId: user.id, papel, motivo: 'sem permissão de ver de outros' }
}

/** Aplica o filtro do escopo numa consulta, quando houver. */
export function aplicarEscopo<T extends { eq: (coluna: string, valor: string) => T }>(
  q: T, escopo: Escopo, coluna: string,
): T {
  return escopo.soMeu && escopo.userId ? q.eq(coluna, escopo.userId) : q
}
