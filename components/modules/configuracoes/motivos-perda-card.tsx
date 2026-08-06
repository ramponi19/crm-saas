'use client'

import { useState, useEffect } from 'react'
import { Save, Plus, Trash2, GripVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Button, Input, notify } from '@/components/ui'
import { cn } from '@/lib/utils'

interface Row { id?: number; label: string; ativo: boolean }

export function MotivosPerdaCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [removed, setRemoved] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const id = await empresaAtualId(supabase)
      if (!id) return
      setEmpresaId(id)
      const { data } = await supabase
        .from('motivos_perda').select('id, label, ativo').eq('empresa_id', id).order('ordem')
      setRows(((data ?? []) as { id: number; label: string; ativo: boolean }[]).map(m => ({ id: m.id, label: m.label, ativo: m.ativo })))
    })()
  }, [supabase])

  const setLabel = (i: number, v: string) => setRows(r => r.map((row, j) => j === i ? { ...row, label: v } : row))
  const toggle = (i: number) => setRows(r => r.map((row, j) => j === i ? { ...row, ativo: !row.ativo } : row))
  const add = () => setRows(r => [...r, { label: '', ativo: true }])
  const remove = (i: number) => setRows(r => {
    const row = r[i]
    if (row.id) setRemoved(x => [...x, row.id!])
    return r.filter((_, j) => j !== i)
  })

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    setSaving(true)
    try {
      // Exclusões (leads que apontavam ficam com motivo_perda_id = null via FK).
      if (removed.length) {
        const { error } = await supabase.from('motivos_perda').delete().in('id', removed)
        if (error) throw new Error(error.message)
      }
      // Upserts em ordem (label vazio é ignorado).
      let ordem = 0
      for (const row of rows) {
        const label = row.label.trim()
        if (!label) continue
        if (row.id) {
          const { error } = await supabase.from('motivos_perda').update({ label, ativo: row.ativo, ordem }).eq('id', row.id)
          if (error) throw new Error(error.message)
        } else {
          const { error } = await supabase.from('motivos_perda').insert({ empresa_id: empresaId, label, ativo: row.ativo, ordem })
          if (error) throw new Error(error.message)
        }
        ordem++
      }
      setRemoved([])
      notify.ok('Motivos de perda salvos')
      // Recarrega para pegar novos IDs
      const { data } = await supabase
        .from('motivos_perda').select('id, label, ativo').eq('empresa_id', empresaId).order('ordem')
      setRows(((data ?? []) as { id: number; label: string; ativo: boolean }[]).map(m => ({ id: m.id, label: m.label, ativo: m.ativo })))
    } catch (e) {
      notify.bad('Erro ao salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Motivos de perda"
      actions={
        <Button onClick={salvar} loading={saving} icon={<Save size={15} strokeWidth={1.7} />}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Quando um lead vai para a etapa <strong className="text-ink">Perdido</strong>, o vendedor escolhe um destes motivos
        (obrigatório). Alimentam o relatório de perdas.
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.id ?? `novo-${i}`} className={cn('flex items-center gap-2', !row.ativo && 'opacity-55')}>
            <GripVertical size={15} className="flex-none text-ink-3" />
            <Input wrapperClassName="flex-1" value={row.label} onChange={e => setLabel(i, e.target.value)} placeholder="Ex.: Comprou com concorrente" />
            <Button variant="ghost" size="sm" onClick={() => toggle(i)}>{row.ativo ? 'Ativo' : 'Inativo'}</Button>
            <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => remove(i)}>
              <span className="sr-only">Remover</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={add}>
          Adicionar motivo
        </Button>
      </div>
    </Card>
  )
}
