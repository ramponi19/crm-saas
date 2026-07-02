'use client'

/**
 * Sections — tudo abaixo do hero.
 *
 * Ritmo cinematográfico claro→escuro: Funcionalidades (escuro) → Métricas
 * (escuro) → Para quem é (claro) → Planos (claro) → CTA final (escuro) → footer.
 * Animações dirigidas por scroll (ScrollTrigger): blocos sobem ao entrar,
 * cards em stagger, e as métricas contam sozinhas. Respeita reduced-motion.
 */

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  Store, Workflow, MessagesSquare, Package, BarChart3, Users,
  Check, ArrowUpRight, ShoppingBag, Wrench, Boxes, Briefcase,
} from 'lucide-react'
import styles from './Landing.module.css'

const FEATURES = [
  { icon: Store, title: 'PDV Integrado', desc: 'Venda no balcão ou online com estoque e caixa sincronizados em tempo real.' },
  { icon: Workflow, title: 'Pipeline de Vendas', desc: 'Arraste negócios entre etapas e saiba exatamente onde cada venda está.' },
  { icon: MessagesSquare, title: 'Atendimento Multicanal', desc: 'WhatsApp, chat e e-mail num só painel. Nenhum cliente esquecido.' },
  { icon: Package, title: 'Controle de Estoque', desc: 'Entradas, saídas e alertas de ruptura automáticos — sem contar no dedo.' },
  { icon: BarChart3, title: 'Relatórios em Tempo Real', desc: 'Receita, conversão e ticket médio atualizados a cada venda.' },
  { icon: Users, title: 'Gestão de Clientes', desc: 'Histórico completo de cada cliente para vender mais e melhor.' },
]

const SEGMENTS = [
  { icon: ShoppingBag, label: 'Varejo & Lojas' },
  { icon: Wrench, label: 'Assistência técnica' },
  { icon: Briefcase, label: 'Prestadores de serviço' },
  { icon: Boxes, label: 'Atacado & Distribuição' },
]

/** Formato serializável de um plano vindo do servidor (planos_config). */
export type PlanData = {
  id: string
  name: string
  priceCents: number
  tagline: string
  features: string[]
  featured: boolean
}

