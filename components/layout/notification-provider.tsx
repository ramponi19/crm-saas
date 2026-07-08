'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { X, Bell } from 'lucide-react'

interface ToastNotif {
  id: string
  titulo: string
  corpo: string
  leadId?: number
}

export function NotificationProvider() {
  const router = useRouter()
  const [toasts, setToasts] = useState<ToastNotif[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((t: ToastNotif) => {
    setToasts(prev => [...prev.slice(-3), t]) // máximo 4 toasts
    setTimeout(() => removeToast(t.id), 6000)
  }, [removeToast])

  useEffect(() => {
    const supabase = createClient()

    // Atualiza título da aba com contagem de não lidas
    async function updateTitle() {
      const { data } = await supabase
        .from('lead_mensagens')
        .select('lead_id')
        .eq('lida', false)
        .eq('direcao', 'recebida')
      const count = data?.length ?? 0
      document.title = count > 0 ? `(${count}) 🔔 JM Store — CRM` : 'JM Store — CRM'
    }
    updateTitle()

    // Realtime: escuta novas mensagens recebidas
    const channel = supabase
      .channel(`notif_global_${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'lead_mensagens',
      }, async (payload: RealtimePostgresChangesPayload<{ id: number; direcao: string; lead_id: number; conteudo: string | null }>) => {
        const novo = payload.new as { id: number; direcao: string; lead_id: number; conteudo: string | null }
        if (novo.direcao !== 'recebida') return

        updateTitle()

        // Busca nome do lead
        let titulo = 'Nova mensagem'
        const corpo = novo.conteudo?.slice(0, 100) ?? ''
        try {
          const { data } = await supabase
            .from('leads')
            .select('nome, origem')
            .eq('id', novo.lead_id)
            .maybeSingle()
          if (data?.nome) titulo = `Nova mensagem de ${data.nome}`
        } catch {}

        // Toast in-app
        addToast({
          id: `${novo.id}-${Date.now()}`,
          titulo,
          corpo,
          leadId: novo.lead_id,
        })
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-[320px] items-start gap-3 rounded-card border border-line bg-card p-4 shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)]"
          style={{ animation: 'slideInRight 0.22s ease' }}
        >
          <div className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-control bg-accent-soft">
            <Bell size={15} strokeWidth={1.7} className="text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{t.titulo}</div>
            {t.corpo && (
              <div className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{t.corpo}</div>
            )}
            {t.leadId && (
              <button
                onClick={() => { router.push('/leads'); removeToast(t.id) }}
                className="mt-1.5 text-[11.5px] font-semibold text-accent transition-colors hover:text-accent/80"
              >
                Abrir lead →
              </button>
            )}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="mt-0.5 flex-none text-ink-3 transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
