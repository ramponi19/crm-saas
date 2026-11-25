import type { SupabaseClient } from '@supabase/supabase-js'
import { diaNoFuso, instanteLocal, somarDias } from '@/lib/datas'

/**
 * CONTADOR DO PÓS-VENDA NO MENU (25/11/2026): passos pendentes atrasados + de hoje. Pela sessão: a RLS dá ao vendedor
 * os dele e ao dono/administrador os da equipe inteira (posvenda_acompanhamentos_leitura). Só com o módulo instalado
 * (quem chama confere); qualquer erro vira 0 — o menu nunca quebra por causa do contador.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function contarPosVendaDoDia(db: SupabaseClient<any>, empresaId: number, fuso: string, agora: Date = new Date()): Promise<number> {
  try {
    const amanha = instanteLocal(somarDias(diaNoFuso(agora, fuso), 1), '00:00', fuso).toISOString()
    const { count, error } = await db.from('posvenda_acompanhamentos').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('status', 'pendente').lt('previsto_para', amanha)
    return error ? 0 : count ?? 0
  } catch {
    return 0
  }
}
