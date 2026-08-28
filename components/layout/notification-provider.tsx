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

export function NotificationProvider({ empresaNome }: { empresaNome?: string }) {
  const router = useRouter()
  const nomeAba = empresaNome?.trim() || 'Nexus CRM'
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

    /**
     * Título da aba: (nº de LEADS ativos aguardando resposta) empresa — CRM.
     *
     * Contava varrendo `lead_mensagens` por `lida = false`, SEM olhar se o lead
     * ainda está ativo. Ao arquivar a base antiga, a aba passou a anunciar 184
     * conversas pendentes que não existem mais para ninguém — e número que não
     * corresponde a nada é pior que número nenhum: ensina o vendedor a ignorar o
     * aviso.
     *
     * Agora lê o contador do próprio lead: uma consulta em `leads` em vez de
     * trazer milhares de mensagens para contar no navegador.
     */
    async function updateTitle() {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('ativo', true)
        .gt('msgs_nao_lidas', 0)
      const n = count ?? 0
      document.title = n > 0 ? `(${n}) ${nomeAba}` : nomeAba
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

        /**
         * SÓ AVISA SE A PESSOA PODE VER O LEAD — quem decide é a RLS.
         *
         * Com a Jaguariúna selecionada no topo, o lead de Mogi some da lista mas
         * a notificação dele subia na tela, com o texto da mensagem do cliente.
         * A consulta abaixo já era feita, e o resultado nulo era ignorado: o
         * toast aparecia mesmo assim, como "Nova mensagem" genérica. Aviso que
         * vaza é pior que lista que vaza, porque chega sozinho e ninguém pediu.
         *
         * Não replicar a regra de loja aqui: pergunta-se ao banco, e o banco
         * responde com o que aquela sessão enxerga.
         */
        let lead: { nome: string | null } | null = null
        try {
          const { data } = await supabase
            .from('leads')
            .select('nome')
            .eq('id', novo.lead_id)
            .maybeSingle()
          lead = data as { nome: string | null } | null
        } catch { return }
        if (!lead) return

        addToast({
          id: `${novo.id}-${Date.now()}`,
          titulo: lead.nome ? `Nova mensagem de ${lead.nome}` : 'Nova mensagem',
          corpo: novo.conteudo?.slice(0, 100) ?? '',
          leadId: novo.lead_id,
        })
      })
      // Mensagens marcadas como lidas (UPDATE em `lida`) fazem o contador da aba
      // DESCER em tempo real — sem toast, só recalcula.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'lead_mensagens',
      }, () => {
        updateTitle()
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [addToast, nomeAba])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-[88px] right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-[320px] max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-card border border-line bg-card p-4 shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)]"
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
                onClick={() => { router.push(`/leads?lead=${t.leadId}`); removeToast(t.id) }}
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
