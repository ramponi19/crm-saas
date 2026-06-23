'use client'

import Image from 'next/image'
import { Zap, Package, TrendingUp } from 'lucide-react'
import styles from './Hero.module.css'

interface HeroProps {
  nome: string
  receita: number
  qtdVendas: number
  periodLabel: string
  onNovaVenda?: () => void
  onVerEstoque?: () => void
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

export function Hero({ nome, receita, qtdVendas, periodLabel, onNovaVenda, onVerEstoque }: HeroProps) {
  const firstName = nome.split(' ')[0]

  const greetings = [
    `Bom te ver, ${firstName}. A operação está`,
    `Boa gestão gera bons resultados. A operação está`,
    `Tudo nos trilhos, ${firstName}. A operação está`,
    `Pronto para vender, ${firstName}? A operação está`,
  ]
  const greeting = greetings[new Date().getDay() % greetings.length]

  const accents = ['voando alto', 'no ritmo certo', 'em pleno voo', 'crescendo forte']
  const accent = accents[new Date().getDay() % accents.length]

  const dateStr = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).toUpperCase()

  return (
    <section className={styles.hero}>

      {/* Águia — marca-d'água */}
      <Image
        src="/eagle-mark-white.png"
        alt=""
        width={500}
        height={500}
        className={styles.heroEagle}
        priority
      />

      {/* Badge SISTEMA ONLINE */}
      <div className={styles.heroStatus}>
        <span className={styles.heroStatusDot} />
        <span className={styles.heroStatusLabel}>SISTEMA ONLINE</span>
      </div>

      {/* Conteúdo */}
      <div className={styles.heroBody}>
        <div className={styles.heroDate}>{dateStr}</div>

        <h2 className={styles.heroTitle}>
          {greeting}{' '}
          <em>{accent}</em>.
        </h2>

        <div className={styles.heroMetricRow}>
          <div>
            <div className={styles.heroMetricLabel}>
              FATURAMENTO · {periodLabel.toUpperCase()}
            </div>
            <div className={styles.heroMetricValue}>
              {fmtBRL(receita)}
            </div>
          </div>
          <div className={styles.heroDelta}>
            <TrendingUp size={15} />
            <span>{qtdVendas} vendas</span>
          </div>
        </div>

        <div className={styles.heroActions}>
          <button className={styles.heroBtnPrimary} onClick={onNovaVenda}>
            <Zap size={18} /> Nova venda
          </button>
          <button className={styles.heroBtnGhost} onClick={onVerEstoque}>
            <Package size={18} /> Ver estoque
          </button>
        </div>
      </div>
    </section>
  )
}
