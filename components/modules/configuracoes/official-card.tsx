'use client'

import { useState } from 'react'
import type { OfficialConfig } from '@/lib/whatsapp/types'

interface Props {
  config: OfficialConfig | null
  onSaved: () => void
}

export function OfficialCard({ config, onSaved }: Props) {
  const [form, setForm] = useState<OfficialConfig>({
    ativo: config?.ativo ?? false,
    provider: 'meta',
    phone_number_id: config?.phone_number_id ?? '',
    waba_id: config?.waba_id ?? '',
    access_token: config?.access_token ?? '',
    webhook_verify_token: config?.webhook_verify_token ?? '',
    api_version: config?.api_version ?? 'v19.0',
    api_url: config?.api_url ?? 'https://graph.facebook.com',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/configuracoes/whatsapp-official', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5 relative overflow-hidden">
      {/* Glow de destaque */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.103 1.518 5.82L.057 23.854a.5.5 0 00.608.608l6.034-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.034-1.386l-.36-.214-3.733.904.921-3.734-.234-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground text-sm">API Oficial do WhatsApp</h3>
              <span className="text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded px-1.5 py-0.5">
                Recomendado
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Meta Cloud API — protocolo oficial, zero risco de ban</p>
          </div>
        </div>

        {/* Toggle ativo */}
        <button
          onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            form.ativo ? 'bg-green-500' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-colors ${
              form.ativo ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2.5 text-xs text-blue-600 dark:text-blue-400 relative">
        ℹ️ Obtenha as credenciais em{' '}
        <a
          href="https://developers.facebook.com/apps"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-blue-500"
        >
          developers.facebook.com
        </a>
        . Crie um app do tipo <strong>Business</strong> e adicione o produto <strong>WhatsApp</strong>.
      </div>

      {/* Campos */}
      <div className="space-y-3 relative">
        <Field
          label="Phone Number ID"
          value={form.phone_number_id}
          placeholder="123456789012345"
          onChange={v => setForm(f => ({ ...f, phone_number_id: v }))}
          hint="Encontrado em: WhatsApp → Configuração → Número de telefone"
        />
        <Field
          label="WABA ID (WhatsApp Business Account ID)"
          value={form.waba_id}
          placeholder="123456789012345"
          onChange={v => setForm(f => ({ ...f, waba_id: v }))}
          hint="Encontrado em: WhatsApp → Configuração → Conta do WhatsApp Business"
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Token de acesso permanente</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.access_token}
              placeholder="EAAxxxxx..."
              onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
              className="w-full h-9 rounded-lg border border-input bg-background pl-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowToken(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Use um token de sistema permanente, não o token temporário</p>
        </div>
        <Field
          label="Token de verificação do Webhook"
          value={form.webhook_verify_token}
          placeholder="um-token-secreto-qualquer"
          onChange={v => setForm(f => ({ ...f, webhook_verify_token: v }))}
          hint="Você cria este valor e usa ao configurar o webhook no painel Meta"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Versão da API"
            value={form.api_version}
            placeholder="v19.0"
            onChange={v => setForm(f => ({ ...f, api_version: v }))}
          />
          <Field
            label="URL base"
            value={form.api_url}
            placeholder="https://graph.facebook.com"
            onChange={v => setForm(f => ({ ...f, api_url: v }))}
          />
        </div>
      </div>

      
      {/* Webhook URL */}
      <div className="rounded-lg px-3 py-3 relative" style={{ background: 'rgba(127,176,232,0.06)', border: '1px solid rgba(127,176,232,0.18)' }}>
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-[#9CC2EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" /></svg>
          <span className="text-[10px] font-mono tracking-wider text-[#9CC2EE]">URL DO WEBHOOK</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-[11px] font-mono text-foreground bg-black/25 border border-white/[0.07] rounded px-2.5 py-2 overflow-x-auto whitespace-nowrap">https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads</code>
          <button type="button" onClick={() => { navigator.clipboard?.writeText('https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads') }}
            className="px-3 py-2 rounded-lg border border-input bg-background text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap">Copiar</button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Configure esta URL no painel para receber as mensagens recebidas.</p>
      </div>

      {error && <p className="text-xs text-destructive relative">{error}</p>}

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full h-9 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors relative"
      >
        {loading ? 'Salvando…' : 'Salvar API Oficial'}
      </button>
    </div>
  )
}

function Field({
  label, value, placeholder, onChange, hint,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
