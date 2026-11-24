import type { SupabaseClient } from '@supabase/supabase-js'
import { moduloLigado, type ModuloRow } from '@/lib/empresa-config'

export const MODULO_POSVENDA = 'posvenda'

/**
 * O PÓS-VENDA ESTÁ LIGADO NESTA EMPRESA? (C7, 24/11/2026)
 *
 * Lê a linha de empresa_modulos, a mesma que as RPCs conferem no banco (core_modulo_ligado → MODULO_DESLIGADO).
 * Enquanto o módulo está "em preparação" no manifesto, a conta do menu (ligadosDaEmpresa) o dá sempre como desligado
 * e ninguém o instala pela Central; a tela e as rotas dele valem só onde a linha foi gravada à mão (testes e a
 * primeira empresa, com o ok do Lucas). Quando sair da preparação (C8), a conta é a mesma.
 */
/**
 * As tabelas posvenda_* ainda não estão em types/database.gerado.ts (o gerador roda contra um banco com todas as
 * migrações; a próxima regeneração as traz). Até lá, as leituras do módulo usam o cliente sem o tipo do banco.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function semTipo(db: SupabaseClient<any>): SupabaseClient { return db as unknown as SupabaseClient }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function posvendaLigado(db: SupabaseClient<any>, empresaId: number): Promise<boolean> {
  const { data } = await db.from('empresa_modulos').select('modulo, ativo').eq('empresa_id', empresaId).eq('modulo', MODULO_POSVENDA)
  return moduloLigado((data ?? []) as ModuloRow[], MODULO_POSVENDA)
}
