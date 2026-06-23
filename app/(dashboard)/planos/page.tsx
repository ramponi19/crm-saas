'use client'

import { useState } from 'react'
import { useEmpresa } from '@/lib/empresa-context'
import { Check, Loader2, ExternalLink, Zap, Shield, Rocket } from 'lucide-react'

const PLANOS = [
  {
    id: 'free',
    nome: 'Free',
    preco: 'Grátis',
    periodo: '',
    cor: '#5C6E84',
    icone: Shield,
    descricao: 'Para começar e testar',
    features: [
      '1 usuário',
      '100 leads',
      'PDV básico',
      'Estoque',
      'Clientes',
    ],
    nao_inclui: ['BI e Relatórios', 'WhatsApp integrado', 'White-label', 'Suporte prioritário'],
    destaque: false,
  },
  {
    id: 'starter',
    nome: 'Starter',
    preco: 'R$ 197',
    periodo: '/mês',
    cor: '#6B8CFF',
    icone: Zap,
    descricao: 'Para lojas em crescimento',
    features: [
      '3 usuários',
      '500 leads',
      'Todos os módulos',
      'BI e Relatórios',
      'WhatsApp integrado',
      '14 dias grátis',
    ],
    nao_inclui: ['White-label completo', 'API acesso', 'Suporte prioritário'],
    destaque: true,
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 'R$ 397',
    periodo: '/mês',
    cor: '#D7282F',
    icone: Rocket,
    descricao: 'Para redes de lojas',
    features: [
      'Usuários ilimitados',
      'Leads ilimitados',
      'Todos os módulos',
      'BI e Relatórios',
      'WhatsApp integrado',
      'White-label completo',
      'API acesso',
      'Suporte prioritário',
      '14 dias grátis',
    ],
    nao_inclui: [],
    destaque: false,
  },
]

export default function PlanosPage() {
  const { empresa } = useEmpresa()
  const [loadingPlano, setLoadingPlano] = useState<string | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)

  const planoAtual = empresa?.plano ?? 'free'
  const temAssinatura = !!empresa?.stripe_customer_id

  async function assinar(planoId: string) {
    if (planoId === 'free' || planoId === planoAtual) return
    setLoadingPlano(planoId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planoId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingPlano(null)
    }
  }

  async function abrirPortal() {
    setLoadingPortal(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingPortal(false)
    }
  }

  // Dias restantes de trial
  const diasTrial = empresa?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0
  const emTrial = diasTrial > 0

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-y-auto">
      <div className="px-8 pt-8 pb-12">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-[#1F2A39]">Planos e preços</h1>
          <p className="text-[#788698] text-sm mt-2">
            14 dias grátis em qualquer plano pago. Cancele quando quiser.
          </p>

          {/* Banner trial */}
          {emTrial && (
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.2)] rounded-full">
              <span className="text-xs text-[#FBBF24] font-medium">
                ✨ Você tem {diasTrial} dia{diasTrial !== 1 ? 's' : ''} de trial restante{diasTrial !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Plano atual */}
          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 bg-white/[0.04] border border-[#16212E]/[0.08] rounded-full ml-2">
            <span className="text-xs text-[#788698]">Plano atual:</span>
            <span className="text-xs font-semibold text-white capitalize">{planoAtual}</span>
          </div>
        </div>

        {/* Cards de planos */}
        <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PLANOS.map(p => {
            const Icone = p.icone
            const ativo = planoAtual === p.id
            const loading = loadingPlano === p.id

            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-[20px] border p-6 transition-all ${
                  p.destaque
                    ? 'border-[#6B8CFF]/40 bg-[rgba(107,140,255,0.05)]'
                    : 'border-[#16212E]/[0.08] bg-[#F0F2F5]'
                }`}
              >
                {/* Badge popular */}
                {p.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#6B8CFF] text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide">
                      POPULAR
                    </span>
                  </div>
                )}

                {/* Ícone + nome */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                    style={{ background: `${p.cor}18` }}>
                    <Icone size={18} style={{ color: p.cor }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{p.nome}</p>
                    <p className="text-xs text-[#788698]">{p.descricao}</p>
                  </div>
                </div>

                {/* Preço */}
                <div className="mb-6">
                  <span className="text-3xl font-extrabold text-white">{p.preco}</span>
                  <span className="text-sm text-[#788698]">{p.periodo}</span>
                  {p.id !== 'free' && (
                    <p className="text-[10px] text-[#9AA7B6] mt-1">14 dias grátis, depois cobra</p>
                  )}
                </div>

                {/* Features */}
                <div className="flex-1 space-y-2 mb-6">
                  {p.features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs text-[#788698]">
                      <Check size={12} className="text-[#15986A] shrink-0" />
                      {f}
                    </div>
                  ))}
                  {p.nao_inclui.map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs text-[#9AA7B6] line-through">
                      <div className="w-3 h-3 rounded-full border border-[#3F516A]/40 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>

                {/* Botão */}
                {ativo ? (
                  <div className="w-full py-2.5 text-center text-sm font-semibold rounded-[10px] bg-white/[0.06] text-[#788698]">
                    Plano atual
                  </div>
                ) : p.id === 'free' ? (
                  <div className="w-full py-2.5 text-center text-sm text-[#9AA7B6] rounded-[10px] border border-[#16212E]/[0.06]">
                    Disponível no downgrade
                  </div>
                ) : (
                  <button
                    onClick={() => assinar(p.id)}
                    disabled={!!loadingPlano}
                    className="w-full py-2.5 text-sm font-semibold rounded-[10px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: p.cor, color: 'white' }}
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

        {/* Gerenciar assinatura */}
        {temAssinatura && (
          <div className="max-w-4xl mx-auto mt-8 p-5 bg-[#F0F2F5] border border-[#16212E]/[0.08] rounded-[16px] flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Gerenciar assinatura</p>
              <p className="text-xs text-[#788698] mt-0.5">
                Altere o método de pagamento, veja faturas ou cancele.
              </p>
            </div>
            <button
              onClick={abrirPortal}
              disabled={loadingPortal}
              className="flex items-center gap-2 bg-white/[0.06] hover:bg-[#16212E]/[0.04] text-sm text-[#56657A] font-medium px-4 py-2 rounded-[10px] transition-colors disabled:opacity-50"
            >
              {loadingPortal
                ? <Loader2 size={14} className="animate-spin" />
                : <ExternalLink size={14} />}
              Portal do cliente
            </button>
          </div>
        )}

        {/* FAQ rápido */}
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
  )
}
