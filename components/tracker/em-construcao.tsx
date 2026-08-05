import { Construction } from 'lucide-react'

const C = { ink: '#111e26', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884' }

/** Placeholder de módulo do Tracker ainda não construído (mantém a navegação viva). */
export function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{titulo}</h1>
        <p className="text-[13px]" style={{ color: C.ink3 }}>{descricao}</p>
      </header>
      <div className="grid min-h-[280px] place-items-center rounded-[14px] border" style={{ borderColor: C.line, background: '#fff' }}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}>
            <Construction size={22} strokeWidth={1.8} />
          </span>
          <div>
            <div className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Módulo em construção</div>
            <div className="mt-1 text-[13px]" style={{ color: C.ink3 }}>Este módulo será construído em seguida, tela por tela.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
