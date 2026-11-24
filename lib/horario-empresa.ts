import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAVE_HORARIO, CHAVE_HORARIO_ANTIGA, horarioDaLoja, type Horario } from '@/lib/horario'

/**
 * O horário de funcionamento que vale para a empresa (ou para a loja), lido do banco (fase 2, 24/11/2026).
 * `core.horario` (loja → empresa) → `horario_comercial` antigo → padrão seg–sex 9h–18h. Servidor só.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function horarioDaEmpresa(db: SupabaseClient<any>, empresaId: number, filialId?: number | null): Promise<Horario> {
  const { data } = await db.from('configuracoes_sistema').select('chave, valor')
    .eq('empresa_id', empresaId).in('chave', [CHAVE_HORARIO, CHAVE_HORARIO_ANTIGA])
  const linhas = (data ?? []) as { chave: string; valor: unknown }[]
  return horarioDaLoja(linhas.find((l) => l.chave === CHAVE_HORARIO)?.valor ?? null,
    linhas.find((l) => l.chave === CHAVE_HORARIO_ANTIGA)?.valor ?? null, filialId ?? null)
}
