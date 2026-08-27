'use client'

import { Bell, MessageSquare, Search } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
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

interface NotifLead {
  id: number
  nome: string | null
  produto_interessado: string | null
  origem: string | null
  nao_lidas: number
}

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
   * O nome que o segmento deu à tela vence o título escrito aqui dentro.
   *
   * Sem isto, renomear no menu deixava as duas metades da mesma página discordando:
   * "Pipeline" na lateral, "Leads" no topo.
   */
  const rotuloDoSegmento = useRotuloDaRota()
  const titulo = rotuloDoSegmento ?? title
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotifLead[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      // `leads!inner` + ativo FILTRA NA CONSULTA, não depois. Antes trazia as
      // 500 primeiras não lidas e só então descartava as de lead arquivado: com
      // a base antiga arquivada (1.900+ não lidas invisíveis), a janela de 500
      // podia ser inteira de lixo e o sino ficaria vazio justamente quando um
      // cliente real escrevesse.
      const { data: msgs } = await supabase
        .from('lead_mensagens').select('lead_id, leads!inner(ativo)')
        .eq('leads.ativo', true)
        .eq('lida', false).eq('direcao', 'recebida').limit(500)
      if (!msgs) return
      const contagem: Record<number, number> = {}
      for (const m of msgs as Array<{ lead_id: number | null }>) {
        const id = m.lead_id
        if (id != null) contagem[id] = (contagem[id] ?? 0) + 1
      }
      const ids = Object.keys(contagem).map(Number)
      if (ids.length === 0) { setNotifs([]); return }
      const { data: leads } = await supabase
        .from('leads').select('id, nome, produto_interessado, origem').in('id', ids).eq('ativo', true)
      type LeadNotifRow = { id: number; nome: string | null; produto_interessado: string | null; origem: string | null }
      setNotifs(((leads ?? []) as LeadNotifRow[]).map((l) => ({
        id: l.id, nome: l.nome, produto_interessado: l.produto_interessado, origem: l.origem, nao_lidas: contagem[l.id] ?? 0,
      })).sort((a, b) => b.nao_lidas - a.nao_lidas))
    }
    load()

    // Debounce: uma rajada de eventos (ex.: marcar várias como lidas) coalesce
    // em um único reload, em vez de refazer a contagem inteira a cada linha.
    let debounceT: ReturnType<typeof setTimeout> | null = null
    const scheduleLoad = () => { if (debounceT) clearTimeout(debounceT); debounceT = setTimeout(load, 800) }

    const channel = supabase
      .channel(`topbar_notifs_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_mensagens' }, async (payload: RealtimePostgresChangesPayload<{ direcao: string; lead_id: number; conteudo: string | null }>) => {
        scheduleLoad()
        if (payload.eventType === 'INSERT' && payload.new?.direcao === 'recebida') {
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            /**
             * O LEAD SER VISÍVEL É A CONDIÇÃO, não só a fonte do título.
             *
             * Esta assinatura escuta `lead_mensagens` inteira, sem filtro — e a
             * notificação saía com o TEXTO da mensagem antes de qualquer checagem.
             * Com filiais isso virou visível: o dono, com a Jaguariúna selecionada
             * no topo, recebia aviso de lead de Mogi Guaçu.
             *
             * A consulta abaixo passa pela RLS, que já sabe a empresa e a loja
             * selecionada. Lead que ela não devolve é lead que esta pessoa não pode
             * ver agora — então não há notificação. Quem decide é o banco, não um
             * filtro que eu escreveria aqui e esqueceria de atualizar depois.
             */
            let titulo = 'Nova mensagem'
            let podeVer = false
            try {
              const { data } = await supabase.from('leads').select('nome, origem').eq('id', payload.new.lead_id).maybeSingle()
              podeVer = !!data
              if (data?.nome) titulo = `Nova mensagem de ${data.nome}`
              else if (data?.origem) titulo = `Nova mensagem · ${data.origem}`
            } catch { /* falha de rede: sem certeza, não notifica */ }
            if (!podeVer) return
            try {
              const notif = new Notification(titulo, {
                body: payload.new.conteudo?.slice(0, 120) ?? '',
                tag: `lead-${payload.new.lead_id}`,
                renotify: true,
              } as NotificationOptions)
              notif.onclick = () => { window.focus(); router.push('/leads') }
              setTimeout(() => { try { notif.close() } catch {} }, 8000)
            } catch (e) {
              console.warn('[topbar] falha ao disparar notificação do navegador:', e)
            }
          }
        }
      })
      .subscribe()
    return () => { if (debounceT) clearTimeout(debounceT); supabase.removeChannel(channel) }
  }, [router])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const totalNaoLidas = notifs.reduce((s, n) => s + n.nao_lidas, 0)

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
              {totalNaoLidas > 0 && (
                <span className="num rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">{totalNaoLidas} não lidas</span>
              )}
            </div>
            <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
              {notifs.length === 0 ? (
                <div className="px-6 py-8 text-center text-[13px] text-ink-3">Tudo em dia.</div>
              ) : notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { setNotifOpen(false); router.push('/leads') }}
                  className="flex w-full items-center gap-3 border-b border-line-soft px-4 py-3 text-left transition-colors last:border-0 hover:bg-raised"
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-control bg-accent-soft text-accent"><MessageSquare size={15} strokeWidth={1.7} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{n.nome ?? `Lead #${n.id}`}</div>
                    <div className="truncate text-[11.5px] text-ink-3">
                      {n.nao_lidas} nova{n.nao_lidas > 1 ? 's' : ''} mensagem{n.nao_lidas > 1 ? 's' : ''}
                      {n.produto_interessado ? ` · ${n.produto_interessado}` : ''}
                    </div>
                  </div>
                  <span className="num flex-none rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{n.nao_lidas > 99 ? '99+' : n.nao_lidas}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setNotifOpen(false); router.push('/leads') }} className="w-full bg-accent-soft py-3 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/[0.14]">
              Ver todos os leads
            </button>
          </div>
        )}
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
