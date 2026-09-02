'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, FlaskConical, Hammer, CircleDot, CheckCircle2 } from 'lucide-react'
import { Card, Button, Badge, notify } from '@/components/ui'
import { MENU_ICONS } from '@/components/layout/menu-icons'
import { LayoutDashboard } from 'lucide-react'
import type { StatusModulo } from '@/lib/menu'

export interface ItemLab {
  href: string
  label: string
  icon: string
  grupo: string
  status: StatusModulo
  /** Em quantos dos 7 segmentos o módulo está ligado hoje. */
  segmentos: number
}

const SELO: Record<StatusModulo, { rotulo: string; tom: 'warn' | 'acc' | 'ok'; Icon: typeof Hammer }> = {
  construcao: { rotulo: 'Em construção', tom: 'warn', Icon: Hammer },
  beta: { rotulo: 'Beta', tom: 'acc', Icon: CircleDot },
  producao: { rotulo: 'Produção', tom: 'ok', Icon: CheckCircle2 },
}

/**
 * Laboratório: abrir qualquer página do CRM para construir, sem depender de
 * liberar o módulo para alguém.
 *
 * Antes, para mexer numa tela nova era preciso ligá-la em `segmentos_config` —
 * o que a deixa a um clique de um lojista real. Aqui o superadmin entra na
 * empresa de PREVIEW (demo, fora das métricas) e abre a página com dados de
 * laboratório.
 */
export function LaboratorioView({ itens, emPreview, empresaPreview }: {
  itens: ItemLab[]
  emPreview: boolean
  empresaPreview: string | null
}) {
  const [entrando, setEntrando] = useState(false)

  async function entrarNoPreview() {
    setEntrando(true)
    try {
      const r = await fetch('/api/superadmin/laboratorio/preview', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad('Não consegui entrar no laboratório', j.error); return }
      // Preview de outro segmento troca o contexto do tenant — mesma razão do
      // `segmentos-view`: cache do anterior não pode sobrar.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/dashboard'
    } finally { setEntrando(false) }
  }

  const porStatus = (s: StatusModulo) => itens.filter((i) => i.status === s)
  const ordem: StatusModulo[] = ['construcao', 'beta', 'producao']

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto w-full max-w-[900px] space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
            <FlaskConical size={18} strokeWidth={1.8} className="text-accent" /> Laboratório
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Abra qualquer tela para construir. Módulo <strong className="text-ink-2">em construção</strong> não
            aparece para lojista nenhum, mesmo que alguém o ligue num segmento por engano.
          </p>
        </div>

        {/* Sem estar na empresa de preview, as telas abrem contra a empresa do
            usuário — que para o superadmin normalmente é nenhuma, e a página
            morre sem dados. Entrar no preview é o que dá dados de laboratório. */}
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">
                {emPreview
                  ? `Você está no laboratório${empresaPreview ? ` (${empresaPreview})` : ''}`
                  : 'Você não está no laboratório'}
              </div>
              <div className="text-[11.5px] text-ink-2">
                {emPreview
                  ? 'As telas abaixo abrem com os dados desta empresa de teste. Nada aqui afeta loja real.'
                  : 'Sem entrar, as telas abrem sem empresa e a maioria não carrega. Entre para construir com dados.'}
              </div>
            </div>
            {!emPreview && (
              <Button onClick={entrarNoPreview} loading={entrando} className="shrink-0">
                Entrar no laboratório
              </Button>
            )}
          </div>
        </Card>

        {ordem.map((s) => {
          const lista = porStatus(s)
          if (lista.length === 0) return null
          const { rotulo, tom, Icon } = SELO[s]
          return (
            <Card key={s} flush title={
              <span className="flex items-center gap-2">
                <Icon size={15} strokeWidth={1.8} /> {rotulo}
                <span className="text-[11.5px] font-normal text-ink-3">{lista.length}</span>
              </span>
            }>
              <div className="divide-y divide-line-soft">
                {lista.map((i) => {
                  const IconeMenu = MENU_ICONS[i.icon] ?? LayoutDashboard
                  return (
                    <div key={i.href} className="flex items-center gap-3 px-4 py-2.5">
                      <IconeMenu size={16} strokeWidth={1.7} className="flex-none text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{i.label}</div>
                        <div className="num truncate text-[11px] text-ink-3">{i.href} · {i.grupo}</div>
                      </div>
                      <Badge tone={i.segmentos > 0 ? 'neutro' : 'warn'}>
                        {i.segmentos > 0 ? `${i.segmentos}/7 segmentos` : 'nenhum segmento'}
                      </Badge>
                      <Badge tone={tom}>{rotulo}</Badge>
                      {/* Abre em outra aba: construir é ir e voltar, e perder
                          esta lista a cada clique atrapalharia. */}
                      <Link href={i.href} target="_blank" rel="noopener"
                        className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                        aria-label={`Abrir ${i.label}`}>
                        <ExternalLink size={15} strokeWidth={1.7} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })}

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          O status vive no catálogo do menu (<span className="num">lib/menu.ts</span>), não no banco: é decisão
          de código, versionada junto com a tela. Terminou a construção? Troque para{' '}
          <strong className="text-ink-2">beta</strong> e ligue no segmento de uma loja cobaia; depois{' '}
          <strong className="text-ink-2">produção</strong>.
        </p>
      </div>
    </main>
  )
}
