import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Quem captou imóvel no período — a métrica que faltava no ranking.
 *
 * POR QUE UM MÓDULO SEPARADO: `lib/ranking.ts` é núcleo e serve todo segmento; ele
 * não pode consultar `imoveis`, que é tabela de vertical. Este arquivo é a camada da
 * imobiliária: responde a pergunta dela e devolve um número por pessoa, que o
 * ranking recebe pronto.
 *
 * O QUE CONTA: `captado_em` dentro do período e `captado_por` preenchido. Imóvel
 * cadastrado sem dizer quem captou não entra — inventar um dono premiaria a pessoa
 * errada, e o ranking existe justamente para dizer quem fez o quê.
 */
export async function imoveisCaptadosPorPessoa(
  db: SupabaseClient,
  empresaId: number,
  /** Início do período (ISO). Mesma janela usada pelo ranking. */
  ini: string,
  /** Fim do período, exclusivo (ISO). */
  fim: string,
): Promise<Map<string, number>> {
  /**
   * `captado_em` é coluna `date`, e a janela vem como timestamp ISO (UTC).
   *
   * Comparar os dois direto erra no primeiro e no último dia do mês: a janela local
   * de agosto começa em 01/08 03:00Z, e um imóvel captado em 01/08 ficaria de fora.
   * Por isso a comparação usa só a parte da data.
   */
  const soData = (iso: string) => iso.slice(0, 10)

  const { data, error } = await db
    .from('imoveis')
    .select('captado_por')
    .eq('empresa_id', empresaId)
    .not('captado_por', 'is', null)
    .gte('captado_em', soData(ini))
    .lt('captado_em', soData(fim))

  // Falha de consulta devolve mapa vazio: coluna zerada é melhor que tela quebrada,
  // e o ranking continua mostrando venda, visita e proposta.
  if (error) return new Map()

  const porPessoa = new Map<string, number>()
  for (const r of (data ?? []) as { captado_por: string | null }[]) {
    if (!r.captado_por) continue
    porPessoa.set(r.captado_por, (porPessoa.get(r.captado_por) ?? 0) + 1)
  }
  return porPessoa
}
