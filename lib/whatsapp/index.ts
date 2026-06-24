import { createClient } from '@/lib/supabase/server'
import type { EvolutionConfig, OfficialConfig, SendMessageParams, SendMessageResult, WhatsAppProvider } from './types'
import { sendViaEvolution } from './evolution'
import { sendViaOfficial } from './official'

async function getConfig<T>(chave: string, empresaId: number): Promise<T | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', chave)
    .eq('empresa_id', empresaId)
    .single()
  return (data?.valor ?? null) as T | null
}

export async function getActiveProvider(empresaId: number): Promise<WhatsAppProvider | null> {
  const official = await getConfig<OfficialConfig>('whatsapp_official', empresaId)
  if (official?.ativo) return 'official'

  const evolution = await getConfig<EvolutionConfig>('whatsapp_evolution', empresaId)
  if (evolution?.ativo) return 'evolution'

  return null
}

export async function sendWhatsApp(params: SendMessageParams & { empresaId: number }): Promise<SendMessageResult> {
  const { empresaId } = params
  const provider = params.provider ?? (await getActiveProvider(empresaId))

  if (!provider) {
    return { success: false, error: 'Nenhum provedor de WhatsApp ativo', provider: 'evolution' }
  }

  if (provider === 'official') {
    const config = await getConfig<OfficialConfig>('whatsapp_official', empresaId)
    if (!config) return { success: false, error: 'Configuração da API Oficial não encontrada', provider: 'official' }
    return sendViaOfficial(config, params)
  }

  const config = await getConfig<EvolutionConfig>('whatsapp_evolution', empresaId)
  if (!config) return { success: false, error: 'Configuração do Evolution não encontrada', provider: 'evolution' }
  return sendViaEvolution(config, params)
}
