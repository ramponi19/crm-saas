import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Card, StatCard } from '@/components/ui'
import type { VitrineModulo } from '@/lib/modulos-vitrine'

/**
 * A vitrine de um módulo desligado — um componente para os três (Agenda,
 * Executivo, Gestão de Leads). O conteúdo vem de lib/modulos-vitrine.ts.
 *
 * Desde a Central de Módulos (22/10/2026) o botão leva ao tile do módulo em
 * /modulos: é lá que o dono instala, pede o que é pago ou vê que o módulo está em
 * preparação — uma regra só, em vez de a vitrine decidir por conta própria (até
 * aqui ela tinha o "Ativar" do superadmin e o pedido do dono).
 */
export interface VitrineProps {
  modulo: VitrineModulo
  /** Chave do módulo no manifesto (core/modulos.ts): o tile em /modulos?m=<chave>. */
  chave: string | null
}

export function Vitrine({ modulo, chave }: VitrineProps) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-8 scrollbar-thin sm:px-6">
      <div className="mx-auto max-w-[760px]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent">
              <Sparkles size={18} strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Módulo desligado nesta loja</div>
              <h1 className="mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-ink">{modulo.nome}</h1>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{modulo.frase}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-card border border-line sm:grid-cols-3 [&>*]:border-line-soft [&>*:not(:last-child)]:border-b sm:[&>*:not(:last-child)]:border-b-0 sm:[&>*:not(:last-child)]:border-r">
            {modulo.numeros.map((n) => (
              <StatCard key={n.rotulo} bare label={n.rotulo} value={n.valor} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">Números de exemplo, para mostrar o tipo de leitura. Não são da sua loja.</p>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
            <Link
              href={chave ? `/modulos?m=${chave}` : '/modulos'}
              className="inline-flex h-9 items-center rounded-control bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink/90"
            >
              Ver na Central de módulos
            </Link>
            <span className="text-[12.5px] text-ink-2">Lá o dono instala o módulo ou faz o pedido.</span>
          </div>
        </Card>
      </div>
    </main>
  )
}
