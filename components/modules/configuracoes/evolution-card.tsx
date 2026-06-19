'use client'

import { useState } from 'react'
import type { EvolutionConfig } from '@/lib/whatsapp/types'

interface Props {
  config: EvolutionConfig | null
  onSaved: () => void
}

export function EvolutionCard({ config, onSaved }: Props) {
  const [form, setForm] = useState<EvolutionConfig>({
    ativo: config?.ativo ?? false,
    api_url: config?.api_url ?? '',
    api_key: config?.api_key ?? '',
    instance: config?.instance ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/configuracoes/whatsapp-evolution', {
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
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.103 1.518 5.82L.057 23.854a.5.5 0 00.608.608l6.034-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.034-1.386l-.36-.214-3.733.904.921-3.734-.234-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground text-sm">Evolution API</h3>
              <span className="text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5">
                Legado
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Protocolo não oficial — será descontinuado</p>
          </div>
        </div>

        {/* Toggle ativo */}
        <button
          onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            form.ativo ? 'bg-emerald-500' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              form.ativo ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Aviso */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400">
        ⚠️ O Evolution API usa protocolo não oficial do WhatsApp. Existe risco de ban do número. 
        Migre para a API Oficial assim que possível.
      </div>

      {/* Campos */}
      <div className="space-y-3">
        <Field
          label="URL da API"
          value={form.api_url}
          placeholder="https://seu-evolution.com"
          onChange={v => setForm(f => ({ ...f, api_url: v }))}
        />
        <Field
          label="API Key"
          value={form.api_key}
          placeholder="sua-api-key"
          type="password"
          onChange={v => setForm(f => ({ ...f, api_key: v }))}
        />
        <Field
          label="Nome da instância"
          value={form.instance}
          placeholder="jmstore"
          onChange={v => setForm(f => ({ ...f, instance: v }))}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Salvando…' : 'Salvar Evolution API'}
      </button>
    </div>
  )
}

function Field({
  label, value, placeholder, type = 'text', onChange,
}: {
  label: string
  value: string
  placeholder: string
  type?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
