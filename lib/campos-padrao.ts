import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampoPadrao } from '@/core/campos'

/**
 * Garante na empresa os campos de partida (core/campos.ts, ou os `campos` de um
 * módulo do manifesto). Não reativa nem muda o que já existe: campo que o dono
 * desligou continua desligado.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function garantirCampos(svc: SupabaseClient<any>, empresaId: number, campos: CampoPadrao[], moduloDono: string | null): Promise<{ error: string | null }> {
  if (!campos.length) return { error: null }
  const { error } = await svc.from('campos_personalizados').upsert(campos.map((c) => ({
    empresa_id: empresaId, entidade: c.entidade, chave: c.chave, rotulo: c.rotulo, tipo: c.tipo,
    opcoes: c.opcoes ?? [], modulo_dono: moduloDono, ordem: c.ordem, ativo: true,
  })), { onConflict: 'empresa_id,entidade,chave', ignoreDuplicates: true })
  return { error: error?.message ?? null }
}
