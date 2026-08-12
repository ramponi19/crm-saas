'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coffee } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { notify } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Almoço / ausência, aberto ao clicar no próprio nome na sidebar.
 *
 * Ligar libera os leads em que o CLIENTE ESTÁ ESPERANDO RESPOSTA, para os colegas
 * atenderem enquanto ele está fora — um cliente esperando alguém que saiu é
 * cliente esperando sem saber. Desligar só volta a receber distribuição: nada é
 * puxado de volta, senão dois vendedores achariam que o lead é seu.
 */
export function AusenciaPopover({ userName, userRole, nomeClasse, papelClasse }: {
  userName: string; userRole: string; nomeClasse: string; papelClasse: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [ausente, setAusente] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    (async () => {
      const empId = await empresaAtualId(supabase)
      const { data: { user } } = await supabase.auth.getUser()
      if (!empId || !user) return
      const { data } = await supabase.from('empresa_usuarios')
        .select('ausente').eq('empresa_id', empId).eq('usuario_id', user.id).maybeSingle()
      setAusente(!!data?.ausente)
    })()
  }, [supabase])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function alternar() {
    const novo = !ausente
    setSalvando(true)
    try {
      const r = await fetch('/api/ausencia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ausente: novo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad('Não consegui mudar seu status', j.error); return }
      setAusente(novo)
      if (novo) {
        notify.ok('Você está ausente',
          j.liberados ? `${j.liberados} lead(s) liberado(s) para a equipe atender.` : 'Você não recebe novos leads enquanto estiver assim.')
      } else {
        notify.ok('Bem-vindo de volta', 'Você voltou a receber leads.')
      }
      router.refresh()
    } finally { setSalvando(false) }
  }

  return (
    <div className="relative min-w-0 flex-1" ref={caixa}>
      <button type="button" onClick={() => setAberto((a) => !a)}
        className="block w-full min-w-0 text-left leading-tight">
        <div className={cn('truncate text-[12px] font-semibold', nomeClasse)}>{userName}</div>
        <div className={cn('flex items-center gap-1 text-[10px]', papelClasse)}>
          {ausente && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />}
          <span className="truncate">{ausente ? 'Ausente — pendências liberadas' : userRole}</span>
        </div>
      </button>

      {aberto && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[248px] rounded-card border border-line bg-card p-3 shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)]">
          <div className="mb-2 flex items-center gap-2">
            <Coffee size={15} strokeWidth={1.8} className="text-ink-2" />
            <span className="text-[13px] font-semibold text-ink">Almoço / ausência</span>
          </div>
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-2">
            {ausente
              ? 'As conversas com cliente esperando foram para a esteira. Ao voltar, você recebe novos leads — as liberadas seguem com quem pegou.'
              : 'Ao ativar, só as conversas com cliente esperando resposta vão para a esteira. As que você já respondeu continuam suas.'}
          </p>
          <button type="button" onClick={alternar} disabled={salvando}
            className="flex w-full items-center justify-between rounded-control border border-line p-2.5 transition-colors hover:bg-bg disabled:opacity-60">
            <span className="text-[12.5px] font-medium text-ink">{ausente ? 'Estou de volta' : 'Entrar em ausência'}</span>
            <span className={cn('grid h-[22px] w-[38px] flex-none items-center rounded-full px-[3px] transition-colors', ausente ? 'bg-warn' : 'bg-ink/15')}>
              <span className={cn('block h-4 w-4 rounded-full bg-white transition-transform', ausente && 'translate-x-4')} />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
