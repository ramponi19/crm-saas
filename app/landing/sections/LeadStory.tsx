'use client'

/**
 * LeadStory — a cena central: um lead chega no WhatsApp e vira venda.
 *
 * Layout de altura natural (sem pin): copy à esquerda com os 4 passos, e à
 * direita a conversa + o funil com a venda registrada em "Convertido". Cada
 * quadro/passo aparece com um reveal suave ao entrar na tela. Igual em desktop
 * e mobile; reduced-motion mantém tudo estático e visível.
 */

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const STEPS = [
  { title: 'O lead entra sozinho', desc: 'Instagram, WhatsApp ou portal — todo contato vira um card com origem e dono.' },
  { title: 'A equipe responde em minutos', desc: 'SLA cronometrado por conversa. O gestor vê quem demora e quem converte.' },
  { title: 'A cobrança acontece na conversa', desc: 'Pix ou cartão gerado sem sair do chat, conciliado sozinho.' },
  { title: 'O funil registra a venda', desc: 'O card atravessa as etapas até Convertido — com histórico completo.' },
]

export default function LeadStory() {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)

    // Reveal simples e robusto (sem pin): cada quadro/passo aparece ao entrar.
    // fromTo + immediateRender:false → nunca fica preso invisível se o trigger falhar.
    const q = gsap.utils.selector(root)
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(q('[data-beat], [data-step]')).forEach((el, i) => {
        gsap.fromTo(el, { y: 22, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', immediateRender: false,
          scrollTrigger: { trigger: el, start: 'top 90%' },
          delay: (i % 4) * 0.04,
        })
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={rootRef} className="relative overflow-hidden bg-[color:var(--lp-deep)] text-[color:var(--lp-white)]">
      <div aria-hidden className="lp-aurora left-[-140px] top-[30%] h-[420px] w-[420px] opacity-[0.28]"
        style={{ background: 'radial-gradient(closest-side, rgba(46,92,230,.45), transparent 72%)' }} />

      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-14 px-5 py-24 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-20 lg:py-28">
        {/* ---- coluna de copy: passos que acendem ---- */}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--lp-cobalt-bright)]">
            Do primeiro oi ao Pix pago
          </div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            O lead chega.<br />O sistema já sabe o que fazer.
          </h2>

          <div className="mt-10 space-y-7">
            {STEPS.map((st, i) => (
              <div key={st.title} data-step={i} className="relative pl-6">
                <span className="absolute left-0 top-1 h-[calc(100%-2px)] w-[2.5px] rounded-full bg-white/10">
                  <span data-step-bar={i} className="absolute inset-0 rounded-full bg-[color:var(--lp-cobalt-bright)]" />
                </span>
                <div className="text-[16.5px] font-bold tracking-[-0.02em]">{st.title}</div>
                <p className="mt-1 max-w-[380px] text-[14px] leading-relaxed text-[color:var(--lp-dim)]">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ---- palco: conversa + funil mini ---- */}
        <div className="w-full">
          {/* conversa */}
          <div className="rounded-[16px] border border-[color:var(--lp-border)] bg-[color:var(--lp-panel)] p-5 shadow-[0_32px_80px_-32px_rgba(0,0,0,.7)] sm:p-6">
            <div className="mb-4 flex items-center gap-2.5 border-b border-[color:var(--lp-border-soft)] pb-3.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-[12px] font-bold">L</span>
              <div>
                <div className="text-[13.5px] font-bold">Larissa M.</div>
                <div className="text-[11px] text-[color:var(--lp-faint)]">via Instagram · lead #4.812</div>
              </div>
              <span className="ml-auto rounded-full bg-ok/15 px-2.5 py-1 text-[10.5px] font-bold text-[#3ECf8E]">novo</span>
            </div>

            <div data-beat="msg-in" className="max-w-[86%] rounded-[12px_12px_12px_4px] bg-white/[0.07] px-4 py-2.5 text-[13.5px]">
              Oi! Vocês têm o iPhone 15 de 128?
              <span className="mt-1 block text-[10.5px] text-[color:var(--lp-faint)]">09:14</span>
            </div>

            <div data-beat="reply" className="ml-auto mt-2.5 max-w-[86%] rounded-[12px_12px_4px_12px] bg-[color:var(--lp-cobalt)] px-4 py-2.5 text-[13.5px] text-white">
              Tenho sim, Larissa! Azul e preto em estoque. Te mando o Pix com frete grátis pra hoje?
              <span className="mt-1 block text-right text-[10.5px] text-white/60">09:16 · Rafael</span>
            </div>

            <div data-beat="sla" className="mt-3 flex justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-3 py-1.5 text-[11px] font-bold text-[#3ECF8E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3ECF8E]" />respondido em 1min 52s — dentro do SLA
              </span>
            </div>

            <div data-beat="pix" className="mt-3 rounded-[10px] border border-dashed border-[color:var(--lp-cobalt-bright)]/50 bg-[color:var(--lp-cobalt)]/10 px-4 py-3 text-center text-[12.5px] font-semibold text-[color:var(--lp-cobalt-bright)]">
              Cobrança Pix de R$ 4.299 gerada na conversa
            </div>
          </div>

          {/* funil mini — o card atravessa */}
          <div className="mt-4 rounded-[16px] border border-[color:var(--lp-border)] bg-[color:var(--lp-panel)] p-5">
            <div className="mb-3 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--lp-faint)]">
              Funil de vendas
              <span data-beat="done" className="rounded-full bg-ok/15 px-2.5 py-1 text-[10px] font-bold normal-case tracking-normal text-[#3ECF8E]">
                Venda registrada · R$ 4.299
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['Novo', 'Negociação', 'Convertido'].map((col, i) => (
                <div key={col}>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--lp-dim)]">
                    <span className="h-[5px] w-[5px] rounded-[2px]" style={{ background: ['#9199A3', '#2E5CE6', '#188A54'][i] }} />
                    {col}
                  </div>
                  <div className="relative h-[54px] rounded-[9px] border border-dashed border-white/10">
                    {i === 2 && (
                      <div className="absolute inset-0 z-10 rounded-[9px] border border-white/15 bg-white/[0.1] px-3 py-2 backdrop-blur-sm">
                        <div className="text-[11.5px] font-bold">Larissa M.</div>
                        <div className="text-[10px] text-[color:var(--lp-dim)]">iPhone 15 · R$ 4.299</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
