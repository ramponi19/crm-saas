import { createClient } from '@/lib/supabase/server'
import type { OfficialConfig, SendMessageParams, SendMessageResult, WhatsAppProvider } from './types'
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
  return official?.ativo ? 'official' : null
}

export async function sendWhatsApp(params: SendMessageParams & { empresaId: number }): Promise<SendMessageResult> {
  const official = await getConfig<OfficialConfig>('whatsapp_official', params.empresaId)

  // Sem API oficial ativa não há por onde enviar. Até 31/07/2026 caía na
  // Evolution; ela saiu porque o motivo de existir (não perder o WhatsApp do
  // celular) foi resolvido pela coexistência, dentro dos termos da Meta.
  if (!official?.ativo) {
    return { success: false, error: 'WhatsApp não conectado. Conecte em Administração > Canais.', provider: 'official' }
  }

  return sendViaOfficial(official, params)
}
