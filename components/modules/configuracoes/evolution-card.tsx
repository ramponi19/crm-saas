'use client'

import { useState } from 'react'
import { Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, Input, Button, Badge } from '@/components/ui'
import type { EvolutionConfig } from '@/lib/whatsapp/types'

interface Props {
  config: EvolutionConfig | null
  onSaved: () => void
}

const WEBHOOK_URL = 'https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads'

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
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-control bg-ok-soft text-ok">
            <svg className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.103 1.518 5.82L.057 23.854a.5.5 0 00.608.608l6.034-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.034-1.386l-.36-.214-3.733.904.921-3.734-.234-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
            </svg>
          </span>
          Evolution API
          <Badge tone="warn">Legado</Badge>
        </span>
      }
      actions={
        <button
          type="button"
          aria-label={form.ativo ? 'Desativar Evolution API' : 'Ativar Evolution API'}
          onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            form.ativo ? 'bg-ok' : 'bg-ink/15',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-card shadow transition-transform',
              form.ativo ? 'translate-x-4.5' : 'translate-x-0.5',
            )}
          />
        </button>
      }
    >
      <div className="space-y-5">
        <p className="text-xs text-ink-2">Protocolo não oficial — será descontinuado</p>

        {/* Aviso */}
        <div className="rounded-card border border-warn/20 bg-warn-soft px-3 py-2.5 text-xs text-warn">
          O Evolution API usa protocolo não oficial do WhatsApp. Existe risco de ban do número.
          Migre para a API Oficial assim que possível.
        </div>

        {/* Campos */}
        <div className="space-y-3">
          <Input
            label="URL da API"
            value={form.api_url}
            placeholder="https://seu-evolution.com"
            onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
          />
          <Input
            label="API Key"
            type="password"
            value={form.api_key}
            placeholder="sua-api-key"
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
          />
          <Input
            label="Nome da instância"
            value={form.instance}
            placeholder="jmstore"
            onChange={e => setForm(f => ({ ...f, instance: e.target.value }))}
          />
        </div>

        {/* Webhook URL */}
        <div className="rounded-card border border-accent/20 bg-accent-soft px-3 py-3">
          <div className="mb-2 flex items-center gap-2">
            <LinkIcon size={16} strokeWidth={1.7} className="text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">URL do webhook</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-control border border-line bg-bg px-2.5 py-2 text-[11px] text-ink-2">{WEBHOOK_URL}</code>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(WEBHOOK_URL) }}>Copiar</Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">Configure esta URL no painel para receber as mensagens recebidas.</p>
        </div>

        {error && <p className="text-xs text-bad">{error}</p>}

        <Button onClick={handleSave} loading={loading} className="w-full">
          {loading ? 'Salvando…' : 'Salvar Evolution API'}
        </Button>
      </div>
    </Card>
  )
}
