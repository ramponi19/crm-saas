import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarConfigEmpresa, vocabulario } from '@/lib/empresa-config'

/**
 * COMO CHAMAR QUEM ATENDE, NO ZAPINTEL: o vocabulário da empresa no CRM
 * (`vocabulario(cfg).equipe`, "Vendedor" por padrão).
 *
 * Até 17/11/2026 vinha de um mapa por PRESET de onboarding (varejo → Vendedor,
 * e um papel por ramo): texto de ramo dentro de um módulo vendido a qualquer
 * empresa. O vocabulário é o mesmo que o CRM já usa nas telas (Agenda, Clientes,
 * Ranking), então o ZapIntel e o CRM chamam a mesma pessoa pelo mesmo nome.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function papelDaEmpresa(db: SupabaseClient<any>, empresaId: number): Promise<string> {
  return vocabulario(await carregarConfigEmpresa(db, empresaId)).equipe
}
