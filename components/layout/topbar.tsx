'use client'

import { Bell, Search, X } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

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
  { value: 'hoje', label: 'Hoje'   },
  { value: '7d',   label: '7 dias' },
  { value: '30d',  label: '30 dias'},
  { value: 'mes',  label: 'Mês'    },
  { value: 'ano',  label: 'Ano'    },
]

const ORIGEM_EMOJI: Record<string, string> = {
  whatsapp: '💬', instagram: '📸', messenger: '💙', manual: '👤',
}

export function Topbar({
  eyebrow,
  title = '',
  showPeriods = false,
  activePeriod = 'mes',
  onPeriodChange,
}: TopbarProps) {
  const router = useRouter()

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotifLead[]>([])
  const notifRef = useRef<HTMLDivElement>(null)

  // Pede permissão para notificações do navegador
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Busca leads com mensagens não lidas (+ atualização em tempo real)
  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: msgs } = await supabase
        .from('lead_mensagens')
        .select('lead_id')
        .eq('lida', false)
        .eq('direcao', 'recebida')
      if (!msgs) return
      const contagem: Record<number, number> = {}
      for (const m of msgs) {
        const id = (m as any).lead_id as number
        if (id != null) contagem[id] = (contagem[id] ?? 0) + 1
      }
      const ids = Object.keys(contagem).map(Number)
      if (ids.length === 0) { setNotifs([]); return }
      const { data: leads } = await supabase
        .from('leads')
        .select('id, nome, produto_interessado, origem')
        .in('id', ids)
        .eq('ativo', true)
      const list: NotifLead[] = (leads ?? []).map((l: any) => ({
        id: l.id, nome: l.nome, produto_interessado: l.produto_interessado,
        origem: l.origem, nao_lidas: contagem[l.id] ?? 0,
      })).sort((a, b) => b.nao_lidas - a.nao_lidas)
      setNotifs(list)
    }
    load()

    // Realtime: recarrega notificações + dispara notificação do navegador
    const channel = supabase
      .channel(`topbar_notifs_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_mensagens' }, async (payload: any) => {
        load()
        // Notificação do navegador apenas para mensagens NOVAS recebidas
        if (payload.eventType === 'INSERT' && payload.new?.direcao === 'recebida') {
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            // Busca o nome do lead para a notificação
            let titulo = 'Nova mensagem'
            try {
              const { data } = await supabase
                .from('leads')
                .select('nome, origem')
                .eq('id', payload.new.lead_id)
                .maybeSingle()
              if (data?.nome) titulo = `Nova mensagem de ${data.nome}`
              else if (data?.origem) titulo = `Nova mensagem · ${data.origem}`
            } catch {}
            try {
              // Sem `icon` propositalmente: um ícone que retorna 404 faz o Chrome
              // engolir a notificação inteira sem mostrar nada. Sem icon, ele usa
              // o ícone padrão da aba e a notificação sempre aparece.
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
      .subscribe((status) => {
        // Diagnóstico: confirma que o canal realmente conectou.
        // Se não aparecer "SUBSCRIBED" no console, o Realtime não está chegando
        // ao navegador (ver Database → Replication no Supabase).
        console.log('[topbar] realtime lead_mensagens status:', status)
      })
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Fecha painel ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const totalNaoLidas = notifs.reduce((s, n) => s + n.nao_lidas, 0)

  return (
    <header suppressHydrationWarning className="flex items-center gap-5 px-[30px] py-4 border-b border-[#16212E]/[0.08] bg-[rgba(255,255,255,0.82)] backdrop-blur-md shrink-0 z-10">

      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[10px] tracking-[0.18em] text-[#F0353D] uppercase">{eyebrow}</div>
        )}
        <h1 className="font-serif font-normal text-[25px] tracking-[-0.02em] text-[#16212E] mt-[3px] whitespace-nowrap">{title}</h1>
      </div>

      <div className="flex-1" />

      {showPeriods && (
        <div className="flex gap-[3px] p-[3px] rounded-[11px] bg-[#16212E]/[0.04] border border-[#16212E]/[0.10]">
          {periods.map((p) => (
            <button key={p.value} onClick={() => onPeriodChange?.(p.value)}
              className={cn('px-[13px] py-[7px] rounded-[8px] text-[12.5px] font-medium transition-all duration-150',
                activePeriod === p.value
                  ? 'bg-[#E03037] text-white font-bold shadow-[0_4px_12px_rgba(215,40,47,0.35)]'
                  : 'text-[#788698] hover:text-[#56657A] hover:bg-[#16212E]/[0.06]')}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex items-center">
        <Search size={17} className="absolute left-3 text-[#46586E] pointer-events-none" />
        <input placeholder="Buscar produto, cliente, IMEI…"
          className="bg-[#16212E]/[0.04] border border-[#16212E]/[0.10] rounded-[11px] py-[10px] pl-[38px] pr-[14px] w-[280px] text-[13px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-[rgba(215,40,47,0.5)] focus:bg-[#16212E]/[0.05] transition-all" />
      </div>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button onClick={() => setNotifOpen(o => !o)}
          className="relative w-[42px] h-[42px] rounded-[11px] bg-[#16212E]/[0.04] border border-[#16212E]/[0.10] flex items-center justify-center text-[#9FB0C2] hover:bg-[#16212E]/[0.06] transition-colors">
          <Bell size={19} />
          {totalNaoLidas > 0 && (
            <span className="absolute top-[9px] right-[10px] w-[7px] h-[7px] rounded-full bg-[#F0353D] border-2 border-white animate-pulse" />
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-[50px] w-[330px] bg-white border border-[#16212E]/[0.10] rounded-[16px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] z-30 overflow-hidden"
            style={{ animation: 'popIn 0.18s ease' }}>
            <div className="flex items-center justify-between px-[17px] py-[15px] border-b border-[#16212E]/[0.08]">
              <span className="font-serif text-[16px] text-[#16212E]">Notificações</span>
              {totalNaoLidas > 0 && (
                <span className="font-mono text-[10px] text-[#C01F26] bg-[rgba(215,40,47,0.12)] px-[8px] py-[2px] rounded-full">
                  {totalNaoLidas} não lidas
                </span>
              )}
            </div>
            <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
              {notifs.length === 0 ? (
                <div className="px-6 py-8 text-center text-[#788698] text-[13px]">Tudo em dia ✓</div>
              ) : notifs.map(n => (
                <button key={n.id}
                  onClick={() => { setNotifOpen(false); router.push('/leads') }}
                  className="w-full flex items-center gap-[11px] px-[17px] py-[13px] border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] transition-colors text-left">
                  <div className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(215,40,47,0.14)] flex items-center justify-center flex-none text-[16px]">
                    {ORIGEM_EMOJI[n.origem ?? 'manual'] ?? '👤'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#1F2A39] truncate">{n.nome ?? `Lead #${n.id}`}</div>
                    <div className="text-[11.5px] text-[#788698] truncate">
                      {n.nao_lidas} nova{n.nao_lidas > 1 ? 's' : ''} mensagem{n.nao_lidas > 1 ? 's' : ''}
                      {n.produto_interessado ? ` · ${n.produto_interessado}` : ''}
                    </div>
                  </div>
                  <span className="min-w-[20px] h-[20px] px-[5px] rounded-full bg-[#D7282F] text-white font-mono text-[10px] font-bold flex items-center justify-center flex-none">
                    {n.nao_lidas > 99 ? '99+' : n.nao_lidas}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => { setNotifOpen(false); router.push('/leads') }}
              className="w-full py-[13px] bg-[rgba(215,40,47,0.1)] text-[#C01F26] text-[13px] font-semibold hover:bg-[rgba(215,40,47,0.16)] transition-colors">
              Ver todos os leads
            </button>
            <button
              onClick={async () => {
                if (typeof window === 'undefined' || !('Notification' in window)) {
                  alert('Este navegador não suporta notificações.')
                  return
                }
                let perm = Notification.permission
                if (perm === 'default') perm = await Notification.requestPermission()
                if (perm !== 'granted') {
                  alert('Permissão de notificação: ' + perm + '. Ative nas configurações do site (cadeado na barra de endereço).')
                  return
                }
                try {
                  const n = new Notification('🔔 Teste — JM Store CRM', {
                    body: 'Se você está vendo isto, as notificações estão funcionando!',
                    tag: 'jmstore-teste',
                    renotify: true,
                  } as NotificationOptions)
                  setTimeout(() => { try { n.close() } catch {} }, 6000)
                } catch (e) {
                  alert('Falha ao disparar: ' + (e as Error).message)
                }
              }}
              className="w-full py-[10px] text-[#6B7C92] text-[11.5px] font-medium hover:text-[#9FB0C2] hover:bg-[#16212E]/[0.03] transition-colors border-t border-[#16212E]/[0.07]">
              Testar notificação do navegador
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
