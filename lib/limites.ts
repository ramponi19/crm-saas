import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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

  /**
   * O USO E CONTADO PELA EMPRESA, e por isso pelo service-role.
   *
   * A RLS de `leads` passou a filtrar pela loja selecionada no topo (filiais). Se a
   * contagem viesse pelo cliente com RLS, uma empresa com duas lojas zeraria o
   * contador ao trocar de loja: enche a Loja 1 ate o teto, troca para a Loja 2 e o
   * teto "volta ao zero" — passando do plano que ela paga, sem nada barrar.
   *
   * O limite e do plano da EMPRESA, entao a conta tambem tem de ser.
   */
  const svc = createServiceClient()
  const { count } = recurso === 'leads'
    ? await svc.from('leads').select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId).eq('ativo', true)
    : await svc.from('empresa_usuarios').select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId).eq('ativo', true)
  const usoAtual = count ?? 0

  const percentual = limite > 0 ? (usoAtual / limite) * 100 : 0
  return {
    permitido: limite === 0 || usoAtual < limite,
    usoAtual,
    limite,
    percentual,
  }
}
