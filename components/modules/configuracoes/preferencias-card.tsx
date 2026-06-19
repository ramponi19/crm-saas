'use client'

import { useState } from 'react'
import { Save, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

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

  const set = (k: keyof Preferencias, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  async function salvar() {
    setLoading(true)
    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert({ chave: 'preferencias', valor: form }, { onConflict: 'chave' })
    setLoading(false)
    if (error) { toast.error('Erro ao salvar preferências'); return }
    toast.success('Preferências salvas')
    onSaved()
  }

  return (
    <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-[10px] bg-[rgba(245,158,11,0.12)] flex items-center justify-center">
          <SlidersHorizontal size={16} className="text-[#F59E0B]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#F4F6F9]">Preferências do sistema</h3>
          <p className="text-xs text-[#5C6E84]">Metas, alertas e configurações gerais</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-[#5C6E84] mb-1.5">Meta de vendas mensal (R$)</label>
          <input
            type="number" min="0" step="100"
            value={form.meta_vendas_mes}
            onChange={e => set('meta_vendas_mes', Number(e.target.value))}
            className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/20"
          />
          <p className="text-[11px] text-[#3F516A] mt-1">Aparece no dashboard como barra de progresso</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#5C6E84] mb-1.5">Alerta de estoque mínimo</label>
            <input
              type="number" min="1"
              value={form.alerta_estoque_min}
              onChange={e => set('alerta_estoque_min', Number(e.target.value))}
              className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/20"
            />
            <p className="text-[11px] text-[#3F516A] mt-1">unidades disponíveis</p>
          </div>
          <div>
            <label className="block text-xs text-[#5C6E84] mb-1.5">Alerta de atraso (dias)</label>
            <input
              type="number" min="1"
              value={form.dias_atrasado_alerta}
              onChange={e => set('dias_atrasado_alerta', Number(e.target.value))}
              className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/20"
            />
            <p className="text-[11px] text-[#3F516A] mt-1">dias vencidos para alertar</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[#5C6E84] mb-1.5">Moeda</label>
            <select value={form.moeda} onChange={e => set('moeda', e.target.value)}
              className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/20">
              <option value="BRL">BRL — Real brasileiro</option>
              <option value="USD">USD — Dólar americano</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#5C6E84] mb-1.5">Fuso horário</label>
            <select value={form.fuso_horario} onChange={e => set('fuso_horario', e.target.value)}
              className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/20">
              <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
              <option value="America/Manaus">Manaus (GMT-4)</option>
              <option value="America/Belem">Belém (GMT-3)</option>
              <option value="America/Fortaleza">Fortaleza (GMT-3)</option>
              <option value="America/Recife">Recife (GMT-3)</option>
              <option value="America/Noronha">Noronha (GMT-2)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-white/[0.06] flex justify-end">
        <button
          onClick={salvar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {loading ? 'Salvando…' : 'Salvar preferências'}
        </button>
      </div>
    </div>
  )
}
