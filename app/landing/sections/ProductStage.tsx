'use client'

/**
 * ProductStage — o palco do produto no hero.
 *
 * A captura de tela do CRM (mock claro, fiel ao produto) entra inclinada em
 * perspectiva 3D e "endireita" conforme o scroll (scrub). Em ponteiro fino,
 * um tilt sutil segue o mouse. Acima, o seletor de segmento roda em autoplay
 * com barra de progresso — clicar num segmento assume o controle e para o
 * autoplay. A troca de segmento anima os dados internos em stagger.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SEGS, SEG_KEYS, type Tone } from '../data'

const AUTOPLAY_MS = 5600
const toneClass: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', ink3: 'text-ink-3' }

export default function ProductStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const mockRef = useRef<HTMLDivElement>(null)
  const [seg, setSeg] = useState('varejo')
  const [locked, setLocked] = useState(false) // usuário clicou → autoplay desliga
  const [reduced, setReduced] = useState(false)
  const s = SEGS[seg]

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  // autoplay do seletor — um timeout por segmento exibido
  useEffect(() => {
    if (locked || reduced) return
    const t = setTimeout(() => {
      setSeg((cur) => SEG_KEYS[(SEG_KEYS.indexOf(cur) + 1) % SEG_KEYS.length])
    }, AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [seg, locked, reduced])

  // perspectiva 3D no scroll + tilt por mouse
  useEffect(() => {
    const stage = stageRef.current
    const tilt = tiltRef.current
    const mock = mockRef.current
    if (!stage || !tilt || !mock) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      gsap.fromTo(
        mock,
        { rotateX: 16, y: 72, scale: 0.94, transformPerspective: 1400 },
        {
          rotateX: 0, y: 0, scale: 1, ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top 96%', end: 'top 34%', scrub: 0.5 },
        },
      )
    }, stage)

    // tilt sutil só em ponteiro fino (desktop)
    let cleanupTilt: (() => void) | undefined
    if (window.matchMedia('(pointer: fine)').matches) {
      const rx = gsap.quickTo(tilt, 'rotateX', { duration: 0.7, ease: 'power3.out' })
      const ry = gsap.quickTo(tilt, 'rotateY', { duration: 0.7, ease: 'power3.out' })
      const onMove = (e: MouseEvent) => {
        const r = stage.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width - 0.5
        const py = (e.clientY - r.top) / r.height - 0.5
        ry(px * 3.2)
        rx(py * -2.4)
      }
      const onLeave = () => { rx(0); ry(0) }
      stage.addEventListener('mousemove', onMove)
      stage.addEventListener('mouseleave', onLeave)
      gsap.set(tilt, { transformPerspective: 1400 })
      cleanupTilt = () => {
        stage.removeEventListener('mousemove', onMove)
        stage.removeEventListener('mouseleave', onLeave)
      }
    }

    return () => { cleanupTilt?.(); ctx.revert() }
  }, [])

  // troca de segmento — dados internos entram em stagger
  const firstRender = useRef(true)
  useLayoutEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const mock = mockRef.current
    if (!mock) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(
      mock.querySelectorAll('[data-mock-anim]'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', overwrite: 'auto' },
    )
  }, [seg])

  return (
    <div ref={stageRef} id="segmentos" className="relative mx-auto max-w-[1120px] scroll-mt-28 px-5 sm:px-6">
      {/* glow cobalto atrás do mock */}
      <div
        aria-hidden
        className="absolute left-1/2 top-8 -z-10 h-[70%] w-[88%] -translate-x-1/2 rounded-[48px] opacity-60"
        style={{ background: 'radial-gradient(52% 52% at 50% 42%, rgba(46,92,230,.34), transparent 70%)', filter: 'blur(64px)' }}
      />

      {/* seletor de segmento */}
      <div className="mb-5 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--lp-faint)]">
          <span className="lp-live-dot h-[7px] w-[7px] rounded-full bg-ok" />
          Um CRM que fala a língua de cada segmento
        </div>
        <div className="inline-flex max-w-full flex-wrap justify-center gap-1 rounded-[12px] border border-[color:var(--lp-border)] bg-white/[0.04] p-1 backdrop-blur-sm">
          {SEG_KEYS.map((k) => {
            const on = k === seg
            return (
              <button
                key={k}
                type="button"
                onClick={() => { setSeg(k); setLocked(true) }}
                aria-pressed={on}
                className={
                  'relative overflow-hidden rounded-[9px] px-3.5 py-[8px] text-[12.5px] font-semibold transition-colors ' +
                  (on ? 'bg-white/[0.97] text-ink' : 'text-[color:var(--lp-dim)] hover:bg-white/[0.06] hover:text-white')
                }
              >
                {SEGS[k].label}
                {on && !locked && !reduced && (
                  <span
                    key={seg}
                    className="lp-progress absolute inset-x-0 bottom-0 h-[2.5px] bg-accent"
                    style={{ ['--lp-progress-dur' as string]: `${AUTOPLAY_MS}ms` }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* palco 3D */}
      <div ref={tiltRef} style={{ transformStyle: 'preserve-3d' }}>
        <div
          ref={mockRef}
          className="overflow-hidden rounded-[14px] border border-[color:var(--lp-border)] bg-card shadow-[0_0_0_1px_rgba(255,255,255,.04),0_24px_48px_-12px_rgba(0,0,0,.55),0_80px_160px_-40px_rgba(46,92,230,.25)]"
        >
          {/* barra do navegador — chrome escuro */}
          <div className="flex h-11 items-center gap-[7px] border-b border-[color:var(--lp-border-soft)] bg-[#12161d] px-4">
            <span className="h-[10px] w-[10px] rounded-full bg-white/[0.12]" />
            <span className="h-[10px] w-[10px] rounded-full bg-white/[0.12]" />
            <span className="h-[10px] w-[10px] rounded-full bg-white/[0.12]" />
            <span className="mx-auto flex items-center gap-1.5 rounded-[7px] bg-white/[0.06] px-3 py-1 text-[11.5px] font-medium text-white/50">
              <svg width="10" height="11" viewBox="0 0 10 11" fill="none" aria-hidden><path d="M2.5 4.5V3.5a2.5 2.5 0 015 0v1M2 4.5h6a1 1 0 011 1v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1" /></svg>
              <span data-mock-anim>{s.url}</span>
            </span>
            <span className="w-[54px]" />
          </div>

          {/* o produto (claro — fiel ao CRM real) */}
          <div className="grid min-h-[420px] grid-cols-1 text-ink md:grid-cols-[200px_1fr]">
            {/* sidebar */}
            <div className="hidden border-r border-line-soft bg-raised px-2 py-3.5 md:block">
              <div data-mock-anim className="flex items-center gap-2 px-2.5 pb-3.5 pt-1 text-[12.5px] font-bold tracking-[-0.01em]">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-ink text-[10px] font-bold text-white">{s.inicial}</span>
                {s.empresa}
              </div>
              <MiniGroup>Hoje</MiniGroup>
              <MiniItem active>Dashboard</MiniItem>
              <MiniItem count="9">Tarefas</MiniItem>
              <MiniGroup>Comercial</MiniGroup>
              <MiniItem count="14">Leads</MiniItem>
              <MiniItem><span data-mock-anim>{s.nav[2]}</span></MiniItem>
              <MiniGroup>Operação</MiniGroup>
              <MiniItem><span data-mock-anim>{s.nav[0]}</span></MiniItem>
              <MiniItem><span data-mock-anim>{s.nav[1]}</span></MiniItem>
            </div>

            {/* conteúdo */}
            <div className="bg-bg px-6 py-5">
              <div className="mb-3.5 flex items-baseline justify-between">
                <span className="text-[17px] font-bold tracking-[-0.025em]">Bom dia, Matheus</span>
                <span className="text-[11px] font-medium tabular-nums text-ink-3">qui · 09 jul</span>
              </div>

              {/* KPIs */}
              <div className="mb-3.5 grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-card sm:grid-cols-3">
                <Kpi label={s.k1.label} value={s.k1.value} sub={s.k1.sub} tone={s.k1.tone} />
                <Kpi label="Leads novos" value={s.k2.value} sub={s.k2.sub} tone="ink3" />
                <Kpi label={s.k3.label} value={s.k3.value} sub={s.k3.sub} tone={s.k3.tone} lastRow />
              </div>

              {/* funil */}
              <div className="rounded-[10px] border border-line bg-card p-3.5">
                <div data-mock-anim className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">{s.funil}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {s.cols.map((col, i) => (
                    <div key={col.name} data-mock-anim className={i >= 3 ? 'hidden sm:block' : ''}>
                      <div className="mb-[7px] flex items-center gap-[5px] text-[10px] font-semibold text-ink-2">
                        <span className="h-[5px] w-[5px] rounded-[2px]" style={{ background: col.dot }} />
                        {col.name}
                        <span className="ml-auto font-semibold tabular-nums text-ink-3">{col.leads.length}</span>
                      </div>
                      {col.leads.map(([a, b]) => (
                        <div key={a} className="mb-1.5 rounded-[7px] border border-line-soft bg-card px-2 py-1.5 text-[9.5px] font-semibold">
                          {a}
                          <small className="mt-px block text-[8.5px] font-medium text-ink-3">{b}</small>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* --- pequenos blocos do mock --- */
function MiniGroup({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-[5px] pt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</div>
}
function MiniItem({ children, active, count }: { children: ReactNode; active?: boolean; count?: string }) {
  return (
    <div
      className={
        'mb-px flex items-center gap-[9px] rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium ' +
        (active ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2')
      }
    >
      <span className="h-[13px] w-[13px] flex-shrink-0 rounded-[4px] border-[1.4px] border-current opacity-55" />
      {children}
      {count && <span className="ml-auto text-[10px] font-semibold tabular-nums text-ink-3">{count}</span>}
    </div>
  )
}
function Kpi({ label, value, sub, tone, lastRow }: { label: string; value: string; sub: string; tone: Tone; lastRow?: boolean }) {
  return (
    <div className={'border-line-soft px-[15px] py-[13px] [&:not(:last-child)]:border-r ' + (lastRow ? 'col-span-2 sm:col-span-1' : '')}>
      <div className="text-[10.5px] font-medium text-ink-3">{label}</div>
      <div data-mock-anim className="mt-[3px] text-[21px] font-bold tracking-[-0.03em] tabular-nums">{value}</div>
      <div data-mock-anim className={'mt-px text-[10.5px] font-semibold tabular-nums ' + toneClass[tone]}>{sub}</div>
    </div>
  )
}
