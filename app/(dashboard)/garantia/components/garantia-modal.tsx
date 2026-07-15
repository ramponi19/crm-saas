'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { useRouter } from 'next/navigation'
import { Modal, Input, Select, Textarea, Button, Badge, notify } from '@/components/ui'
import type { TablesInsert } from '@/types/database'

interface Garantia {
  id?: number
  protocolo: string | null
  tipo: string | null
  status: string | null
  defeito_relatado: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  imei_serial: string | null
  dentro_garantia: boolean | null
  dias_garantia_restantes: number | null
  data_entrada: string | null
  observacoes: string | null
  estado_entrada: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes?: { nome: string; telefone: string | null } | null
  produtos?: { nome: string } | null
  created_at?: string | null
}

interface Props {
  garantia: Garantia | null
  isNew: boolean
  onClose: () => void
}

const EMPTY: Garantia = {
  protocolo: null, tipo: 'garantia', status: 'em_analise',
  defeito_relatado: null, parecer_tecnico: null, orcamento_valor: null,
  imei_serial: null, dentro_garantia: true, dias_garantia_restantes: null,
  data_entrada: new Date().toISOString().split('T')[0], observacoes: null,
  estado_entrada: null, celular_reserva_fornecido: false, modelo_reserva: null,
  cliente_id: null, produto_id: null,
}

const STATUS_OPTIONS = [
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aprovado',   label: 'Aprovado' },
  { value: 'em_reparo',  label: 'Em reparo' },
  { value: 'concluido',  label: 'Concluído' },
  { value: 'entregue',   label: 'Entregue' },
  { value: 'recusado',   label: 'Recusado' },
]

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'
const STATUS_TONE: Record<string, Tone> = {
  em_analise: 'warn', aprovado: 'acc', em_reparo: 'acc',
  concluido: 'ok', entregue: 'neutro', recusado: 'bad',
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-raised p-3 text-center">
      <div className="num text-[15px] font-bold leading-tight text-ink">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-ink-3">{label}</div>
    </div>
  )
}

const supabase = createClient()

export default function GarantiaModal({ garantia, isNew, onClose }: Props) {
  const router = useRouter()
  const { empresa } = useEmpresa()
  const empresaId = empresa?.id
  const [form, setForm] = useState<Garantia>(isNew ? EMPTY : { ...EMPTY, ...garantia })
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([])
  const [produtos, setProdutos] = useState<{ id: number; nome: string }[]>([])

  useEffect(() => {
    if (!empresaId) return
    supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome').then(({ data }) => setClientes(data ?? []))
    supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome').then(({ data }) => setProdutos(data ?? []))
  }, [empresaId])

  function set(field: keyof Garantia, value: string | boolean | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function salvar() {
    setSaving(true)
    const { clientes: _c, produtos: _p, id: _id, ...payload } = form
    const data = {
      ...payload,
      tipo: 'garantia',
      empresa_id: empresaId,
      protocolo: payload.protocolo || `GAR-${Date.now().toString().slice(-6)}`,
    } as TablesInsert<'garantias_assistencias'>

    if (isNew) {
      const { error } = await supabase.from('garantias_assistencias').insert(data)
      if (error) { notify.bad('Erro ao criar protocolo'); setSaving(false); return }
      notify.ok('Protocolo criado!')
    } else {
      const { error } = await supabase.from('garantias_assistencias').update(data).eq('id', garantia!.id!)
      if (error) { notify.bad('Erro ao salvar'); setSaving(false); return }
      notify.ok('Salvo!')
    }
    router.refresh()
    onClose()
  }

  const statusLabel = STATUS_OPTIONS.find(s => s.value === form.status)?.label ?? form.status ?? '—'
  const statusTone = STATUS_TONE[form.status ?? ''] ?? 'neutro'

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      disableOverlayClose={saving}
      title={
        <span className="flex items-center gap-2.5">
          <span className="truncate">{isNew ? 'Novo protocolo' : (form.protocolo ?? `Protocolo #${garantia?.id}`)}</span>
          {!isNew && <Badge tone={statusTone}>{statusLabel}</Badge>}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button onClick={salvar} loading={saving}>Salvar</Button>
        </>
      }
    >
      {!isNew && garantia?.clientes?.nome && (
        <p className="mb-4 text-[12px] text-ink-3">{garantia.clientes.nome}</p>
      )}

      {!isNew && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat label="Entrada" value={new Date(garantia?.data_entrada ?? garantia?.created_at ?? '').toLocaleDateString('pt-BR')} />
          <Stat label="Prazo" value={garantia?.dias_garantia_restantes != null ? `${garantia.dias_garantia_restantes}d` : '—'} />
          <Stat label="Orçamento" value={garantia?.orcamento_valor ? `R$ ${Number(garantia.orcamento_valor).toLocaleString('pt-BR')}` : '—'} />
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Protocolo" value={form.protocolo ?? ''} onChange={e => set('protocolo', e.target.value)} placeholder="GAR-000001" />
        <Select label="Status" value={form.status ?? 'em_analise'} onChange={e => set('status', e.target.value)}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>

        <Select label="Cliente" value={form.cliente_id ?? ''} onChange={e => set('cliente_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Selecionar...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select label="Produto" value={form.produto_id ?? ''} onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Selecionar...</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Select>

        <Input label="IMEI / Nº de série" value={form.imei_serial ?? ''} onChange={e => set('imei_serial', e.target.value)} placeholder="358000000000000" />
        <Input label="Data de entrada" type="date" value={form.data_entrada ?? ''} onChange={e => set('data_entrada', e.target.value)} />

        <Input label="Dias de garantia restantes" type="number" value={form.dias_garantia_restantes ?? ''} onChange={e => set('dias_garantia_restantes', e.target.value ? Number(e.target.value) : null)} placeholder="365" />
        <Input label="Orçamento (R$)" type="number" value={form.orcamento_valor ?? ''} onChange={e => set('orcamento_valor', e.target.value ? Number(e.target.value) : null)} placeholder="0,00" />

        <Input wrapperClassName="col-span-2" label="Estado de entrada" value={form.estado_entrada ?? ''} onChange={e => set('estado_entrada', e.target.value)} placeholder="Ex: Tela trincada, sem carregador..." />

        <Textarea wrapperClassName="col-span-2" label="Defeito relatado pelo cliente" rows={2} value={form.defeito_relatado ?? ''} onChange={e => set('defeito_relatado', e.target.value)} placeholder="Descreva o problema..." />

        <Textarea wrapperClassName="col-span-2" label="Parecer técnico" rows={2} value={form.parecer_tecnico ?? ''} onChange={e => set('parecer_tecnico', e.target.value)} placeholder="Diagnóstico técnico..." />

        <Select label="Celular reserva" value={form.celular_reserva_fornecido ? 'sim' : 'nao'} onChange={e => set('celular_reserva_fornecido', e.target.value === 'sim')}>
          <option value="nao">Não fornecido</option>
          <option value="sim">Fornecido</option>
        </Select>
        <Input label="Modelo reserva" value={form.modelo_reserva ?? ''} onChange={e => set('modelo_reserva', e.target.value)} placeholder="Ex: iPhone 11" />

        <Textarea wrapperClassName="col-span-2" label="Observações" rows={2} value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} placeholder="Observações adicionais..." />
      </form>
    </Modal>
  )
}
