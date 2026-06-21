import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import type { EvolutionConfig, OfficialConfig } from '@/lib/whatsapp/types'

export const metadata = { title: 'Configurações' }

async function getConfigs() {
  const supabase = await createClient()

  const [{ data: configs }, { data: taxas }] = await Promise.all([
    supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['whatsapp_evolution', 'whatsapp_official', 'dados_loja', 'preferencias']),
    supabase
      .from('taxas_pagamento')
      .select('forma_pagamento, parcelas, percentual_taxa')
      .eq('ativo', true),
  ])

  const evolution    = configs?.find(d => d.chave === 'whatsapp_evolution')?.valor as EvolutionConfig | undefined
  const official     = configs?.find(d => d.chave === 'whatsapp_official')?.valor as OfficialConfig | undefined
  const dadosLoja    = configs?.find(d => d.chave === 'dados_loja')?.valor ?? null
  const preferencias = configs?.find(d => d.chave === 'preferencias')?.valor ?? null

  return {
    evolution: evolution ?? null,
    official: official ?? null,
    dadosLoja, preferencias,
    taxas: (taxas ?? []).map((t: any) => ({
      forma_pagamento: t.forma_pagamento,
      parcelas: t.parcelas,
      percentual_taxa: Number(t.percentual_taxa),
    })),
  }
}

export default async function ConfiguracoesPage() {
  const { evolution, official, dadosLoja, preferencias, taxas } = await getConfigs()

  return (
    <>
      <Topbar eyebrow="SISTEMA" title="Configurações" />
      <ConfiguracoesView
        evolution={evolution}
        official={official}
        dadosLoja={dadosLoja}
        preferencias={preferencias}
        taxas={taxas}
      />
    </>
  )
}
