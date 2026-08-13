'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquareText, ExternalLink } from 'lucide-react'
import { Card, notify } from '@/components/ui'
import { cn } from '@/lib/utils'

const PLATFORM = '#6D28D9'

type Campo = 'zapintel_ativo'
type Modulo = 'zapintel'

/**
 * Toggle dos complementos pagos por empresa (hoje só o ZapIntel — o Nexus
 * Tracker foi removido do produto em 13/08/2026).
 * Persiste em `complementos_empresa` via /api/superadmin/empresas/[id]/addons — não
 * altera o schema do CRM. Quando ativo, o atalho aparece no menu do /admin da empresa.
 */
export function AddonsEmpresa({ empresaId, zapintelInit }: {
  empresaId: number; zapintelInit: boolean
}) {
  const router = useRouter()
  const [zapintel, setZapintel] = useState(zapintelInit)
  const [saving, setSaving] = useState<Campo | null>(null)

  async function salvar(campo: Campo, valor: boolean) {
    setSaving(campo)
    // otimista — reverte no catch se a API recusar
    setZapintel(valor)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}/addons`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok(valor ? 'Complemento ativado' : 'Complemento desativado')
      router.refresh()
    } catch (e) {
      setZapintel(!valor)
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(null)
    }
  }

  const rows: { key: Campo; modulo: Modulo; label: string; desc: string; icon: typeof MessageSquareText; on: boolean; cor: string }[] = [
    { key: 'zapintel_ativo', modulo: 'zapintel', label: 'ZapIntel', desc: 'Inteligência de conversas por IA — área /zapintel', icon: MessageSquareText, on: zapintel, cor: '#7c5cfc' },
  ]

  return (
    <Card title="Complementos pagos">
      <div className="space-y-3">
        {rows.map((r) => {
          const Icon = r.icon
          return (
            <div key={r.key} className="flex items-center gap-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-control text-white" style={{ background: r.cor }}>
                <Icon size={17} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">{r.label}</div>
                <div className="text-[12px] text-ink-3">{r.desc}</div>
              </div>
              {/* Preview: super admin inspeciona esta empresa mesmo com o add-on
                  desligado (não impersona o CRM inteiro). */}
              <a
                href={`/api/zapintel/preview?empresa=${empresaId}`}
                className="flex flex-none items-center gap-1 rounded-control border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 transition-colors hover:border-[#6D28D9] hover:text-[#6D28D9]"
              >
                <ExternalLink size={13} strokeWidth={1.8} /> Prever
              </a>
              <button
                type="button" role="switch" aria-checked={r.on} aria-label={r.label}
                disabled={saving === r.key}
                onClick={() => salvar(r.key, !r.on)}
                className={cn('relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50', r.on ? '' : 'bg-ink/15')}
                style={r.on ? { background: PLATFORM } : undefined}
              >
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', r.on ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">Ferramentas vendidas à parte. Ativas, aparecem no menu do /admin da empresa e ficam acessíveis aos usuários dela.</p>
    </Card>
  )
}
