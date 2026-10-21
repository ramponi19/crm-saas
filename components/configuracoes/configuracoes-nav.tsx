'use client'

import { usePathname } from 'next/navigation'
import { LinkDeMenu } from '@/components/layout/link-de-menu'
import { cn } from '@/lib/utils'
import type { SecaoConfig } from '@/lib/configuracoes-menu'

/**
 * O menu lateral da tela de Configurações. No computador é uma coluna ao lado do
 * conteúdo; no celular, uma faixa que rola de lado acima dele.
 */
export function ConfiguracoesNav({ secoes }: { secoes: SecaoConfig[] }) {
  const pathname = usePathname()
  const ativo = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const itens = secoes.flatMap((s) => s.grupos.flatMap((g) => g.itens))

  return (
    <>
      <nav aria-label="Configurações" className="hidden w-[224px] shrink-0 overflow-y-auto border-r border-line-soft bg-raised px-2 py-3 scrollbar-thin md:block">
        <div className="px-2.5 pb-2 text-[13px] font-bold tracking-[-0.02em] text-ink">Configurações</div>
        {secoes.map((s) => (
          <div key={s.id} className="mt-2">
            <div className="px-2.5 pb-1 pt-2 text-[12px] font-semibold text-ink">{s.label}</div>
            {s.grupos.map((g, gi) => (
              <div key={gi} className="mb-1">
                {g.label && (
                  <div className="px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{g.label}</div>
                )}
                <div className="space-y-px">
                  {g.itens.map((i) => (
                    <LinkDeMenu key={i.href} href={i.href}
                      className={cn('block truncate rounded-control px-2.5 py-[6px] text-[12.5px] transition-colors',
                        ativo(i.href) ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2 hover:bg-line-soft hover:text-ink')}>
                      {i.label}
                    </LinkDeMenu>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </nav>

      <nav aria-label="Configurações" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line-soft bg-raised px-3 py-2 scrollbar-thin md:hidden">
        {itens.map((i) => (
          <LinkDeMenu key={i.href} href={i.href}
            className={cn('shrink-0 rounded-control px-2.5 py-1.5 text-[12.5px] transition-colors',
              ativo(i.href) ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2 hover:bg-line-soft')}>
            {i.label}
          </LinkDeMenu>
        ))}
      </nav>
    </>
  )
}
