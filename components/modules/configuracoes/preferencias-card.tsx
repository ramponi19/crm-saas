'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Input, Select, Button, notify } from '@/components/ui'
import type { Json } from '@/types/database'

interface Preferencias {
  meta_vendas_mes: number
  alerta_estoque_min: number
  dias_atrasado_alerta: number
  moeda: string
  fuso_horario: string
}

interface Props {
  config: Preferencias | null
  onSaved: () => void
}

export function PreferenciasCard({ config, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<Preferencias>({
    meta_vendas_mes:      config?.meta_vendas_mes      ?? 30000,
    alerta_estoque_min:   config?.alerta_estoque_min   ?? 3,
    dias_atrasado_alerta: config?.dias_atrasado_alerta ?? 3,
    moeda:                config?.moeda                ?? 'BRL',
    fuso_horario:         config?.fuso_horario         ?? 'America/Sao_Paulo',
  })
  const [loading, setLoading] = useState(false)
  const [empresaId, setEmpresaId] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: vinculo } = await supabase
        .from('empresa_usuarios')
        .select('empresa_id')
        .eq('usuario_id', user.id)
        .eq('ativo', true)
        .single()
      if (vinculo) setEmpresaId(vinculo.empresa_id)
    })()
  }, [supabase])

  const set = (k: keyof Preferencias, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    setLoading(true)
    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert({ chave: 'preferencias', valor: form as unknown as Json, empresa_id: empresaId }, { onConflict: 'empresa_id,chave' })
    setLoading(false)
    if (error) { notify.bad('Erro ao salvar preferências'); return }
    notify.ok('Preferências salvas')
    onSaved()
  }

  return (
    <Card title="Preferências do sistema">
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">Metas, alertas e configurações gerais</p>

      <div className="space-y-4">
        <Input
          label="Meta de vendas mensal (R$)"
          type="number" min="0" step="100"
          value={form.meta_vendas_mes}
          onChange={e => set('meta_vendas_mes', Number(e.target.value))}
          hint="Aparece no dashboard como barra de progresso"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Alerta de estoque mínimo"
            type="number" min="1"
            value={form.alerta_estoque_min}
            onChange={e => set('alerta_estoque_min', Number(e.target.value))}
            hint="unidades disponíveis"
          />
          <Input
            label="Alerta de atraso (dias)"
            type="number" min="1"
            value={form.dias_atrasado_alerta}
            onChange={e => set('dias_atrasado_alerta', Number(e.target.value))}
            hint="dias vencidos para alertar"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Moeda" value={form.moeda} onChange={e => set('moeda', e.target.value)}>
            <option value="BRL">BRL — Real brasileiro</option>
            <option value="USD">USD — Dólar americano</option>
            <option value="EUR">EUR — Euro</option>
          </Select>
          <Select label="Fuso horário" value={form.fuso_horario} onChange={e => set('fuso_horario', e.target.value)}>
            <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
            <option value="America/Manaus">Manaus (GMT-4)</option>
            <option value="America/Belem">Belém (GMT-3)</option>
            <option value="America/Fortaleza">Fortaleza (GMT-3)</option>
            <option value="America/Recife">Recife (GMT-3)</option>
            <option value="America/Noronha">Noronha (GMT-2)</option>
          </Select>
        </div>
      </div>

      <div className="mt-5 flex justify-end border-t border-line-soft pt-4">
        <Button onClick={salvar} loading={loading} icon={<Save size={15} strokeWidth={1.7} />}>
          {loading ? 'Salvando…' : 'Salvar preferências'}
        </Button>
      </div>
    </Card>
  )
}
