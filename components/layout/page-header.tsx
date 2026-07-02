import type { ReactNode } from 'react'

/**
 * Cabeçalho de página padrão do ÁPICE (para telas fora do CRM que não usam o Topbar:
 * /admin e /superadmin). Título em serif Fraunces, sem "eyebrow". Mesmo padrão do Topbar.
 */
export function PageHeader({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="font-serif font-medium text-[26px] tracking-[-0.02em] text-[#16212E] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-[#788698] mt-1">{subtitle}</p>}
      </div>
      {children ? <div className="flex items-center gap-2 shrink-0">{children}</div> : null}
    </div>
  )
}
