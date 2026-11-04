'use client'

import { Bell, MessageSquare, Search } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useTempoReal } from './tempo-real-empresa'
import { CommandPalette } from './command-palette'
import { SeletorFilial } from './seletor-filial'
import { useRotuloDaRota } from './rotulos-context'

interface TopbarProps {
  eyebrow?: string
  title?: string
  showPeriods?: boolean
  activePeriod?: string
  onPeriodChange?: (period: string) => void
}

/** O que o sino mostra de cada contato, lido só quando o sino abre. */
type ContatoDoSino = { nome: string | null; telefone: string | null; instagram: string | null }
const NO_SINO = 40

const periods = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
]

export function Topbar({ title = '', showPeriods = false, activePeriod = 'mes', onPeriodChange }: TopbarProps) {
  const router = useRouter()
  /**
   * O nome que o menu deu à tela vence o título escrito aqui dentro.
   *
   * Sem isto, renomear no menu deixava as duas metades da mesma página discordando:
   * "Pipeline" na lateral, "Leads" no topo.
   */
  const rotuloDoMenu = useRotuloDaRota()
  const titulo = rotuloDoMenu ?? title
  const [notifOpen, setNotifOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  /**
   * O SINO LÊ AS CONVERSAS (04/11/2026, Inbox única). A contagem e a lista vêm do
   * hub de tempo real da aba (tempo-real-empresa.tsx), que carrega uma vez as
   * conversas com `nao_lidas > 0` e as atualiza com o que chega — sem reler nada a
   * cada mensagem e sem a view `leads`. Os nomes dos contatos só são lidos quando
   * o sino abre, para as primeiras NO_SINO.
   *
   * O aviso do navegador (Notification) saiu daqui: mora com o aviso da tela, no
   * NotificationProvider, que escuta o mesmo hub.
   */
  const { naoLidas } = useTempoReal()
  const [contatos, setContatos] = useState<Record<number, ContatoDoSino>>({})
  const visiveis = naoLidas.slice(0, NO_SINO)
  const chaveFaltam = notifOpen
    ? visiveis.map((c) => c.contato_id).filter((id): id is number => id != null && !(id in contatos)).join(',')
    : ''
  useEffect(() => {
    if (!chaveFaltam) return
    const ids = chaveFaltam.split(',').map(Number)
    createClient().from('contatos').select('id, nome, telefone, instagram').in('id', ids).then(({ data }) => {
      const novos: Record<number, ContatoDoSino> = {}
      for (const c of (data ?? []) as ({ id: number } & ContatoDoSino)[]) novos[c.id] = { nome: c.nome, telefone: c.telefone, instagram: c.instagram }
      for (const id of ids) if (!(id in novos)) novos[id] = { nome: null, telefone: null, instagram: null }
      setContatos((atual) => ({ ...atual, ...novos }))
    })
  }, [chaveFaltam])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const totalNaoLidas = naoLidas.reduce((s, n) => s + n.nao_lidas, 0)
  const conversasNaoLidas = naoLidas.length

  /**
   * O rodapé do menu tem "Notificações" (21/10/2026), mas o sino continua MORANDO
   * aqui: é aqui que está a assinatura de tempo real. O menu só pede para abrir e
   * escuta o total para acender o ponto — sem uma segunda assinatura nem consulta.
   */
  useEffect(() => {
    const abrir = () => setNotifOpen(true)
    window.addEventListener('notificacoes:abrir', abrir)
    return () => window.removeEventListener('notificacoes:abrir', abrir)
  }, [])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('notificacoes:total', { detail: totalNaoLidas }))
  }, [totalNaoLidas])

  return (
    <header suppressHydrationWarning className="z-10 flex h-[52px] shrink-0 items-center gap-3 border-b border-line-soft bg-card/90 px-5 backdrop-blur-md">
      <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">{titulo}</span>

      <div className="flex-1" />

      {showPeriods && (
        <div className="hidden gap-0.5 rounded-control border border-line bg-raised p-0.5 sm:flex">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange?.(p.value)}
              className={cn('rounded-[6px] px-3 py-1 text-[12px] font-medium transition-colors',
                activePeriod === p.value ? 'bg-card text-ink shadow-[0_1px_2px_rgba(21,24,28,0.08)]' : 'text-ink-2 hover:text-ink')}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/*
        Em qual loja estou. Vem antes da busca porque muda o significado de tudo
        que a tela mostra — e some sozinho quando a empresa tem uma loja só.
      */}
      <SeletorFilial />

      {/* Gatilho do Command Palette (⌘K) */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden w-[270px] items-center gap-2.5 rounded-control border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:border-ink/20 md:flex"
      >
        <Search size={15} strokeWidth={1.7} />
        <span className="flex-1 text-left">Buscar ou executar ação…</span>
        <kbd className="rounded-[4px] border border-line bg-raised px-1.5 text-[10.5px] font-semibold text-ink-2">⌘K</kbd>
      </button>

      {/* Notificações */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setNotifOpen((o) => !o)}
          aria-label="Notificações"
          className="relative grid h-8 w-8 place-items-center rounded-control border border-line bg-card text-ink-2 transition-colors hover:bg-bg"
        >
          <Bell size={16} strokeWidth={1.7} />
          {totalNaoLidas > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border-2 border-card bg-accent" />}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-[42px] z-30 w-[330px] overflow-hidden rounded-card border border-line bg-card shadow-[0_24px_60px_-24px_rgba(21,24,28,0.35)] animate-[uiPop_0.16s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
              <span className="text-[14px] font-semibold text-ink">Notificações</span>
              {conversasNaoLidas > 0 && (
                <span className="num rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {conversasNaoLidas} conversa{conversasNaoLidas > 1 ? 's' : ''} não lida{conversasNaoLidas > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
              {visiveis.length === 0 ? (
                <div className="px-6 py-8 text-center text-[13px] text-ink-3">Tudo em dia.</div>
              ) : visiveis.map((n) => {
                const c = n.contato_id != null ? contatos[n.contato_id] : undefined
                const nome = c?.nome || c?.telefone || (c?.instagram ? '@' + c.instagram : null)
                return (
                <button
                  key={n.id}
                  onClick={() => { setNotifOpen(false); router.push('/comunicacao?c=' + n.id) }}
                  className="flex w-full items-center gap-3 border-b border-line-soft px-4 py-3 text-left transition-colors last:border-0 hover:bg-raised"
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-control bg-accent-soft text-accent"><MessageSquare size={15} strokeWidth={1.7} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{nome ?? (c ? 'Contato sem nome' : '…')}</div>
                    <div className="truncate text-[11.5px] text-ink-3">
                      {n.nao_lidas} {n.nao_lidas > 1 ? 'novas mensagens' : 'nova mensagem'}
                    </div>
                  </div>
                  <span className="num flex-none rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{n.nao_lidas > 99 ? '99+' : n.nao_lidas}</span>
                </button>
                )
              })}
              {conversasNaoLidas > visiveis.length && (
                <div className="px-4 py-2.5 text-center text-[11.5px] text-ink-3">e mais {conversasNaoLidas - visiveis.length} na Comunicação</div>
              )}
            </div>
            <button onClick={() => { setNotifOpen(false); router.push('/comunicacao?filtro=nao_lidas') }} className="w-full bg-accent-soft py-3 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/[0.14]">
              Abrir a Comunicação
            </button>
          </div>
        )}
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
