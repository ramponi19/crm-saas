'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, ArrowUpRight, X, Rocket } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Passo { key: string; label: string; href: string; feito: boolean }

const DISMISS_KEY = 'nexus_onboarding_dismissed'

/** Checklist de primeiros passos — some sozinho quando tudo pronto ou ao dispensar.
 *  Estado derivado de dados reais (sem tabela nova). */
export function OnboardingCard() {
  const [passos, setPassos] = useState<Passo[] | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1') { setDismissed(true); return }
    setDismissed(false)
    const supabase = createClient()
    ;(async () => {
      const [prod, wpp, leads, vendas] = await Promise.all([
        supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('configuracoes_sistema').select('*', { count: 'exact', head: true }).in('chave', ['whatsapp_official']),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('vendas').select('*', { count: 'exact', head: true }),
      ])
      setPassos([
        { key: 'prod', label: 'Cadastre seus produtos', href: '/produtos', feito: (prod.count ?? 0) >= 3 },
        { key: 'wpp', label: 'Conecte o WhatsApp', href: '/admin/configuracoes', feito: (wpp.count ?? 0) >= 1 },
        { key: 'lead', label: 'Registre seu primeiro lead', href: '/leads', feito: (leads.count ?? 0) >= 1 },
        { key: 'venda', label: 'Faça uma venda no PDV', href: '/pdv', feito: (vendas.count ?? 0) >= 1 },
      ])
    })()
  }, [])

  if (dismissed || !passos) return null
  const feitos = passos.filter((p) => p.feito).length
  if (feitos === passos.length) return null // tudo pronto → some

  function dispensar() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="rounded-card border border-line bg-card p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-accent-soft text-accent"><Rocket size={18} strokeWidth={1.7} /></span>
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Primeiros passos</h3>
          <p className="text-[12.5px] text-ink-2">{feitos} de {passos.length} concluídos — configure o Nexus em minutos.</p>
        </div>
        <button aria-label="Dispensar" onClick={dispensar} className="grid h-7 w-7 place-items-center rounded-control text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink">
          <X size={15} strokeWidth={1.7} />
        </button>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(feitos / passos.length) * 100}%` }} />
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {passos.map((p) => (
          <Link
            key={p.key}
            href={p.href}
            className={cn('flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-[13px] transition-colors',
              p.feito ? 'border-line-soft text-ink-3' : 'border-line text-ink hover:bg-raised')}
          >
            <span className={cn('grid h-5 w-5 flex-none place-items-center rounded-full border', p.feito ? 'border-ok bg-ok text-white' : 'border-line')}>
              {p.feito && <Check size={12} strokeWidth={2.4} />}
            </span>
            <span className={cn('flex-1', p.feito && 'line-through')}>{p.label}</span>
            {!p.feito && <ArrowUpRight size={14} strokeWidth={1.7} className="text-ink-3" />}
          </Link>
        ))}
      </div>
    </div>
  )
}
