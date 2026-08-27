import { createServiceClient } from '@/lib/supabase/service'
import type { Filial } from '@/lib/filiais'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Números da REDE — a empresa inteira, independente da loja selecionada.
 *
 * Por que service-role, contra a regra geral do projeto: a RLS de `leads` passou a
 * filtrar pela loja escolhida no topo, e estas contas respondem a uma pergunta
 * sobre a EMPRESA. Lidas pelo cliente com RLS, o dono com a Loja 2 selecionada veria
 * "Loja 1: 0 leads" — número falso justamente na tela onde ele confere se a
 * separação está certa.
 *
 * O mesmo raciocínio vale, com consequência maior, para o limite do plano: contado
 * por loja, o tenant zeraria o contador ao trocar de loja e passaria do que paga.
 * Ver `lib/limites.ts`.
 *
 * Uma consulta por loja. São poucas lojas por empresa, e a alternativa — trazer
 * todos os leads para contar em memória — custa mais.
 */
export async function contarLeadsPorFilial(
  svc: Svc,
  empresaId: number,
  filiais: Pick<Filial, 'id'>[],
  opcoes: { soAtivos?: boolean } = {},
): Promise<{ porFilial: Map<number, number>; semFilial: number; total: number }> {
  const base = () => {
    const q = svc.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
    return opcoes.soAtivos ? q.eq('ativo', true) : q
  }

  const contagens = await Promise.all(
    filiais.map(async (f) => {
      const { count } = await base().eq('filial_id', f.id)
      return [f.id, count ?? 0] as const
    }),
  )
  const { count: semFilial } = await base().is('filial_id', null)
  const porFilial = new Map(contagens)

  let total = semFilial ?? 0
  for (const n of porFilial.values()) total += n

  return { porFilial, semFilial: semFilial ?? 0, total }
}
