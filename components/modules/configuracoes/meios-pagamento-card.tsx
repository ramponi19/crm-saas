'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, CreditCard } from 'lucide-react'

type ProviderId = 'manual' | 'mercadopago' | 'asaas' | 'efibank' | 'pagseguro'

interface ProviderDef {
  id: ProviderId
  nome: string
  desc: string
  campos: { key: string; label: string; placeholder?: string }[]
}

const PROVIDERS: ProviderDef[] = [
  { id: 'manual', nome: 'Manual', desc: 'Registro manual de pagamentos, sem integração.', campos: [] },
  {
    id: 'mercadopago', nome: 'Mercado Pago', desc: 'Pix, boleto e link de pagamento.',
    campos: [{ key: 'access_token', label: 'Access Token', placeholder: 'APP_USR-...' }],
  },
  {
    id: 'asaas', nome: 'Asaas', desc: 'Pix, boleto e cartão.',
    campos: [{ key: 'api_key', label: 'API Key', placeholder: '$aact_...' }],
  },
  {
    id: 'efibank', nome: 'Efí Bank', desc: 'Pix com QR Code nativo.',
    campos: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Client_Id_...' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Client_Secret_...' },
      { key: 'chave_pix', label: 'Chave Pix', placeholder: 'sua-chave@email.com' },
    ],
  },
  {
    id: 'pagseguro', nome: 'PagSeguro', desc: 'Link de pagamento e Pix.',
    campos: [{ key: 'token', label: 'Token', placeholder: 'seu-token-pagseguro' }],
  },
]

export function MeiosPagamentoCard() {
  const [provider, setProvider] = useState<ProviderId>('manual')
  const [modo, setModo] = useState<'producao' | 'sandbox'>('producao')
  const [credenciais, setCredenciais] = useState<Record<string, string>>({})
  const [configurado, setConfigurado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/payments/config')
      .then(r => r.json())
      .then(d => {
        setProvider(d.provider ?? 'manual')
        setModo(d.modo ?? 'producao')
        setConfigurado(d.configurado ?? false)
      })
      .catch(() => {})
  }, [])

  const def = PROVIDERS.find(p => p.id === provider)!

  async function salvar() {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/payments/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          credenciais: provider === 'manual' ? {} : credenciais,
          modo,
          ativo: provider !== 'manual',
          testar: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ tipo: 'erro', msg: data.error ?? 'Erro ao salvar' })
        return
      }
      setFeedback({ tipo: 'ok', msg: 'Configuração salva com sucesso.' })
      setConfigurado(provider !== 'manual')
      setCredenciais({})
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro de conexão' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px]">
      <div className="font-mono text-[10px] tracking-[0.16em] text-[#788698]">PAGAMENTOS</div>
      <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px] mb-1">Meios de pagamento</h3>
      <p className="text-[12.5px] text-[#788698] mb-[18px]">
        Escolha o provedor que sua loja usará para gerar cobranças (Pix, boleto, link).
        As credenciais ficam criptografadas e nunca são exibidas após salvas.
      </p>

      {/* Seletor de provedor */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => { setProvider(p.id); setCredenciais({}); setFeedback(null) }}
            className={cn(
              'text-left p-[12px_14px] rounded-[13px] border transition-all',
              provider === p.id
                ? 'border-[#D7282F] bg-[#D7282F]/[0.04]'
                : 'border-[#16212E]/[0.08] hover:bg-[#16212E]/[0.02]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-[#1F2A39]">{p.nome}</span>
              {provider === p.id && <Check size={15} className="text-[#D7282F]" />}
            </div>
            <p className="text-[11px] text-[#788698] mt-1 leading-snug">{p.desc}</p>
          </button>
        ))}
      </div>

      {/* Campos de credenciais */}
      {def.campos.length > 0 && (
        <div className="space-y-3 mb-4">
          {configurado && (
            <p className="text-[12px] text-[#788698] bg-[#16212E]/[0.03] rounded-[10px] px-3 py-2">
              <CreditCard size={13} className="inline mr-1.5 -mt-0.5" />
              Já existe uma configuração salva. Preencha novamente para substituir.
            </p>
          )}
          {def.campos.map(c => (
            <div key={c.key}>
              <label className="block text-[12.5px] font-semibold text-[#56657A] mb-1.5">{c.label}</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={c.placeholder}
                value={credenciais[c.key] ?? ''}
                onChange={e => setCredenciais(v => ({ ...v, [c.key]: e.target.value }))}
                className="w-full bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] rounded-[10px] px-3.5 py-[10px] text-[13px] text-[#1F2A39] font-mono outline-none focus:border-[rgba(215,40,47,0.5)]"
              />
            </div>
          ))}

          {/* Modo */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[12.5px] font-semibold text-[#56657A]">Ambiente:</span>
            {(['producao', 'sandbox'] as const).map(m => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={cn(
                  'px-3 py-1.5 rounded-[9px] text-[12px] font-semibold capitalize transition-all',
                  modo === m ? 'bg-[#16212E] text-white' : 'bg-[#16212E]/[0.05] text-[#788698]'
                )}
              >
                {m === 'producao' ? 'Produção' : 'Sandbox'}
              </button>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <p className={cn('text-[12.5px] mb-3', feedback.tipo === 'ok' ? 'text-[#16A34A]' : 'text-[#DC2626]')}>
          {feedback.msg}
        </p>
      )}

      <button
        onClick={salvar}
        disabled={loading}
        className="px-[18px] py-[10px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white text-[13.5px] font-semibold shadow-[0_4px_14px_rgba(215,40,47,0.35)] hover:opacity-95 disabled:opacity-60 transition-all"
      >
        {loading ? 'Salvando...' : 'Salvar configuração'}
      </button>
    </div>
  )
}
