'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Input, Button, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

interface Horario {
  inicio: string
  fim: string
  dias: number[]
  sla_resposta_min: number
}

const DIAS = [
  { n: 1, label: 'Seg' }, { n: 2, label: 'Ter' }, { n: 3, label: 'Qua' },
  { n: 4, label: 'Qui' }, { n: 5, label: 'Sex' }, { n: 6, label: 'Sáb' }, { n: 0, label: 'Dom' },
]

const PADRAO: Horario = { inicio: '09:00', fim: '18:00', dias: [1, 2, 3, 4, 5], sla_resposta_min: 15 }

export function HorarioCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [form, setForm] = useState<Horario>(PADRAO)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const id = await empresaAtualId(supabase)
      if (!id) return
      setEmpresaId(id)
      const { data } = await supabase
        .from('configuracoes_sistema').select('valor').eq('empresa_id', id).eq('chave', 'horario_comercial').maybeSingle()
      if (data?.valor && typeof data.valor === 'object') {
        const v = data.valor as Partial<Horario>
        setForm({
          inicio: v.inicio ?? PADRAO.inicio,
          fim: v.fim ?? PADRAO.fim,
          dias: Array.isArray(v.dias) ? v.dias : PADRAO.dias,
          sla_resposta_min: v.sla_resposta_min ?? PADRAO.sla_resposta_min,
        })
      }
    })()
  }, [supabase])

  function toggleDia(n: number) {
    setForm(f => ({ ...f, dias: f.dias.includes(n) ? f.dias.filter(d => d !== n) : [...f.dias, n].sort() }))
  }

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    setLoading(true)
    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert({ chave: 'horario_comercial', valor: form as unknown as Json, empresa_id: empresaId }, { onConflict: 'empresa_id,chave' })
    setLoading(false)
    if (error) { notify.bad('Erro ao salvar horário'); return }
    notify.ok('Horário de funcionamento salvo')
  }

  return (
    <Card
      title="Horário de funcionamento"
      actions={
        <Button onClick={salvar} loading={loading} icon={<Save size={15} strokeWidth={1.7} />}>
          {loading ? 'Salvando…' : 'Salvar horário'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        As automações e a régua de follow-up usam este horário para <strong className="text-ink">não disparar de madrugada</strong>.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Abre às" type="time" value={form.inicio} onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} />
        <Input label="Fecha às" type="time" value={form.fim} onChange={e => setForm(f => ({ ...f, fim: e.target.value }))} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[12px] font-medium text-ink-2">Dias de funcionamento</div>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map(d => {
            const on = form.dias.includes(d.n)
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDia(d.n)}
                className={cn(
                  'rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                  on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-2 hover:text-ink',
                )}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 max-w-[220px]">
        <Input
          label="SLA de 1ª resposta (min)"
          type="number"
          min={1}
          value={form.sla_resposta_min}
          onChange={e => setForm(f => ({ ...f, sla_resposta_min: Number(e.target.value) }))}
          hint="Meta de tempo para o primeiro retorno ao lead"
        />
      </div>
    </Card>
  )
}
