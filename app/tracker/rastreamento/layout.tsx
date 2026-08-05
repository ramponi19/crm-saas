import { MarketingSubnav } from '@/components/tracker/marketing-subnav'
import { Radar } from 'lucide-react'

const C = { ink: '#111e26', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884' }

/** Módulo Rastreamento: cabeçalho + sub-navegação (5 seções) + conteúdo. */
export default function RastreamentoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b px-5 py-4 sm:px-7" style={{ borderColor: C.line }}>
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>
          <Radar size={20} strokeWidth={1.9} style={{ color: C.teal }} /> Rastreamento
        </h1>
        <p className="text-[13px]" style={{ color: C.ink3 }}>Veja a origem de cada lead, configure os caminhos de captura e otimize suas campanhas.</p>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block"><MarketingSubnav /></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
