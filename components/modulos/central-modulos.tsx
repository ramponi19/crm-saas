'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge, Button, ConfirmDialog, notify } from '@/components/ui'
import { MENU_ICONS } from '@/components/layout/menu-icons'
import { GRUPOS_MODULO } from '@/core/modulos'
import type { TileModulo } from '@/lib/modulos-central'
import { cn } from '@/lib/utils'

/**
 * A grade da Central de Módulos (22/10/2026). O estado de cada tile já vem
 * calculado do servidor (lib/modulos-central.ts); aqui só os botões:
 *
 *   disponível  → Instalar        (POST /api/modulos/instalar)
 *   instalado   → Desinstalar     (com confirmação)
 *   pago        → Pedir           (POST /api/modulos/pedido; o superadmin atende)
 *   preparação  → sem botão
 *
 * Depois de instalar ou desinstalar, `router.refresh()` refaz o layout no
 * servidor: o menu muda sem recarregar a página.
 *
 * `?m=<chave>` (a vitrine de módulo desligado aponta para cá) rola até o tile e o
 * destaca.
 */
export interface TileComIcone extends TileModulo {
  icone: string
  /** Instalado, mas escondido em Configurações › Menu do CRM. */
  foraDoMenu: boolean
}

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

export function CentralModulos({ tiles, podeMudar, destaque }: { tiles: TileComIcone[]; podeMudar: boolean; destaque: string | null }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [tirar, setTirar] = useState<TileComIcone | null>(null)
  const [pedidos, setPedidos] = useState<Record<string, string>>({})

  useEffect(() => {
    if (destaque) document.getElementById(`modulo-${destaque}`)?.scrollIntoView({ block: 'center' })
  }, [destaque])

  async function enviar(t: TileComIcone, rota: '/api/modulos/instalar' | '/api/modulos/pedido', instalar?: boolean) {
    setOcupado(t.chave)
    try {
      const r = await fetch(rota, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instalar === undefined ? { chave: t.chave } : { chave: t.chave, instalar }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad(j.error ?? 'Não deu certo. Tente de novo.'); return }
      if (rota === '/api/modulos/pedido') {
        setPedidos((p) => ({ ...p, [t.chave]: j.pedido_em ?? new Date().toISOString() }))
        notify.ok('Pedido enviado.')
        return
      }
      notify.ok(instalar ? `${t.nome} instalado.` : `${t.nome} desinstalado.`)
      setTirar(null)
      router.refresh()
    } finally {
      setOcupado(null)
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-6 scrollbar-thin sm:px-6">
      <div className="mx-auto max-w-[1180px]">
        <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
          {podeMudar
            ? 'Instale o que a loja usa e tire o que não usa: o menu muda na hora. O que é pago chega por pedido.'
            : 'Os módulos da loja. Quem instala e tira é o dono; se você precisa de algum, fale com ele.'}
        </p>

        {GRUPOS_MODULO.map((g) => {
          const doGrupo = tiles.filter((t) => t.grupo === g.id)
          if (doGrupo.length === 0) return null
          return (
            <section key={g.id} className="mb-7">
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{g.label}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {doGrupo.map((t) => {
                  const Icone = MENU_ICONS[t.icone] ?? MENU_ICONS.Zap
                  const pedidoEm = pedidos[t.chave] ?? t.pedidoEm
                  const e = t.estado
                  return (
                    <div
                      key={t.chave}
                      id={`modulo-${t.chave}`}
                      className={cn(
                        'flex flex-col rounded-card border bg-card p-4',
                        destaque === t.chave ? 'border-accent ring-2 ring-accent/20' : 'border-line',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn(
                          'grid h-9 w-9 flex-none place-items-center rounded-control',
                          e.tipo === 'instalado' ? 'bg-accent-soft text-accent' : 'bg-ink/[0.05] text-ink-2',
                        )}>
                          <Icone size={17} strokeWidth={1.7} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{t.nome}</h3>
                            {e.tipo === 'instalado' && <Badge tone="ok" dot>Instalado</Badge>}
                            {e.tipo === 'pago' && <Badge tone="acc">Pago · {e.onde}</Badge>}
                            {e.tipo === 'preparacao' && <Badge>Em preparação</Badge>}
                          </div>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t.frase}</p>
                          {t.foraDoMenu && (
                            <p className="mt-1 text-[11.5px] text-ink-3">
                              Fora do menu: escondido em{' '}
                              {podeMudar ? <Link href="/configuracoes/menu" className="underline hover:text-ink">Menu do CRM</Link> : 'Menu do CRM'}.
                            </p>
                          )}
                        </div>
                      </div>

                      {podeMudar && e.tipo !== 'preparacao' && (
                        <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
                          {e.tipo === 'disponivel' && (
                            <Button size="sm" loading={ocupado === t.chave} onClick={() => enviar(t, '/api/modulos/instalar', true)}>Instalar</Button>
                          )}
                          {e.tipo === 'instalado' && e.podeDesinstalar && (
                            <Button size="sm" variant="outline" disabled={ocupado === t.chave} onClick={() => setTirar(t)}>Desinstalar</Button>
                          )}
                          {e.tipo === 'instalado' && !e.podeDesinstalar && (
                            <span className="text-[12px] text-ink-3">Contratado. Para tirar, fale com o suporte.</span>
                          )}
                          {e.tipo === 'pago' && (pedidoEm ? (
                            <>
                              <Button size="sm" variant="outline" disabled>Pedido enviado</Button>
                              <span className="text-[12px] text-ink-3">em {dia(pedidoEm)}</span>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" loading={ocupado === t.chave} onClick={() => enviar(t, '/api/modulos/pedido')}>Pedir</Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!tirar}
        onClose={() => setTirar(null)}
        onConfirm={() => tirar && enviar(tirar, '/api/modulos/instalar', false)}
        title={`Desinstalar ${tirar?.nome ?? ''}?`}
        description="O item sai do menu de todos da loja e a tela deixa de abrir. Nada é apagado: instalar de novo traz tudo de volta."
        confirmLabel="Desinstalar"
        tone="danger"
        loading={!!tirar && ocupado === tirar.chave}
      />
    </main>
  )
}
