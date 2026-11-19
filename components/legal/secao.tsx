import type { ReactNode } from 'react'

/** Seção numerada dos documentos legais (Termos, DPA). */
export function SecaoLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{titulo}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-[1.7] text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  )
}

/** Moldura das páginas legais: largura de leitura, título e a versão logo abaixo. */
export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink">{titulo}</h1>
      {children}
    </main>
  )
}
