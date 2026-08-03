'use client'

import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { Card, Button, Badge } from '@/components/ui'

interface PlanoConfig {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  stripe_price_id: string | null
  limite_usuarios: number
  limite_leads: number
  features: string[]
  destaque: boolean
  ativo: boolean
  ordem: number
  cor: string
}

interface Empresa {
  plano: string | null
  trial_ends_at: string | null
  stripe_customer_id: string | null
}

interface Props {
  empresa: Empresa | null
  planos: PlanoConfig[]
}

const PAGAMENTOS_ATIVO = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

function fmtPreco(centavos: number) {
  if (centavos === 0) return 'Grátis'
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
}

export default function PlanosView({ empresa, planos }: Props) {
  const [loadingPlano, setLoadingPlano] = useState<string | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)

  const planoAtual = empresa?.plano ?? 'free'
  const temAssinatura = !!empresa?.stripe_customer_id

  const diasTrial = empresa?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0
  const emTrial = diasTrial > 0

  async function assinar(planoId: string) {
    if (!PAGAMENTOS_ATIVO || planoId === 'free' || planoId === planoAtual) return
    setLoadingPlano(planoId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planoId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // error shown via redirect failure
    } finally {
      setLoadingPlano(null)
    }
  }

  async function abrirPortal() {
    if (!PAGAMENTOS_ATIVO) return
    setLoadingPortal(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      // error shown via redirect failure
    } finally {
      setLoadingPortal(false)
    }
  }

  const gridCols = planos.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : planos.length >= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'

  return (
    <div className="flex h-full flex-col bg-bg">
      <Topbar title="Planos" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4 sm:px-6 sm:py-6 scrollbar-thin">

        <div className="mb-8 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Planos e preços</h1>
          <p className="mt-2 text-[13px] text-ink-2">
            14 dias grátis em qualquer plano pago. Cancele quando quiser.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {emTrial && (
              <Badge tone="warn">
                Você tem {diasTrial} dia{diasTrial !== 1 ? 's' : ''} de trial restante{diasTrial !== 1 ? 's' : ''}
              </Badge>
            )}
            <Badge tone="neutro">
              Plano atual: <span className="capitalize">{planoAtual}</span>
            </Badge>
          </div>
        </div>

        <div className={`grid ${gridCols} mx-auto max-w-4xl gap-6`}>
          {planos.map(p => {
            const ativo = planoAtual === p.id
            const loading = loadingPlano === p.id
            const isPago = p.preco_centavos > 0

            return (
              <div
                key={p.id}
                className={cn(
                  'relative flex flex-col rounded-card border bg-card p-6',
                  p.destaque ? 'border-accent ring-2 ring-accent/30' : 'border-line',
                )}
              >
                {p.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge tone="acc">POPULAR</Badge>
                  </div>
                )}

                <div className="mb-4 flex items-center gap-3">
                  <div className={cn('grid h-10 w-10 place-items-center rounded-control', p.destaque ? 'bg-accent-soft' : 'bg-ink/[0.05]')}>
                    <div className={cn('h-4 w-4 rounded-full', p.destaque ? 'bg-accent' : 'bg-ink-3')} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{p.nome}</p>
                    <p className="text-[12px] text-ink-3">{p.descricao}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="num text-3xl font-bold text-ink">{fmtPreco(p.preco_centavos)}</span>
                  {isPago && <span className="text-[13px] text-ink-3">/mês</span>}
                  {isPago && (
                    <p className="mt-1 text-[11px] text-ink-3">14 dias grátis, depois cobra</p>
                  )}
                </div>

                <div className="mb-6 flex-1 space-y-2">
                  {(Array.isArray(p.features) ? p.features : []).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-ink-2">
                      <Check size={13} strokeWidth={1.7} className="shrink-0 text-ok" />
                      {f}
                    </div>
                  ))}
                </div>

                {ativo ? (
                  <div className="w-full rounded-control border border-line bg-bg py-2.5 text-center text-[13px] font-semibold text-ink-3">
                    Plano atual
                  </div>
                ) : !isPago ? (
                  <div className="w-full rounded-control border border-line py-2.5 text-center text-[13px] text-ink-3">
                    Disponível no downgrade
                  </div>
                ) : !PAGAMENTOS_ATIVO ? (
                  <div className="w-full rounded-control border border-line py-2.5 text-center text-[13px] text-ink-3">
                    Em breve
                  </div>
                ) : (
                  <Button
                    onClick={() => assinar(p.id)}
                    disabled={!!loadingPlano}
                    loading={loading}
                    className="w-full"
                  >
                    {loading
                      ? 'Abrindo...'
                      : planoAtual === 'free'
                      ? 'Começar trial grátis'
                      : 'Fazer upgrade'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {!PAGAMENTOS_ATIVO && (
          <div className="mx-auto mt-8 max-w-4xl rounded-card border border-warn/20 bg-warn-soft p-5">
            <p className="text-[13px] font-semibold text-warn">Pagamentos em configuração</p>
            <p className="mt-0.5 text-[12px] text-ink-2">
              A cobrança automática será ativada em breve. Para assinar um plano, entre em contato com o suporte.
            </p>
          </div>
        )}

        {temAssinatura && PAGAMENTOS_ATIVO && (
          <Card className="mx-auto mt-8 max-w-4xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-ink">Gerenciar assinatura</p>
                <p className="mt-0.5 text-[12px] text-ink-2">
                  Altere o método de pagamento, veja faturas ou cancele.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={abrirPortal}
                disabled={loadingPortal}
                loading={loadingPortal}
                icon={<ExternalLink size={14} strokeWidth={1.7} />}
              >
                Portal do cliente
              </Button>
            </div>
          </Card>
        )}

        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { q: 'Preciso de cartão para o trial?', r: 'Sim, mas o cartão só é cobrado após os 14 dias.' },
            { q: 'Posso cancelar a qualquer momento?', r: 'Sim. Pelo portal do cliente você cancela em segundos.' },
            { q: 'Meus dados ficam salvos se cancelar?', r: 'Sim, você tem 30 dias para reativar antes de qualquer exclusão.' },
            { q: 'Aceita boleto ou PIX?', r: 'Por enquanto apenas cartão. Boleto/PIX em breve.' },
          ].map(item => (
            <div key={item.q} className="rounded-card border border-line bg-card p-4">
              <p className="mb-1 text-[12px] font-semibold text-ink">{item.q}</p>
              <p className="text-[12px] text-ink-2">{item.r}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
