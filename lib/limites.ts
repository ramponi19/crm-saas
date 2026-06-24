import { createClient } from '@/lib/supabase/server'

export type RecursoLimitado = 'leads' | 'usuarios'

interface ResultadoLimite {
  permitido: boolean
  usoAtual: number
  limite: number
  percentual: number
}

/**
 * Verifica se um tenant pode criar mais de um recurso (leads ou usuários),
 * comparando o uso atual com o limite do plano (colunas em empresas).
 */
export async function verificarLimite(
  empresaId: number,
  recurso: RecursoLimitado
): Promise<ResultadoLimite> {
  const supabase = await createClient()

  const { data: empresa } = await supabase
    .from('empresas')
    .select('limite_leads, limite_usuarios')
    .eq('id', empresaId)
    .single()

  const limite = recurso === 'leads'
    ? (empresa?.limite_leads ?? 0)
    : (empresa?.limite_usuarios ?? 0)

  let usoAtual = 0
  if (recurso === 'leads') {
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
    usoAtual = count ?? 0
  } else {
    const { count } = await supabase
      .from('empresa_usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
    usoAtual = count ?? 0
  }

  const percentual = limite > 0 ? (usoAtual / limite) * 100 : 0
  return {
    permitido: limite === 0 || usoAtual < limite,
    usoAtual,
    limite,
    percentual,
  }
}
