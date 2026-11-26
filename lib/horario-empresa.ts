import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAVE_HORARIO, horarioDaLoja, type Horario } from '@/lib/horario'
import { envelopesDaConfig } from '@/lib/config'

/**
 * O horário de funcionamento que vale para a empresa (ou para a loja), lido do banco.
 * `core.horario` (loja → empresa, em empresa_config) → padrão seg–sex 9h–18h. Servidor só.
 * 1.1h parte 2 (26/11/2026): o formato antigo (`horario_comercial`) não é mais lido; desde a 1.1i toda empresa tem
 * `core.horario` explícito.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function horarioDaEmpresa(db: SupabaseClient<any>, empresaId: number, filialId?: number | null): Promise<Horario> {
  const envs = await envelopesDaConfig(db, empresaId, { chaves: [CHAVE_HORARIO] })
  return horarioDaLoja(envs[CHAVE_HORARIO] ?? null, null, filialId ?? null)
}
