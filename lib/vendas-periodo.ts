import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarTudo } from '@/lib/zapintel/conversas'
import { FUSO_PADRAO, limitesDosDias } from '@/lib/datas'
import { dataDaConclusao, filtroConcluidaNoPeriodo, STATUS_EM_ABERTO } from '@/lib/vendas-mes'

/**
 * AS VENDAS DE UM PERÍODO, PELO DIA DA CONCLUSÃO, NO BANCO (25/11/2026).
 *
 * Os Relatórios carregavam as 500 vendas mais recentes pela data de LANÇAMENTO e filtravam o período no
 * navegador. Com o hotfix H1 a encomenda guarda o lançamento em `data_venda` e a entrega em `concluida_em`:
 * uma encomenda lançada há mais de 500 vendas e entregue hoje ficava fora do relatório de hoje.
 *
 * Agora o período vai para o banco — `coalesce(concluida_em, data_venda)` dentro de [de, ate] no fuso da
 * loja (lib/vendas-mes) — e a leitura é paginada até o fim (buscarTudo): nenhum teto.
 * Encomenda e pendente de entrega não entram (são o bloco "Em aberto", fora do faturamento).
 *
 * Volta ordenado pela data da conclusão, da mais recente para a mais antiga.
 */
export async function vendasDoPeriodo<T extends { id: number; concluida_em?: string | null; data_venda?: string | null }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  empresaId: number,
  colunas: string,
  dias: { de: string; ate: string },
  fuso: string = FUSO_PADRAO,
): Promise<T[]> {
  const { de, ate } = limitesDosDias(dias.de, dias.ate, fuso)
  const linhas = await buscarTudo<T>((ini, fim, primeira) =>
    db.from('vendas_vendas')
      .select(colunas, primeira ? { count: 'exact' } : undefined)
      .eq('empresa_id', empresaId)
      .not('status', 'in', `(${STATUS_EM_ABERTO.map((s) => `"${s}"`).join(',')})`)
      .or(filtroConcluidaNoPeriodo(de.toISOString(), ate.toISOString()))
      // Ordem estável para a paginação; a ordem de exibição vem depois.
      .order('id', { ascending: true })
      .range(ini, fim),
  )
  const chave = (v: T) => dataDaConclusao(v) ?? ''
  return linhas.sort((a, b) => (chave(a) < chave(b) ? 1 : chave(a) > chave(b) ? -1 : b.id - a.id))
}