/** Fallback caso o banco não responda — mantém a vitrine sempre preenchida. */
const FALLBACK_PLANS: PlanData[] = [
  { id: 'essencial', name: 'Essencial', priceCents: 4900, featured: false, tagline: 'Para quem está começando a organizar.', features: ['PDV integrado', 'Cadastro de clientes', 'Controle de estoque básico', '1 usuário'] },
  { id: 'profissional', name: 'Profissional', priceCents: 9900, featured: true, tagline: 'O favorito de quem quer crescer.', features: ['Pipeline de vendas', 'Atendimento multicanal', 'Relatórios em tempo real', 'Até 5 usuários'] },
  { id: 'escala', name: 'Escala', priceCents: 19900, featured: false, tagline: 'Para operações que não param.', features: ['Equipe ilimitada', 'Acesso via API', 'Suporte prioritário'] },
]

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function Sections({ plans }: { plans?: PlanData[] }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const planList = plans && plans.length ? plans : FALLBACK_PLANS

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.registerPlugin(ScrollTrigger)

    const setCounterFinal = (el: HTMLElement) => {
      const end = parseFloat(el.dataset.count || '0')
      const dec = parseInt(el.dataset.dec || '0', 10)
      el.textContent = `${el.dataset.prefix || ''}${end.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${el.dataset.suffix || ''}`
    }

    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set('[data-rise]', { opacity: 1, y: 0 })
        root.querySelectorAll<HTMLElement>('[data-count]').forEach(setCounterFinal)
        return
      }

      // blocos que sobem ao entrar na viewport
      gsap.utils.toArray<HTMLElement>('[data-rise]').forEach((el) => {
        gsap.from(el, {
          y: 40, opacity: 0, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 84%' },
        })
      })

      // grupos com stagger (grids de cards)
      gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((grp) => {
        gsap.from(Array.from(grp.children), {
          y: 44, opacity: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out',
          scrollTrigger: { trigger: grp, start: 'top 80%' },
        })
      })

      // contadores das métricas
      root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        const end = parseFloat(el.dataset.count || '0')
        const dec = parseInt(el.dataset.dec || '0', 10)
        const obj = { v: 0 }
        ScrollTrigger.create({
          trigger: el, start: 'top 88%', once: true,
          onEnter: () => {
            gsap.to(obj, {
              v: end, duration: 1.9, ease: 'power2.out',
              onUpdate: () => {
                el.textContent = `${el.dataset.prefix || ''}${obj.v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${el.dataset.suffix || ''}`
              },
            })
          },
        })
      })
    }, root)

    // recalcula posições depois que fontes/layout assentam
    const refresh = () => ScrollTrigger.refresh()
    if (document.fonts?.ready) document.fonts.ready.then(refresh)
    window.addEventListener('load', refresh)

    return () => {
      window.removeEventListener('load', refresh)
      ctx.revert()
    }
  }, [])

  return (
    <div ref={rootRef} className={styles.sections}>

      {/* ---------- FUNCIONALIDADES (escuro) ---------- */}
      <section id="funcionalidades" className={styles.sectionDark}>
        <div className={styles.sectionGlowTop} />
        <div className={styles.container}>
          <div className={styles.secHead}>
            <div className={styles.eyebrow2} data-rise><span className={styles.eyebrowDot} />O NÚCLEO DA OPERAÇÃO</div>
            <h2 className={styles.h2} data-rise>Tudo o que seu negócio precisa. <em>Num só lugar.</em></h2>
            <p className={styles.secSub} data-rise>Do primeiro contato ao pós-venda — sem planilha solta, sem sistema paralelo.</p>
          </div>

          <div className={styles.featureGrid} data-stagger>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <span className={styles.fIcon}><f.icon size={20} /></span>
                <h3 className={styles.fTitle}>{f.title}</h3>
                <p className={styles.fDesc}>{f.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ---------- PARA QUEM É (claro) ---------- */}
      <section id="para-quem" className={styles.sectionLight}>
        <div className={styles.container}>
          <div className={styles.secHead}>
            <div className={styles.eyebrow2} data-rise><span className={styles.eyebrowDot} />PARA QUEM É</div>
            <h2 className={styles.h2} data-rise>Feito para quem <em>põe a mão na massa.</em></h2>
          </div>
          <div className={styles.segRow} data-stagger>
            {SEGMENTS.map((s) => (
              <div key={s.label} className={styles.segItem}>
                <span className={styles.segIcon}><s.icon size={22} /></span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- PLANOS (claro) ---------- */}
      <section id="planos" className={styles.sectionLight}>
        <div className={styles.container}>
          <div className={styles.secHead}>
            <div className={styles.eyebrow2} data-rise><span className={styles.eyebrowDot} />PLANOS</div>
            <h2 className={styles.h2} data-rise>Preço honesto. <em>Sem pegadinha.</em></h2>
            <p className={styles.secSub} data-rise>Comece grátis por 14 dias. Cancele quando quiser.</p>
          </div>

          <div className={styles.planGrid} data-stagger>
            {planList.map((p) => (
              <div key={p.id} className={`${styles.planCard} ${p.featured ? styles.planFeatured : ''}`}>
                {p.featured && <span className={styles.planBadge}>Mais popular</span>}
                <div className={styles.planName}>{p.name}</div>
                {p.tagline && <div className={styles.planTagline}>{p.tagline}</div>}
                <div className={styles.planPrice}>
                  {p.priceCents === 0 ? (
                    <span className={styles.planValue}>Grátis</span>
                  ) : (
                    <>
                      <span className={styles.planCurrency}>R$</span>
                      <span className={styles.planValue}>{formatPrice(p.priceCents)}</span>
                      <span className={styles.planPer}>/mês</span>
                    </>
                  )}
                </div>
                <ul className={styles.planList}>
                  {p.features.map((feat) => (
                    <li key={feat}><Check size={16} />{feat}</li>
                  ))}
                </ul>
                <Link href="/register" className={p.featured ? styles.planCtaPrimary : styles.planCta}>
                  Começar agora
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA FINAL (escuro) ---------- */}
      <section id="contato" className={styles.sectionDark}>
        <div className={styles.sectionGlowTop} />
        <div className={styles.container}>
          <div className={styles.ctaFinal} data-rise>
            <h2 className={styles.ctaFinalTitle}>Pronto para operar <em>no controle?</em></h2>
            <p className={styles.ctaFinalSub}>Configure em minutos. Sem cartão de crédito para começar.</p>
            <div className={styles.ctaFinalRow}>
              <Link href="/register" className={styles.btnPrimaryLg}>
                Se cadastre aqui
                <ArrowUpRight size={18} />
              </Link>
              <a href="mailto:contato@apice.com.br" className={styles.btnGhostDark}>Falar com a gente</a>
            </div>
          </div>
        </div>

        {/* footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <span className={styles.footerLogo}>ÁPICE<i>®</i></span>
              <p>O CRM do empreendedor brasileiro.<br />Menos improviso, mais decisão.</p>
            </div>
            <div className={styles.footerCols}>
              <div>
                <span className={styles.footerColTitle}>Produto</span>
                <a href="#funcionalidades">Funcionalidades</a>
                <a href="#planos">Planos</a>
                <a href="#para-quem">Para quem é</a>
              </div>
              <div>
                <span className={styles.footerColTitle}>Empresa</span>
                <a href="#contato">Contato</a>
                <Link href="/login">Entrar</Link>
                <Link href="/register">Criar conta</Link>
              </div>
              <div>
                <span className={styles.footerColTitle}>Legal</span>
                <Link href="/privacy">Privacidade</Link>
              </div>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 ÁPICE · Feito no Brasil 🇧🇷</span>
          </div>
        </footer>
      </section>

    </div>
  )
}
