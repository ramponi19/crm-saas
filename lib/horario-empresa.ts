import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAVE_HORARIO, CHAVE_HORARIO_ANTIGA, horarioDaLoja, type Horario } from '@/lib/horario'
import { envelopesDaConfig } from '@/lib/config'

/**
 * O horário de funcionamento que vale para a empresa (ou para a loja), lido do banco (fase 2, 24/11/2026).
 * `core.horario` (loja → empresa, em empresa_config) → `horario_comercial` antigo → padrão seg–sex 9h–18h. Servidor só.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function horarioDaEmpresa(db: SupabaseClient<any>, empresaId: number, filialId?: number | null): Promise<Horario> {
  // core.horario no motor de configuração (empresa_config, etapa 1.1a); o formato antigo segue em configuracoes_sistema.
  const [envs, { data }] = await Promise.all([
    envelopesDaConfig(db, empresaId, { chaves: [CHAVE_HORARIO] }),
    db.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE_HORARIO_ANTIGA).maybeSingle(),
  ])
  return horarioDaLoja(envs[CHAVE_HORARIO] ?? null, (data as { valor: unknown } | null)?.valor ?? null, filialId ?? null)
}
