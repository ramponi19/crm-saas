'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogIn, ArrowUpRight } from 'lucide-react'
import styles from './Landing.module.css'

export default function Landing() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let t = 0, raf = 0
    const resize = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    const lines = 6
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      for (let i = 0; i < lines; i++) {
        ctx.beginPath()
        const amp = 16 + i * 9
        const yBase = cv.height * (0.30 + i * 0.11)
        for (let x = 0; x <= cv.width; x += 8) {
          const y = yBase
            + Math.sin(x * 0.0055 + t * 0.012 + i * 0.85) * amp
            + Math.sin(x * 0.013 + t * 0.008) * amp * 0.4
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(198,168,106,${0.07 + i * 0.028})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      t++
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  const logoSrc = '/eagle-navy.png'

  return (
    <div className={styles.page}>
      <div className={styles.blobGold} />
      <div className={styles.blobNavy} />
      <div className={styles.grid} />
      <canvas ref={canvasRef} className={styles.flow} />

      {/* nav */}
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <Image src={logoSrc} alt="" width={68} height={49} className={styles.brandMark} priority />
          <span className={styles.brandName}>ÁPICE</span>
          <span className={styles.brandReg}>®</span>
        </Link>
        <div className={styles.navRight}>
          <div className={styles.navLinks}>
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#planos">Planos</a>
            <a href="#para-quem">Para quem é</a>
            <a href="#contato">Contato</a>
          </div>
          <Link href="/login" className={styles.loginBtn}>
            <LogIn size={16} />
            Entrar
          </Link>
        </div>
      </nav>

      {/* hero */}
      <div className={styles.hero}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>
            <span className={styles.dot} />
            PLATAFORMA DE CRM · FEITA NO BRASIL
          </div>
          <h1 className={styles.h1}>
            O CRM do empreendedor <em>está aqui.</em>
          </h1>
          <p className={styles.lede}>
            Vendas, atendimento e operação num só núcleo. Menos improviso, mais
            decisão — para quem leva o próprio negócio a sério.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/register" className={styles.btnPrimary}>
              Se cadastre aqui
              <ArrowUpRight size={18} />
            </Link>
            <a href="#funcionalidades" className={styles.btnGhost}>Ver funcionalidades</a>
          </div>
          <div className={styles.trust}>
            <div className={styles.avatars}><span /><span /><span /></div>
            <div className={styles.trustText}>
              <b>+1.200 empreendedores</b><br />já operam no controle, não no improviso.
            </div>
          </div>
        </div>

        <div className={styles.eagleWrap}>
          <div className={styles.eagleAura} />
          <div className={styles.eagleOrbit} />
          <div className={styles.eagleRing} />
          <Image src={logoSrc} alt="Águia" width={420} height={302} className={styles.eagleImg} priority />
          <div className={styles.eagleCaption}>VISÃO DE ÁGUIA<br /><b>SOBRE TODA A OPERAÇÃO</b></div>
        </div>
      </div>

      {/* marquee */}
      <div className={styles.marquee}>
        <div className={styles.marqueeTrack}>
          {[0, 1].map((k) => (
            <div className={styles.marqueeGroup} key={k} aria-hidden={k === 1}>
              <span>PDV INTEGRADO</span><i>◆</i>
              <span>PIPELINE DE VENDAS</span><i>◆</i>
              <span>ATENDIMENTO MULTICANAL</span><i>◆</i>
              <span>CONTROLE DE ESTOQUE</span><i>◆</i>
              <span>RELATÓRIOS EM TEMPO REAL</span><i>◆</i>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
