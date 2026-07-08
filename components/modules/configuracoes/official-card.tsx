'use client'

import { useState } from 'react'
import { Link as LinkIcon, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, Input, Button, Badge, controlClass } from '@/components/ui'
import type { OfficialConfig } from '@/lib/whatsapp/types'

interface Props {
  config: OfficialConfig | null
  onSaved: () => void
}

const WEBHOOK_URL = 'https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads'

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
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-control bg-ok-soft text-ok">
            <svg className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.103 1.518 5.82L.057 23.854a.5.5 0 00.608.608l6.034-1.461A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.034-1.386l-.36-.214-3.733.904.921-3.734-.234-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
            </svg>
          </span>
          API Oficial do WhatsApp
          <Badge tone="ok">Recomendado</Badge>
        </span>
      }
      actions={
        <button
          type="button"
          aria-label={form.ativo ? 'Desativar API Oficial' : 'Ativar API Oficial'}
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
        <p className="text-xs text-ink-2">Meta Cloud API — protocolo oficial, zero risco de ban</p>

        {/* Info */}
        <div className="rounded-card border border-accent/20 bg-accent-soft px-3 py-2.5 text-xs text-ink-2">
          Obtenha as credenciais em{' '}
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline underline-offset-2"
          >
            developers.facebook.com
          </a>
          . Crie um app do tipo <strong className="text-ink">Business</strong> e adicione o produto <strong className="text-ink">WhatsApp</strong>.
        </div>

        {/* Campos */}
        <div className="space-y-3">
          <Input
            label="Phone Number ID"
            value={form.phone_number_id}
            placeholder="123456789012345"
            onChange={e => setForm(f => ({ ...f, phone_number_id: e.target.value }))}
            hint="Encontrado em: WhatsApp → Configuração → Número de telefone"
          />
          <Input
            label="WABA ID (WhatsApp Business Account ID)"
            value={form.waba_id}
            placeholder="123456789012345"
            onChange={e => setForm(f => ({ ...f, waba_id: e.target.value }))}
            hint="Encontrado em: WhatsApp → Configuração → Conta do WhatsApp Business"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-ink-2">Token de acesso permanente</label>
            <div className="relative flex items-center">
              <input
                type={showToken ? 'text' : 'password'}
                value={form.access_token}
                placeholder="EAAxxxxx..."
                onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
                className={cn(controlClass(false), 'h-9 pl-3 pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowToken(s => !s)}
                aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                className="absolute right-2.5 text-ink-3 transition-colors hover:text-ink"
              >
                {showToken
                  ? <EyeOff size={16} strokeWidth={1.7} />
                  : <Eye size={16} strokeWidth={1.7} />}
              </button>
            </div>
            <p className="text-[11px] text-ink-3">Use um token de sistema permanente, não o token temporário</p>
          </div>
          <Input
            label="Token de verificação do Webhook"
            value={form.webhook_verify_token}
            placeholder="um-token-secreto-qualquer"
            onChange={e => setForm(f => ({ ...f, webhook_verify_token: e.target.value }))}
            hint="Você cria este valor e usa ao configurar o webhook no painel Meta"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Versão da API"
              value={form.api_version}
              placeholder="v19.0"
              onChange={e => setForm(f => ({ ...f, api_version: e.target.value }))}
            />
            <Input
              label="URL base"
              value={form.api_url}
              placeholder="https://graph.facebook.com"
              onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
            />
          </div>
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
          {loading ? 'Salvando…' : 'Salvar API Oficial'}
        </Button>
      </div>
    </Card>
  )
}
