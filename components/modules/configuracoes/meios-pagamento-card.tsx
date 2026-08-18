'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, CreditCard } from 'lucide-react'
import { Card, Input, Button } from '@/components/ui'

type ProviderId = 'manual' | 'mercadopago' | 'asaas' | 'efibank' | 'pagseguro'

interface ProviderDef {
  id: ProviderId
  nome: string
  desc: string
  campos: { key: string; label: string; placeholder?: string; dica?: string }[]
}

const PROVIDERS: ProviderDef[] = [
  { id: 'manual', nome: 'Manual', desc: 'Registro manual de pagamentos, sem integração.', campos: [] },
  {
    id: 'mercadopago', nome: 'Mercado Pago', desc: 'Pix, boleto e link de pagamento.',
    campos: [
      { key: 'access_token', label: 'Access Token', placeholder: 'APP_USR-...' },
      // Sem o segredo do webhook o CRM não tem como provar que o aviso de
      // "pago" veio mesmo do provedor, e recusa o aviso. Faltava no formulário:
      // dava para ligar o meio de pagamento sem ele e a confirmação nunca chegaria.
      { key: 'webhook_secret', label: 'Chave secreta do webhook', placeholder: 'do painel do Mercado Pago', dica: 'Sem ela o pagamento não confirma sozinho.' },
    ],
  },
  {
    id: 'asaas', nome: 'Asaas', desc: 'Pix, boleto e cartão.',
    campos: [
      { key: 'api_key', label: 'API Key', placeholder: '$aact_...' },
      { key: 'webhook_token', label: 'Token do webhook', placeholder: 'o que você definiu no Asaas', dica: 'Sem ele o pagamento não confirma sozinho.' },
    ],
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
    campos: [
      { key: 'token', label: 'Token', placeholder: 'seu-token-pagseguro' },
      { key: 'webhook_secret', label: 'Chave secreta do webhook', placeholder: 'do painel do PagSeguro', dica: 'Sem ela o pagamento não confirma sozinho.' },
    ],
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
    <Card title="Meios de pagamento">
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Escolha o provedor que sua loja usará para gerar cobranças (Pix, boleto, link).
        As credenciais ficam criptografadas e nunca são exibidas após salvas.
      </p>

      {/* Seletor de provedor */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => { setProvider(p.id); setCredenciais({}); setFeedback(null) }}
            className={cn(
              'rounded-card border p-[12px_14px] text-left transition-colors',
              provider === p.id
                ? 'border-accent bg-accent-soft'
                : 'border-line hover:bg-bg',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-ink">{p.nome}</span>
              {provider === p.id && <Check size={15} strokeWidth={1.7} className="text-accent" />}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-2">{p.desc}</p>
          </button>
        ))}
      </div>

      {/* Campos de credenciais */}
      {def.campos.length > 0 && (
        <div className="mb-4 space-y-3">
          {configurado && (
            <p className="rounded-control bg-ink/[0.03] px-3 py-2 text-[12px] text-ink-2">
              <CreditCard size={13} strokeWidth={1.7} className="-mt-0.5 mr-1.5 inline" />
              Já existe uma configuração salva. Preencha novamente para substituir.
            </p>
          )}
          {def.campos.map(c => (
            <Input
              key={c.key}
              label={c.label}
              type="password"
              autoComplete="off"
              placeholder={c.placeholder}
              value={credenciais[c.key] ?? ''}
              onChange={e => setCredenciais(v => ({ ...v, [c.key]: e.target.value }))}
              hint={c.dica}
            />
          ))}

          {/* Modo */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[12.5px] font-semibold text-ink-2">Ambiente:</span>
            {(['producao', 'sandbox'] as const).map(m => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={cn(
                  'rounded-control px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors',
                  modo === m ? 'bg-ink text-white' : 'bg-ink/[0.05] text-ink-2',
                )}
              >
                {m === 'producao' ? 'Produção' : 'Sandbox'}
              </button>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <p className={cn('mb-3 text-[12.5px]', feedback.tipo === 'ok' ? 'text-ok' : 'text-bad')}>
          {feedback.msg}
        </p>
      )}

      <Button onClick={salvar} loading={loading}>
        {loading ? 'Salvando...' : 'Salvar configuração'}
      </Button>
    </Card>
  )
}
