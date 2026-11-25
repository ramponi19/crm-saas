import type {} from '@supabase/supabase-js'
import { permissoesDoVinculo, permsDoContexto } from './permissoes-cargo'

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

  // Etapa 1.1b: papel e permissões vêm do cargo do vínculo.
  const [vinculo, { data: usuarioRow }] = await Promise.all([
    permissoesDoVinculo(supabase, empresaId, user.id),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
  ])

  // Super admin (inclusive impersonando) enxerga a empresa inteira: é o papel de
  // suporte, e sem isso ele não consegue conferir a loja de ninguém.
  if (usuarioRow?.is_super_admin) return { soMeu: false, userId: user.id, papel: 'superadmin', motivo: 'super admin' }

  const papel = vinculo.papel ?? ''
  if (papel === 'owner' || papel === 'admin') {
    return { soMeu: false, userId: user.id, papel, motivo: 'dono ou admin' }
  }
  if (!papel) {
    // Antes isto liberava tudo. Não dá para distinguir "papel novo" de "leitura
    // que falhou", e o custo de errar para cada lado é assimétrico: restringir
    // atrapalha uma pessoa, liberar mostra o faturamento da loja a quem não deve.
    return { soMeu: true, userId: user.id, papel: '', motivo: 'papel não determinado — restringindo por segurança' }
  }

  const perms = permsDoContexto(vinculo)
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
