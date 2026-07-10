'use client'

/**
 * Modules — bento grid dark dos módulos do Nexus.
 *
 * Cada card tem um spotlight que segue o cursor (CSS vars --mx/--my) e um
 * micro-visual próprio — mini-chat, mini-kanban, recibo Pix, agenda, barras
 * de relatório que crescem no hover. Entrada em stagger via ScrollTrigger.
 */

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MODULES } from '../data'

export default function Modules() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      gsap.from('[data-bento]', {
        y: 44, opacity: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 74%' },
      })
    }, root)
    return () => ctx.revert()
  }, [])

  const spot = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  const visuals: Record<string, ReactNode> = {
    atendimento: <VisualAtendimento />,
    funil: <VisualFunil />,
    pix: <VisualPix />,
    agenda: <VisualAgenda />,
    estoque: <VisualEstoque />,
    relatorios: <VisualRelatorios />,
    financeiro: <VisualFinanceiro />,
  }

  return (
    <section ref={rootRef} id="modulos" className="scroll-mt-24 bg-[color:var(--lp-deep)] py-28 text-[color:var(--lp-white)]">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-6">
        <div className="mb-14 max-w-[640px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--lp-cobalt-bright)]">
            Um núcleo, toda a operação
          </div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            Os módulos que o seu segmento precisa. E só eles.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--lp-dim)]">
            Do primeiro contato ao pós-venda, sem planilha solta nem sistema paralelo. O menu do seu Nexus nasce no vocabulário da sua operação.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          {MODULES.map((m) => (
            <div
              key={m.key}
              data-bento
              onMouseMove={spot}
              className={`lp-spot flex flex-col rounded-[16px] border border-[color:var(--lp-border)] bg-[color:var(--lp-panel)] p-6 transition-colors duration-300 hover:border-white/[0.16] ${m.span}`}
            >
              <h3 className="text-[16.5px] font-bold tracking-[-0.02em]">{m.title}</h3>
              <p className="mt-1.5 max-w-[420px] text-[13.5px] leading-relaxed text-[color:var(--lp-dim)]">{m.desc}</p>
              <div className="mt-auto pt-6">{visuals[m.key]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ================= micro-visuais ================= */

function VisualAtendimento() {
  return (
    <div className="rounded-[12px] border border-[color:var(--lp-border-soft)] bg-black/20 p-4">
      <div className="mb-3 flex gap-1.5">
        {['WhatsApp', 'Instagram', 'Messenger'].map((c, i) => (
          <span key={c} className={'rounded-full px-2.5 py-1 text-[10px] font-bold ' + (i === 0 ? 'bg-ok/20 text-[#3ECF8E]' : 'bg-white/[0.06] text-[color:var(--lp-dim)]')}>
            {c}
          </span>
        ))}
      </div>
      <div className="max-w-[75%] rounded-[10px_10px_10px_3px] bg-white/[0.07] px-3 py-2 text-[12px]">Qual o prazo de entrega?</div>
      <div className="ml-auto mt-2 max-w-[75%] rounded-[10px_10px_3px_10px] bg-[color:var(--lp-cobalt)] px-3 py-2 text-[12px] text-white">Chega amanhã até 12h 🚚</div>
      <div className="mt-3 flex items-center justify-between border-t border-[color:var(--lp-border-soft)] pt-2.5 text-[10.5px] text-[color:var(--lp-faint)]">
        <span>distribuído para <b className="text-[color:var(--lp-dim)]">Rafael</b></span>
        <span className="font-bold text-[#3ECF8E]">SLA 2min ✓</span>
      </div>
    </div>
  )
}

function VisualFunil() {
  const cols: [string, string, number][] = [['Novo', '#9199A3', 2], ['Proposta', '#2E5CE6', 1], ['Fechado', '#188A54', 1]]
  return (
    <div className="grid grid-cols-3 gap-2">
      {cols.map(([name, dot, n]) => (
        <div key={name} className="rounded-[10px] border border-[color:var(--lp-border-soft)] bg-black/20 p-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-[color:var(--lp-dim)]">
            <span className="h-[5px] w-[5px] rounded-[2px]" style={{ background: dot }} />
            {name}
          </div>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="mb-1.5 h-[26px] rounded-[6px] bg-white/[0.07]" />
          ))}
        </div>
      ))}
    </div>
  )
}

function VisualPix() {
  return (
    <div className="rounded-[12px] border border-dashed border-[color:var(--lp-cobalt-bright)]/45 bg-[color:var(--lp-cobalt)]/[0.08] p-4 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--lp-faint)]">Pix copia-e-cola</div>
      <div className="mt-1 text-[22px] font-extrabold tabular-nums tracking-[-0.03em]">R$ 4.299</div>
      <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#3ECF8E]">● pago em 3 min</div>
    </div>
  )
}

function VisualAgenda() {
  const dias = ['S', 'T', 'Q', 'Q', 'S', 'S']
  return (
    <div className="rounded-[12px] border border-[color:var(--lp-border-soft)] bg-black/20 p-4">
      <div className="grid grid-cols-6 gap-1.5">
        {dias.map((d, i) => (
          <div key={i} className={'grid h-9 place-items-center rounded-[7px] text-[11px] font-bold ' + (i === 3 ? 'bg-[color:var(--lp-cobalt)] text-white' : 'bg-white/[0.05] text-[color:var(--lp-faint)]')}>
            {d}
          </div>
        ))}
      </div>
      <div className="mt-2.5 text-[10.5px] text-[color:var(--lp-faint)]">
        <b className="text-[color:var(--lp-dim)]">qui 10h</b> · visita Ed. Solar · lembrete D-1 enviado ✓
      </div>
    </div>
  )
}

function VisualEstoque() {
  return (
    <div className="space-y-2 rounded-[12px] border border-[color:var(--lp-border-soft)] bg-black/20 p-4">
      {[['iPhone 15 128GB', 78, false], ['Fone JBL Tune', 42, false], ['Capa MagSafe', 12, true]].map(([nome, pct, low]) => (
        <div key={nome as string}>
          <div className="mb-1 flex justify-between text-[10.5px]">
            <span className="text-[color:var(--lp-dim)]">{nome as string}</span>
            <span className={'font-bold ' + (low ? 'text-warn' : 'text-[color:var(--lp-faint)]')}>{low ? 'repor' : 'ok'}</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.06]">
            <div className={'h-full rounded-full ' + (low ? 'bg-warn' : 'bg-[color:var(--lp-cobalt)]')} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function VisualRelatorios() {
  const bars = [34, 52, 41, 66, 58, 82, 74]
  return (
    <div className="group rounded-[12px] border border-[color:var(--lp-border-soft)] bg-black/20 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--lp-faint)]">Receita · últimas 7 semanas</span>
        <span className="text-[12px] font-extrabold text-[#3ECF8E]">▲ 23%</span>
      </div>
      <div className="flex h-[72px] items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className={'flex-1 origin-bottom scale-y-90 rounded-[4px] transition-transform duration-500 group-hover:scale-y-100 ' + (i === bars.length - 1 ? 'bg-[color:var(--lp-cobalt-bright)]' : 'bg-[color:var(--lp-cobalt)]/45')}
            style={{ height: `${h}%`, transitionDelay: `${i * 45}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function VisualFinanceiro() {
  return (
    <div className="rounded-[12px] border border-[color:var(--lp-border-soft)] bg-black/20 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--lp-faint)]">Saldo do mês</span>
        <span className="text-[18px] font-extrabold tabular-nums tracking-[-0.03em]">R$ 38.180</span>
      </div>
      <div className="mt-3 space-y-1.5 text-[11px]">
        <div className="flex justify-between"><span className="text-[color:var(--lp-dim)]">Recebimentos</span><b className="tabular-nums text-[#3ECF8E]">+ R$ 61.420</b></div>
        <div className="flex justify-between"><span className="text-[color:var(--lp-dim)]">Fornecedores</span><b className="tabular-nums text-[color:var(--lp-dim)]">− R$ 23.240</b></div>
        <div className="flex justify-between border-t border-[color:var(--lp-border-soft)] pt-1.5"><span className="text-[color:var(--lp-dim)]">A vencer em 7 dias</span><b className="tabular-nums text-warn">R$ 4.900</b></div>
      </div>
    </div>
  )
}
