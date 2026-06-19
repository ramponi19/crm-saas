import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { ConfiguracoesView } from '@/components/modules/configuracoes/configuracoes-view'
import type { EvolutionConfig, OfficialConfig } from '@/lib/whatsapp/types'

export const metadata = { title: 'Configurações' }

async function getConfigs() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', ['whatsapp_evolution', 'whatsapp_official'])

  const evolution = data?.find(d => d.chave === 'whatsapp_evolution')?.valor as EvolutionConfig | undefined
  const official = data?.find(d => d.chave === 'whatsapp_official')?.valor as OfficialConfig | undefined

  return { evolution: evolution ?? null, official: official ?? null }
}

export default async function ConfiguracoesPage() {
  const { evolution, official } = await getConfigs()

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Configurações" />
      <div className="flex-1 overflow-auto p-6">
        <ConfiguracoesView evolution={evolution} official={official} />
      </div>
    </div>
  )
}
