'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Save, AlertTriangle } from 'lucide-react'
import { Card, Button, Input, Select, Badge, notify } from '@/components/ui'

interface Config { ativo: boolean; limite_por_min: number; modelo: string; system_extra: string }
interface Uso {
  total: number; tokensIn: number; tokensOut: number; empresasAtivas: number
  porEmpresa: { empresa_id: number; nome: string; perguntas: number; tokensIn: number; tokensOut: number }[]
  serie: { dia: string; perguntas: number }[]
}
interface Props { config: Config; empresas: { id: number; nome: string }[]; keyConfigurada: boolean }

const nf = (n: number) => n.toLocaleString('pt-BR')

export function AssistenteAdminView({ config, empresas, keyConfigurada }: Props) {
  const [form, setForm] = useState<Config>(config)
  const [salvando, setSalvando] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [dias, setDias] = useState('30')
  const [uso, setUso] = useState<Uso | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ dias, ...(empresa ? { empresa } : {}) })
    const r = await fetch(`/api/superadmin/assistente?${qs}`)
    const j = await r.json().catch(() => null)
    setUso(r.ok ? j : null)
    setLoading(false)
  }, [dias, empresa])

  useEffect(() => { carregar() }, [carregar])

  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/superadmin/assistente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Erro ao salvar', j.error); return }
    notify.ok('Configuração salva')
  }

  const maxDia = Math.max(...(uso?.serie.map((s) => s.perguntas) ?? [1]), 1)

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-card bg-accent-soft text-accent"><Sparkles size={20} strokeWidth={1.8} /></span>
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">Assistente Nexus</h1>
          <p className="text-[13px] text-ink-3">Configuração e uso do assistente de IA (Gemini) por empresa.</p>
        </div>
      </div>

      {!keyConfigurada && (
        <div className="flex items-center gap-2.5 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink-2">
          <AlertTriangle size={17} className="flex-none text-warn" strokeWidth={1.8} />
          <span><strong className="text-ink">GEMINI_API_KEY não configurada</strong> no ambiente — o assistente responde com aviso de indisponível até a chave ser definida no Vercel.</span>
        </div>
      )}

      {/* Config */}
      <Card title="Configuração">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 text-[13px] text-ink-2">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} className="size-4 accent-accent" />
            Assistente ativo (desligado = responde “temporariamente desativado”)
          </label>
          <Input label="Limite de perguntas por minuto (por empresa)" type="number" min={1} value={String(form.limite_por_min)}
            onChange={(e) => setForm((f) => ({ ...f, limite_por_min: Number(e.target.value) || 0 }))} />
          <Input label="Modelo Gemini" value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))} placeholder="gemini-2.5-flash" />
          <Input label="Instrução extra ao assistente (opcional)" value={form.system_extra} onChange={(e) => setForm((f) => ({ ...f, system_extra: e.target.value }))} placeholder="Ex.: tom mais formal, citar o nome da loja…" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={<Save size={15} strokeWidth={1.7} />} loading={salvando} onClick={salvar}>Salvar configuração</Button>
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Empresa" wrapperClassName="w-[240px]" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
          <option value="">Todas as empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </Select>
        <Select label="Período" wrapperClassName="w-[160px]" value={dias} onChange={(e) => setDias(e.target.value)}>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </Select>
      </div>

      {/* Cards de uso */}
      <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
        {[
          { l: 'Perguntas', v: nf(uso?.total ?? 0) },
          { l: 'Tokens de entrada', v: nf(uso?.tokensIn ?? 0) },
          { l: 'Tokens de saída', v: nf(uso?.tokensOut ?? 0) },
          { l: 'Empresas ativas', v: nf(uso?.empresasAtivas ?? 0) },
        ].map((c) => (
          <div key={c.l} className="p-4">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3">{c.l}</div>
            <div className="num mt-1 text-[22px] font-bold text-ink">{loading ? '—' : c.v}</div>
          </div>
        ))}
      </div>

      {/* Série diária (mini) */}
      {uso && uso.serie.length > 0 && (
        <Card title="Perguntas por dia">
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {uso.serie.map((s) => (
              <div key={s.dia} className="flex-1 rounded-t bg-accent/70" style={{ height: `${(s.perguntas / maxDia) * 100}%` }} title={`${s.dia}: ${s.perguntas}`} />
            ))}
          </div>
        </Card>
      )}

      {/* Tabela por empresa */}
      <Card title="Uso por empresa" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-[11px] uppercase tracking-[0.05em] text-ink-3">
                <th className="px-4 py-2.5 text-left font-medium">Empresa</th>
                <th className="px-4 py-2.5 text-right font-medium">Perguntas</th>
                <th className="px-4 py-2.5 text-right font-medium">Tokens entrada</th>
                <th className="px-4 py-2.5 text-right font-medium">Tokens saída</th>
              </tr>
            </thead>
            <tbody>
              {(uso?.porEmpresa ?? []).map((e) => (
                <tr key={e.empresa_id} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{e.nome}</td>
                  <td className="num px-4 py-2.5 text-right text-ink-2">{nf(e.perguntas)}</td>
                  <td className="num px-4 py-2.5 text-right text-ink-3">{nf(e.tokensIn)}</td>
                  <td className="num px-4 py-2.5 text-right text-ink-3">{nf(e.tokensOut)}</td>
                </tr>
              ))}
              {!loading && (uso?.porEmpresa.length ?? 0) === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[13px] text-ink-3">Nenhum uso no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11.5px] text-ink-3">
        <Badge tone="neutro">Nível grátis</Badge> As cotas reais (RPM/TPM/RPD) ficam no Google AI Studio. Este painel mede o uso pelo próprio CRM. Tokens só aparecem quando o provedor retorna o consumo.
      </p>
    </div>
  )
}
