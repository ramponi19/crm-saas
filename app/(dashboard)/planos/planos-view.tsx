'use client'

import { useState } from 'react'
import { Check, Loader2, ExternalLink } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'

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

  const gridCols = planos.length === 2 ? 'grid-cols-2' : planos.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9]">
      <Topbar title="Planos" />
      <div className="flex-1 overflow-y-auto">
      <div className="px-8 pt-8 pb-12">

        <div className="text-center mb-10">
          <h1 className="font-serif font-medium text-[28px] text-[#1F2A39]">Planos e preços</h1>
          <p className="text-[#788698] text-sm mt-2">
            14 dias grátis em qualquer plano pago. Cancele quando quiser.
          </p>

          {emTrial && (
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.2)] rounded-full">
              <span className="text-xs text-[#FBBF24] font-medium">
                ✨ Você tem {diasTrial} dia{diasTrial !== 1 ? 's' : ''} de trial restante{diasTrial !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] rounded-full ml-2">
            <span className="text-xs text-[#788698]">Plano atual:</span>
            <span className="text-xs font-semibold text-[#1F2A39] capitalize">{planoAtual}</span>
          </div>
        </div>

        <div className={`grid ${gridCols} gap-6 max-w-4xl mx-auto`}>
          {planos.map(p => {
            const ativo = planoAtual === p.id
            const loading = loadingPlano === p.id
            const isPago = p.preco_centavos > 0

            return (
              <div
                key={p.id}
                className="relative flex flex-col rounded-[20px] border p-6 transition-all"
                style={p.destaque
                  ? { borderColor: `${p.cor}66`, background: `${p.cor}08`, boxShadow: `0 8px 32px ${p.cor}15` }
                  : { borderColor: 'rgba(22,33,46,0.08)', background: '#F0F2F5' }}
              >
                {p.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide"
                      style={{ background: p.cor }}>
                      POPULAR
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                    style={{ background: `${p.cor}18` }}>
                    <div className="w-4 h-4 rounded-full" style={{ background: p.cor }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1F2A39]">{p.nome}</p>
                    <p className="text-xs text-[#788698]">{p.descricao}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="text-3xl font-extrabold text-[#1F2A39]">{fmtPreco(p.preco_centavos)}</span>
                  {isPago && <span className="text-sm text-[#788698]">/mês</span>}
                  {isPago && (
                    <p className="text-[10px] text-[#9AA7B6] mt-1">14 dias grátis, depois cobra</p>
                  )}
                </div>

                <div className="flex-1 space-y-2 mb-6">
                  {(Array.isArray(p.features) ? p.features : []).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-[#56657A]">
                      <Check size={12} className="text-[#15986A] shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>

                {ativo ? (
                  <div className="w-full py-2.5 text-center text-sm font-semibold rounded-[10px] bg-white/[0.06] text-[#788698]">
                    Plano atual
                  </div>
                ) : !isPago ? (
                  <div className="w-full py-2.5 text-center text-sm text-[#9AA7B6] rounded-[10px] border border-[#16212E]/[0.06]">
                    Disponível no downgrade
                  </div>
                ) : !PAGAMENTOS_ATIVO ? (
                  <div className="w-full py-2.5 text-center text-sm text-[#9AA7B6] rounded-[10px] border border-[#16212E]/[0.06]">
                    Em breve
                  </div>
                ) : (
                  <button
                    onClick={() => assinar(p.id)}
                    disabled={!!loadingPlano}
                    className="w-full py-2.5 text-sm font-semibold rounded-[10px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-white"
                    style={{ background: p.cor }}
                  >
                    {loading
                      ? <><Loader2 size={14} className="animate-spin" /> Abrindo...</>
                      : planoAtual === 'free'
                      ? 'Começar trial grátis'
                      : 'Fazer upgrade'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {!PAGAMENTOS_ATIVO && (
          <div className="max-w-4xl mx-auto mt-8 p-5 bg-[#FEF9EC] border border-[#FBBF24]/30 rounded-[16px] flex items-start gap-3">
            <span className="text-xl">⚙️</span>
            <div>
              <p className="text-sm font-semibold text-[#78350F]">Pagamentos em configuração</p>
              <p className="text-xs text-[#92400E] mt-0.5">
                A cobrança automática será ativada em breve. Para assinar um plano, entre em contato com o suporte.
              </p>
            </div>
          </div>
        )}

        {temAssinatura && PAGAMENTOS_ATIVO && (
          <div className="max-w-4xl mx-auto mt-8 p-5 bg-[#F0F2F5] border border-[#16212E]/[0.08] rounded-[16px] flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#1F2A39]">Gerenciar assinatura</p>
              <p className="text-xs text-[#788698] mt-0.5">
                Altere o método de pagamento, veja faturas ou cancele.
              </p>
            </div>
            <button
              onClick={abrirPortal}
              disabled={loadingPortal}
              className="flex items-center gap-2 bg-white border border-[#16212E]/[0.08] text-sm text-[#56657A] font-medium px-4 py-2 rounded-[10px] transition-colors disabled:opacity-50 hover:bg-[#F4F6F9]"
            >
              {loadingPortal ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              Portal do cliente
            </button>
          </div>
        )}

        <div className="max-w-4xl mx-auto mt-10 grid grid-cols-2 gap-4">
          {[
            { q: 'Preciso de cartão para o trial?', r: 'Sim, mas o cartão só é cobrado após os 14 dias.' },
            { q: 'Posso cancelar a qualquer momento?', r: 'Sim. Pelo portal do cliente você cancela em segundos.' },
            { q: 'Meus dados ficam salvos se cancelar?', r: 'Sim, você tem 30 dias para reativar antes de qualquer exclusão.' },
            { q: 'Aceita boleto ou PIX?', r: 'Por enquanto apenas cartão. Boleto/PIX em breve.' },
          ].map(item => (
            <div key={item.q} className="p-4 bg-[#F0F2F5] border border-[#16212E]/[0.08] rounded-[12px]">
              <p className="text-xs font-semibold text-[#56657A] mb-1">{item.q}</p>
              <p className="text-xs text-[#788698]">{item.r}</p>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
