import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import { VAPID_PUBLIC_KEY } from '@/lib/vapid'

const PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@nexuscrm.com.br'

let configurado = false
function garantirConfig(): boolean {
  if (!PRIVATE) return false // sem chave privada em env → push desligado (no-op seguro)
  if (!configurado) {
    webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC_KEY, PRIVATE)
    configurado = true
  }
  return true
}

export interface PushPayload { title: string; body: string; url?: string; tag?: string }

/** Envia um push a todos os dispositivos inscritos de um usuário (dentro da empresa). */
export async function enviarPush(usuarioId: string, empresaId: number, payload: PushPayload) {
  if (!garantirConfig()) return
  const svc = createServiceClient()
  const { data: subs } = await svc
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('usuario_id', usuarioId)
    .eq('empresa_id', empresaId)
  if (!subs?.length) return

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        )
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        // 404/410 = inscrição expirada/removida no navegador → limpa
        if (code === 404 || code === 410) await svc.from('push_subscriptions').delete().eq('id', s.id)
      }
    })
  )
}
