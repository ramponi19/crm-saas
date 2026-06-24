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
          className="pointer-events-auto flex items-start gap-3 w-[320px] bg-[#0E1A2C] border border-white/[0.12] rounded-[14px] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          style={{ animation: 'slideInRight 0.22s ease' }}
        >
          <div className="w-8 h-8 rounded-[9px] bg-[rgba(215,40,47,0.18)] flex items-center justify-center flex-none mt-0.5">
            <Bell size={15} className="text-[#F0353D]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#F4F6F9] truncate">{t.titulo}</div>
            {t.corpo && (
              <div className="text-[12px] text-[#8A9BB0] mt-0.5 line-clamp-2">{t.corpo}</div>
            )}
            {t.leadId && (
              <button
                onClick={() => { router.push('/leads'); removeToast(t.id) }}
                className="text-[11.5px] text-[#F0656B] font-semibold mt-1.5 hover:text-[#FF7A80] transition-colors"
              >
                Abrir lead →
              </button>
            )}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-[#46586E] hover:text-[#9FB0C2] transition-colors flex-none mt-0.5"
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
