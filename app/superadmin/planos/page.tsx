import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/superadmin'
import { MODULOS } from '@/core/modulos'
import { EXTRAS, type PrecoAdicional } from '@/lib/precos-adicionais'
import { PLANO_BASE } from '@/lib/plano'
import PlanosAdminView from './planos-admin-view'

/**
 * Plano único + módulos (18/11/2026): o plano base (planos_config 'base', o resumo do cadastro e da landing)
 * e a tabela de preços de módulos e extras (precos_adicionais). Os planos antigos ficam só no histórico.
 */
export default async function PlanosAdminPage() {
  await requireSuperAdmin()
  const supabase = await createClient()
  const [{ data: planos }, { data: precos }] = await Promise.all([
    supabase.from('planos_config').select('*').order('ordem'),
    supabase.from('precos_adicionais').select('chave, tipo, nome, preco_centavos, unidade, ativo'),
  ])
  const lista = planos ?? []
  const salvos = new Map(((precos ?? []) as PrecoAdicional[]).map((p) => [p.chave, p]))
  // Toda linha possível aparece (os 3 extras e cada módulo do manifesto); sem linha no banco = "a definir".
  const itens: PrecoAdicional[] = [
    ...EXTRAS.map((e) => salvos.get(e.chave) ?? { chave: e.chave, tipo: 'extra' as const, nome: e.nome, unidade: e.unidade, preco_centavos: null, ativo: true }),
    ...MODULOS.map((m) => ({ ...(salvos.get(m.chave) ?? { chave: m.chave, tipo: 'modulo' as const, unidade: 'por mês', preco_centavos: null, ativo: true }), nome: m.nome })),
  ]
  return (
    <PlanosAdminView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      base={(lista.find((p) => p.id === PLANO_BASE) ?? null) as any}
      antigos={lista.filter((p) => p.id !== PLANO_BASE).map((p) => p.nome)}
      itens={itens}
    />
  )
}
