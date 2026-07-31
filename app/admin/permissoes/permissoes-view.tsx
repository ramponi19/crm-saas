'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Card, Button, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { PAPEIS_EDITAVEIS, PERM_LABELS, PERM_DEFAULT, type PermissoesMap, type PermissoesPapel, type Papel } from '@/lib/permissoes'

const PAPEL_LABEL: Record<string, string> = { admin: 'Administrador', vendedor: 'Vendedor', tecnico: 'Técnico' }

export function PermissoesView({ initial }: { initial: PermissoesMap | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [matriz, setMatriz] = useState<Record<Papel, PermissoesPapel>>(() => {
    const m = {} as Record<Papel, PermissoesPapel>
    for (const p of PAPEIS_EDITAVEIS) m[p] = { ...PERM_DEFAULT[p], ...((initial?.[p] ?? {}) as Partial<PermissoesPapel>) }
    return m
  })

  const setPerm = (papel: Papel, key: keyof PermissoesPapel, value: boolean | number) =>
    setMatriz((m) => ({ ...m, [papel]: { ...m[papel], [key]: value } }))

  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissoes: matriz }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Permissões salvas')
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[760px] space-y-4">
        <p className="text-[13px] text-ink-2">
          Defina o que cada papel pode fazer. O <b className="text-ink">Proprietário</b> tem acesso total (não editável).
        </p>

        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-3 text-left font-medium text-ink-3">Permissão</th>
                  {PAPEIS_EDITAVEIS.map((p) => (
                    <th key={p} className="px-3 py-3 text-center font-semibold text-ink">{PAPEL_LABEL[p]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERM_LABELS.map((perm) => (
                  <tr key={perm.key} className="border-b border-line-soft">
                    <td className="px-4 py-2.5 text-ink-2">{perm.label}</td>
                    {PAPEIS_EDITAVEIS.map((papel) => {
                      const on = matriz[papel][perm.key] as boolean
                      return (
                        <td key={papel} className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => setPerm(papel, perm.key, !on)}
                            aria-pressed={on}
                            className={cn('mx-auto grid h-6 w-6 place-items-center rounded-[6px] border transition-colors',
                              on ? 'border-ok bg-ok text-white' : 'border-line hover:bg-ink/[0.04]')}
                          >
                            {on && <Check size={14} strokeWidth={2.4} />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2.5 text-ink-2">Desconto máx. no PDV (%)</td>
                  {PAPEIS_EDITAVEIS.map((papel) => (
                    <td key={papel} className="px-3 py-2.5 text-center">
                      <input
                        value={String(matriz[papel].descontoMax)}
                        onChange={(e) => setPerm(papel, 'descontoMax', Math.max(0, Math.min(100, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)))}
                        className="num w-16 rounded-control border border-line bg-card px-2 py-1 text-center text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Button onClick={salvar} loading={saving}>Salvar permissões</Button>
      </div>
    </main>
  )
}
