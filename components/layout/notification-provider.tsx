'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X, Bell } from 'lucide-react'
import { useTempoReal } from './tempo-real-empresa'

interface ToastNotif {
  id: string
  titulo: string
  corpo: string
  conversaId?: number
}

/**
 * Título da aba, aviso na tela e aviso do navegador para mensagem recebida.
 *
 * Desde 04/11/2026 (Inbox única) tudo sai do hub de tempo real da aba
 * (tempo-real-empresa.tsx): sem canal próprio e sem reler `lead_mensagens` e
 * `leads` a cada mensagem só para saber se a pessoa podia ver. O que o hub
 * entrega já passou pela RLS do Realtime — empresa e loja selecionada —, então
 * mensagem que chega aqui é mensagem que esta pessoa enxerga.
 *
 * Título: (nº de CONVERSAS com mensagem recebida não lida) empresa — CRM. O
 * mesmo número do sino.
 */
export function NotificationProvider({ empresaNome }: { empresaNome?: string }) {
  const router = useRouter()
  const nomeAba = empresaNome?.trim() || 'Nexus CRM'
  const { assinar, naoLidas, pronto } = useTempoReal()
  const [toasts, setToasts] = useState<ToastNotif[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((t: ToastNotif) => {
    setToasts(prev => [...prev.slice(-3), t]) // máximo 4 toasts
    setTimeout(() => removeToast(t.id), 6000)
  }, [removeToast])

  const n = naoLidas.length
  useEffect(() => {
    if (!pronto) return
    document.title = n > 0 ? `(${n}) ${nomeAba}` : nomeAba
  }, [n, nomeAba, pronto])

  useEffect(() => assinar(async (e) => {
    if (e.tabela !== 'mensagens' || e.tipo !== 'INSERT' || e.novo.direcao !== 'recebida') return
    const m = e.novo
    // Quem está com esta conversa aberta na Comunicação, com a aba à vista, já está vendo.
    if (typeof document !== 'undefined' && document.visibilityState === 'visible'
      && window.location.pathname === '/comunicacao'
      && new URLSearchParams(window.location.search).get('c') === String(m.conversa_id)) return

    let nome: string | null = null
    if (m.contato_id != null) {
      try {
        const { data } = await createClient().from('contatos').select('nome').eq('id', m.contato_id).maybeSingle()
        nome = (data as { nome: string | null } | null)?.nome ?? null
      } catch { /* sem nome: aviso genérico */ }
    }
    const titulo = nome ? `Nova mensagem de ${nome}` : 'Nova mensagem'
    const corpo = m.conteudo?.slice(0, 100) ?? ''
    addToast({ id: `${m.id}-${Date.now()}`, titulo, corpo, conversaId: m.conversa_id ?? undefined })

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(titulo, {
          body: m.conteudo?.slice(0, 120) ?? '',
          tag: `conversa-${m.conversa_id ?? m.id}`,
          renotify: true,
        } as NotificationOptions)
        notif.onclick = () => { window.focus(); router.push(m.conversa_id ? `/comunicacao?c=${m.conversa_id}` : '/comunicacao') }
        setTimeout(() => { try { notif.close() } catch {} }, 8000)
      } catch (err) {
        console.warn('[avisos] falha ao disparar notificação do navegador:', err)
      }
    }
  }), [assinar, addToast, router])

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
            {t.conversaId && (
              <button
                onClick={() => { router.push(`/comunicacao?c=${t.conversaId}`); removeToast(t.id) }}
                className="mt-1.5 text-[11.5px] font-semibold text-accent transition-colors hover:text-accent/80"
              >
                Abrir conversa →
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
