import Link from 'next/link'
import { Snowflake, Sun, Flame, Zap } from 'lucide-react'
import { calcularScore, mergeScoreConfig, type LeadScoreInput, type ScoreConfig } from '@/lib/lead-score'

/**
 * Termômetro da carteira: quantos leads estão frios, mornos e quentes agora.
 *
 * O score já era calculado por lead, mas só aparecia dentro do cartão no funil —
 * para saber se a carteira inteira estava esfriando era preciso abrir coluna por
 * coluna e somar de cabeça.
 *
 * Vive junto do dashboard da imobiliária, e não em `components/modules/dashboard`,
 * para deixar explícito que é do segmento: nenhum outro dashboard importa daqui.
 */

/**
 * Limiar de "muito quente": o topo da faixa quente, quem merece ligação antes do
 * café. É DERIVADO do limite que o dono configurou em Lead scoring, nunca um
 * número fixo — com um valor cravado e o dono usando outro limite, o mesmo lead
 * apareceria numa faixa aqui e em outra no cartão do funil.
 */
function limiarMuitoQuente(quente: number): number {
  return Math.min(100, Math.round(quente + (100 - quente) / 2))
}

const FAIXAS = [
  { id: 'frio', label: 'Frio', icon: Snowflake, fundo: 'bg-accent-soft', cor: 'text-accent' },
  { id: 'morno', label: 'Morno', icon: Sun, fundo: 'bg-warn-soft', cor: 'text-warn' },
  { id: 'quente', label: 'Quente', icon: Flame, fundo: 'bg-bad-soft', cor: 'text-bad' },
  { id: 'muito_quente', label: 'Muito quente', icon: Zap, fundo: 'bg-bad-soft ring-1 ring-inset ring-bad/25', cor: 'text-bad' },
] as const

export function TermometroLeads({ leads, config }: { leads: LeadScoreInput[]; config?: Partial<ScoreConfig> | null }) {
  const cfg = mergeScoreConfig(config)
  const muitoQuente = limiarMuitoQuente(cfg.limites.quente)

  const contagem: Record<string, number> = { frio: 0, morno: 0, quente: 0, muito_quente: 0 }
  for (const l of leads) {
    const { score, tier } = calcularScore(l, cfg)
    // `tier` manda: quem é morno no cartão do funil não pode virar quente aqui.
    contagem[tier === 'quente' && score >= muitoQuente ? 'muito_quente' : tier] += 1
  }

  const faixaLabel = (id: string) =>
    id === 'frio' ? `até ${cfg.limites.morno - 1}`
      : id === 'morno' ? `${cfg.limites.morno}–${cfg.limites.quente - 1}`
      : id === 'quente' ? `${cfg.limites.quente}–${muitoQuente - 1}`
      : `${muitoQuente}+`

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Termômetro de leads</h3>
        <Link href="/admin/scoring" className="shrink-0 text-[12px] font-semibold text-accent hover:underline">
          Ajustar pontuação →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FAIXAS.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.id} className={`rounded-control p-3 text-center ${f.fundo}`}>
              <Icon size={17} strokeWidth={1.8} className={`mx-auto ${f.cor}`} />
              <div className="num mt-1.5 text-[22px] font-bold leading-none text-ink">{contagem[f.id]}</div>
              <div className="mt-1 text-[11px] font-medium text-ink-2">{f.label}</div>
              <div className="num text-[10px] text-ink-3">{faixaLabel(f.id)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
