import { createServiceClient } from '@/lib/supabase/service'

/**
 * NUNCA SEM DONO (24/11/2026; migração 20261124001400). Universal, pela chave `distribuicao.sem_dono` da loja.
 *
 * Chamar DEPOIS de soltar um negócio (devolver, ausência, devolução automática à esteira). No modo 'roleta' da loja,
 * o banco entrega o negócio ao próximo da roleta de vendas (sem repetir quem acabou de sair) e grava 'distribuir'
 * no histórico; no modo 'esteira' (padrão), não faz nada e o negócio fica na Esteira, como hoje.
 * Devolve, por negócio, quem ficou com ele (null = esteira). Falha não desfaz a soltura: fica na esteira e registra.
 */
export async function aplicarSemDono(ids: number[], excluir: (string | null | undefined)[] = []): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>()
  if (!ids.length) return out
  const svc = createServiceClient()
  const p_excluir = excluir.filter((x): x is string => !!x)
  for (const id of ids) {
    const { data, error } = await svc.rpc('core_sem_dono_aplicar' as never, { p_negocio: id, p_excluir } as never)
    if (error) console.error('[sem-dono] negócio', id, error.message)
    out.set(id, (data as string | null) ?? null)
  }
  return out
}
