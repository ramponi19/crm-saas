'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, Package, ArrowDownLeft, History, LayoutDashboard, List, RefreshCw } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import UnidadeModal from './unidade-modal'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import {
  Card, StatCard, Table, Tabs, Badge, Button, Input, Select, Textarea, EmptyState, notify,
  type Column,
} from '@/components/ui'
import type { TablesInsert } from '@/types/database'
import type { Segmento } from '@/lib/segmentos'

export interface Unidade {
  id: number
  produto_id: number
  produto_nome: string
  marca_nome: string
  fornecedor_nome: string | null
  imei: string | null
  numero_serie: string | null
  bateria: string | null
  condicao: string | null
  cor: string | null
  armazenamento: string | null
  preco_custo: number | null
  preco_venda: number | null
  status: string | null
  tipo: string | null
  estado: string | null
  imei2: string | null
  fornecedor_id: number | null
  custo_reparo: number | null
  observacoes: string | null
  created_at: string | null
  // Veículos (segmento concessionaria)
  placa: string | null
  chassi: string | null
  renavam: string | null
  km: number | null
  ano: number | null
}

export interface Movimentacao {
  id: number
  produto_nome: string
  tipo_movimento: string
  quantidade: number
  observacoes: string | null
  created_at: string
  usuario_nome: string | null
}

interface Props {
  itens: Unidade[]
  movimentacoes: Movimentacao[]
  marcas: { id: number; nome: string }[]
  categorias: { id: number; nome: string }[]
  produtos: { id: number; nome: string; marca_id: number | null; categoria_id: number | null; marca_nome: string; categoria_nome: string | null; ativo: boolean }[]
  clientes: { id: number; nome: string }[]
  tabelaPrecos: TabelaPrecoRef[]
  empresaId: number
  segmento: Segmento
}

export type TabelaPrecoRef = { modelo: string; armazenamento: string | null; condicao: string; preco_sugerido: number }

type Preset = { condicao: string; tipo: string; seminovo: boolean } | null

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

const STATUS_BADGE: Record<string, { label: string; tone: Tone; dot?: boolean }> = {
  disponivel:  { label: 'Disponível', tone: 'ok', dot: true },
  reservado:   { label: 'Reservado',  tone: 'warn' },
  vendido:     { label: 'Vendido',    tone: 'neutro' },
  assistencia: { label: 'Em reparo',  tone: 'acc' },
}

const CONDICAO_BADGE: Record<string, { label: string; tone: Tone }> = {
  novo:     { label: 'Novo',        tone: 'acc' },
  seminovo: { label: 'Seminovo',    tone: 'warn' },
  usado:    { label: 'Usado',       tone: 'neutro' },
  defeito:  { label: 'Com defeito', tone: 'bad' },
}

const TIPO_BADGE: Record<string, { label: string; tone: Tone }> = {
  entrada: { label: 'Entrada', tone: 'ok' },
  saida:   { label: 'Saída',   tone: 'bad' },
  ajuste:  { label: 'Ajuste',  tone: 'warn' },
  compra:  { label: 'Entrada', tone: 'ok' },
  venda:   { label: 'Saída',   tone: 'bad' },
}

const STATUS_FILTER = [
  { value: 'todos', label: 'Todos' },
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'assistencia', label: 'Em reparo' },
  { value: 'vendido', label: 'Vendido' },
]

const fmt = (v: number) => formatCurrency(v)
const fmtDate = (s: string) => {
  const d = new Date(s)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

type Tab = 'dashboard' | 'lista' | 'entrada' | 'historico'

const TABS: { value: Tab; label: React.ReactNode }[] = [
  { value: 'dashboard', label: <span className="flex items-center gap-2"><LayoutDashboard size={14} strokeWidth={1.7} />Dashboard</span> },
  { value: 'lista',     label: <span className="flex items-center gap-2"><List size={14} strokeWidth={1.7} />Lista</span> },
  { value: 'entrada',   label: <span className="flex items-center gap-2"><ArrowDownLeft size={14} strokeWidth={1.7} />Entrada</span> },
  { value: 'historico', label: <span className="flex items-center gap-2"><History size={14} strokeWidth={1.7} />Histórico</span> },
]

export default function EstoqueView({ itens: itensInit, movimentacoes, marcas: _marcas, categorias: _categorias, produtos, clientes, tabelaPrecos, empresaId, segmento }: Props) {
  const isVeiculo = segmento === 'concessionaria'
  const [tab, setTab] = useState<Tab>('lista')
  const [itens, setItens] = useState<Unidade[]>(itensInit)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroMarca, setFiltroMarca] = useState('todas')
  const [unidadeSel, setUnidadeSel] = useState<Unidade | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [preset, setPreset] = useState<Preset>(null)

  function abrirEntrada(p: Preset) { setPreset(p); setTab('entrada') }

  // Stats
  const stats = useMemo(() => {
    const disponiveis = itens.filter(i => i.status === 'disponivel').length
    const reservados = itens.filter(i => i.status === 'reservado').length
    const reparo = itens.filter(i => i.status === 'assistencia').length
    const vendidos = itens.filter(i => i.status === 'vendido').length
    const total = itens.length
    const valorEstoque = itens.filter(i => i.status === 'disponivel').reduce((acc, i) => acc + (i.preco_venda ?? 0), 0)
    return { total, disponiveis, reservados, reparo, vendidos, valorEstoque }
  }, [itens])

  const marcasUnicas = useMemo(() => [...new Set(itens.map(i => i.marca_nome))].filter(Boolean), [itens])

  const filtrados = useMemo(() => itens.filter(i => {
    const s = search.toLowerCase()
    const matchSearch = !search ||
      i.produto_nome.toLowerCase().includes(s) ||
      i.marca_nome.toLowerCase().includes(s) ||
      (i.imei ?? '').includes(search) ||
      (i.numero_serie ?? '').includes(search) ||
      (i.placa ?? '').toLowerCase().includes(s) ||
      (i.chassi ?? '').toLowerCase().includes(s)
    const matchStatus = filtroStatus === 'todos' || i.status === filtroStatus
    const matchMarca = filtroMarca === 'todas' || i.marca_nome === filtroMarca
    return matchSearch && matchStatus && matchMarca
  }), [itens, search, filtroStatus, filtroMarca])

  const idCol: Column<Unidade> = isVeiculo
    ? {
        key: 'placa', header: 'Placa', hideOnMobile: true, className: 'num',
        render: (u) => <span className="text-ink-2">{u.placa ? u.placa.toUpperCase() : (u.chassi ? `chassi ${u.chassi.slice(-6)}` : '—')}</span>,
      }
    : {
        key: 'imei', header: 'IMEI', hideOnMobile: true, className: 'num',
        render: (u) => {
          const imeiMask = u.imei ? u.imei.slice(0, 3) + ' ' + u.imei.slice(3, 5) + '•••• ' + u.imei.slice(-4) : u.numero_serie ?? '—'
          return <span className="text-ink-2">{imeiMask}</span>
        },
      }

  const detalheCol: Column<Unidade> = isVeiculo
    ? {
        key: 'anokm', header: 'Ano · Km', align: 'right', hideOnMobile: true, className: 'num',
        render: (u) => <span className="text-ink-2">{[u.ano ? String(u.ano) : null, u.km != null ? `${u.km.toLocaleString('pt-BR')} km` : null].filter(Boolean).join(' · ') || '—'}</span>,
      }
    : {
        key: 'bateria', header: 'Bateria', align: 'right', hideOnMobile: true, className: 'num',
        render: (u) => u.bateria
          ? <span className={cn('font-semibold', Number(u.bateria) >= 90 ? 'text-ok' : Number(u.bateria) >= 80 ? 'text-warn' : 'text-bad')}>{u.bateria}%</span>
          : <span className="text-ink-3">—</span>,
      }

  const varianteCol: Column<Unidade> = {
    key: 'variante', header: isVeiculo ? 'Cor' : 'Variante', hideOnMobile: true,
    render: (u) => <span className="text-ink-2">{(isVeiculo ? [u.cor] : [u.cor, u.armazenamento]).filter(Boolean).join(' · ') || '—'}</span>,
  }

  const listaCols: Column<Unidade>[] = [
    {
      key: 'produto', header: isVeiculo ? 'Veículo' : 'Produto',
      render: (u) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{u.produto_nome}</div>
          <div className="text-[11.5px] text-ink-3">{u.marca_nome}</div>
        </div>
      ),
    },
    idCol,
    {
      key: 'condicao', header: 'Condição', hideOnMobile: true,
      render: (u) => { const c = CONDICAO_BADGE[u.condicao ?? 'novo'] ?? CONDICAO_BADGE.novo; return <Badge tone={c.tone}>{c.label}</Badge> },
    },
    detalheCol,
    varianteCol,
    {
      key: 'custo', header: 'Custo', align: 'right', hideOnMobile: true, className: 'num',
      render: (u) => <span className="text-ink-2">{u.preco_custo ? fmt(u.preco_custo) : '—'}</span>,
    },
    {
      key: 'venda', header: 'Venda', align: 'right', className: 'num',
      render: (u) => u.preco_venda ? <span className="font-semibold text-ink">{fmt(u.preco_venda)}</span> : <span className="text-ink-3">—</span>,
    },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (u) => { const s = STATUS_BADGE[u.status ?? 'disponivel'] ?? STATUS_BADGE.disponivel; return <Badge tone={s.tone} dot={s.dot}>{s.label}</Badge> },
    },
  ]

  const histCols: Column<Movimentacao>[] = [
    { key: 'data', header: 'Data', className: 'num w-[130px]', render: (m) => <span className="text-ink-2">{fmtDate(m.created_at)}</span> },
    {
      key: 'movimento', header: 'Movimento',
      render: (m) => { const t = TIPO_BADGE[m.tipo_movimento] ?? { label: m.tipo_movimento, tone: 'neutro' as Tone }; return <Badge tone={t.tone}>{t.label}</Badge> },
    },
    { key: 'produto', header: 'Produto', render: (m) => <span className="font-semibold text-ink">{m.produto_nome}</span> },
    {
      key: 'qtd', header: 'Qtd', align: 'right', className: 'num',
      render: (m) => <span className={cn('font-semibold', m.quantidade > 0 ? 'text-ok' : 'text-bad')}>{m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}</span>,
    },
    { key: 'responsavel', header: 'Responsável', hideOnMobile: true, render: (m) => <span className="text-ink-2">{m.usuario_nome ?? '—'}</span> },
    { key: 'obs', header: 'Observação', hideOnMobile: true, render: (m) => <span className="block max-w-[220px] truncate text-ink-3">{m.observacoes ?? '—'}</span> },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Estoque" />

      <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1240px] space-y-4">

          <Tabs items={TABS} value={tab} onValueChange={(v) => setTab(v as Tab)} />

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
                <StatCard bare label="Unidades ativas" value={stats.total} />
                <StatCard bare label="Disponíveis" value={stats.disponiveis} deltaTone="ok" />
                <StatCard bare label="Reservadas" value={stats.reservados} />
                <StatCard bare label="Em reparo" value={stats.reparo} />
              </div>

              <Card title="Distribuição por status">
                <div className="space-y-4">
                  {[
                    { label: 'Disponíveis', count: stats.disponiveis, bar: 'bg-ok' },
                    { label: 'Reservadas', count: stats.reservados, bar: 'bg-warn' },
                    { label: 'Em reparo', count: stats.reparo, bar: 'bg-accent' },
                    { label: 'Vendidas (total)', count: stats.vendidos, bar: 'bg-ink-3' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-4">
                      <div className="w-32 text-[13px] text-ink-2">{r.label}</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div className={cn('h-full rounded-full transition-all duration-700', r.bar)}
                          style={{ width: stats.total ? `${(r.count / stats.total) * 100}%` : '0%' }} />
                      </div>
                      <div className="num w-8 text-right text-[13px] font-semibold text-ink">{r.count}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── LISTA ── */}
          {tab === 'lista' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  wrapperClassName="min-w-[240px] flex-1"
                  icon={<Search size={15} strokeWidth={1.7} />}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={isVeiculo ? 'Buscar por modelo, marca, placa ou chassi…' : 'Buscar por produto, marca, IMEI ou número de série…'}
                />
                {marcasUnicas.length > 0 && (
                  <Select wrapperClassName="w-[190px]" value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
                    <option value="todas">Todas as marcas</option>
                    {marcasUnicas.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                )}
                <Button icon={<ArrowDownLeft size={15} strokeWidth={1.7} />} onClick={() => { setUnidadeSel(null); setModalOpen(true) }}>
                  {isVeiculo ? 'Adicionar veículo' : 'Entrada de estoque'}
                </Button>
                {!isVeiculo && (
                  <Button variant="outline" icon={<RefreshCw size={15} strokeWidth={1.7} />} onClick={() => abrirEntrada({ condicao: 'usado', tipo: 'compra', seminovo: true })}>
                    Entrada de semi-novo
                  </Button>
                )}
              </div>

              <Tabs items={STATUS_FILTER} value={filtroStatus} onValueChange={setFiltroStatus} className="border-b-0" />

              <Card flush>
                <Table
                  columns={listaCols}
                  rows={filtrados}
                  rowKey={(u) => u.id}
                  onRowClick={(u) => { setUnidadeSel(u); setModalOpen(true) }}
                  empty={<EmptyState icon={<Package size={22} strokeWidth={1.7} />} title="Nenhuma unidade encontrada" description={search ? 'Tente outro termo de busca.' : 'Registre a primeira entrada de estoque.'} />}
                />
              </Card>
            </div>
          )}

          {/* ── ENTRADA ── */}
          {tab === 'entrada' && (
            <div className="mx-auto max-w-[720px]">
              <Card>
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-control bg-ink text-white">
                    {preset?.seminovo ? <RefreshCw size={18} strokeWidth={1.7} /> : <ArrowDownLeft size={18} strokeWidth={1.7} />}
                  </span>
                  <div>
                    <div className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{preset?.seminovo ? 'Entrada de semi-novo' : isVeiculo ? 'Novo veículo no estoque' : 'Nova entrada de unidade'}</div>
                    <div className="text-[12px] text-ink-2">{preset?.seminovo ? 'Compra de aparelho usado do cliente — entra disponível para revenda' : isVeiculo ? 'Cadastre um veículo no estoque por placa / chassi' : 'Cadastre uma unidade física no estoque por IMEI / número de série'}</div>
                  </div>
                </div>
                <UnidadeInlineForm
                  produtos={produtos}
                  clientes={clientes}
                  tabelaPrecos={tabelaPrecos}
                  empresaId={empresaId}
                  isVeiculo={isVeiculo}
                  preset={preset}
                  onSaved={(u) => {
                    setItens(prev => [u, ...prev])
                    setPreset(null)
                    setTab('lista')
                    notify.ok(preset?.seminovo ? 'Semi-novo adicionado ao estoque' : 'Unidade adicionada ao estoque')
                  }}
                />
              </Card>
            </div>
          )}

          {/* ── HISTÓRICO ── */}
          {tab === 'historico' && (
            <Card flush>
              <Table
                columns={histCols}
                rows={movimentacoes}
                rowKey={(m) => m.id}
                empty={<EmptyState icon={<History size={22} strokeWidth={1.7} />} title="Nenhuma movimentação registrada" description="As entradas e saídas de estoque aparecerão aqui." />}
              />
            </Card>
          )}
        </div>
      </main>

      {modalOpen && (
        <UnidadeModal
          unidade={unidadeSel}
          empresaId={empresaId}
          isVeiculo={isVeiculo}
          onClose={() => { setModalOpen(false); setUnidadeSel(null) }}
        />
      )}
    </div>
  )
}

// ── Formulário inline de entrada ──
function UnidadeInlineForm({ produtos, clientes, tabelaPrecos, empresaId, isVeiculo, preset, onSaved }: {
  produtos: { id: number; nome: string; marca_id: number | null; categoria_id: number | null; marca_nome: string; categoria_nome: string | null; ativo: boolean }[]
  clientes: { id: number; nome: string }[]
  tabelaPrecos: TabelaPrecoRef[]
  empresaId: number
  isVeiculo: boolean
  preset: Preset
  onSaved: (u: Unidade) => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    produto_id: '', tipo: preset?.tipo ?? 'compra', condicao: preset?.condicao ?? (isVeiculo ? 'usado' : 'novo'), estado: isVeiculo ? 'bom' : (preset?.seminovo ? 'bom' : 'lacrado'),
    status: 'disponivel', cor: '', armazenamento: '', imei: '', bateria: '',
    placa: '', chassi: '', renavam: '', km: '', ano: '',
    preco_custo: '', custo_reparo: '', preco_venda: '', observacoes: '', origem: 'fornecedor', cliente_id: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const custoTotal = (Number(form.preco_custo) || 0) + (Number(form.custo_reparo) || 0)
  const margem = form.preco_venda && form.preco_custo
    ? (((Number(form.preco_venda) - custoTotal) / Number(form.preco_venda)) * 100).toFixed(1) : null

  // Sugestão de preço de venda a partir da Tabela de preços (modelo + condição + capacidade).
  const produtoNomeSel = produtos.find(p => p.id === Number(form.produto_id))?.nome ?? ''
  const sugestaoPreco = useMemo(() => {
    if (isVeiculo || !produtoNomeSel || tabelaPrecos.length === 0) return null
    const norm = (s: string) => s.toLowerCase().trim()
    const pn = norm(produtoNomeSel)
    const cands = tabelaPrecos.filter(t => { const m = norm(t.modelo); return m === pn || m.includes(pn) || pn.includes(m) })
    if (!cands.length) return null
    const byCond = cands.filter(t => t.condicao === form.condicao)
    const pool = byCond.length ? byCond : cands
    const arm = norm(form.armazenamento)
    const exact = arm ? pool.find(t => norm(t.armazenamento ?? '') === arm) : null
    return (exact ?? pool[0]).preco_sugerido
  }, [isVeiculo, produtoNomeSel, form.condicao, form.armazenamento, tabelaPrecos])

  // Auto-preenche quando há sugestão e o vendedor ainda não digitou o preço.
  useEffect(() => {
    if (sugestaoPreco != null && !form.preco_venda) setForm(f => ({ ...f, preco_venda: String(sugestaoPreco) }))
  }, [sugestaoPreco]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    if (!form.produto_id) { notify.warn('Selecione um produto'); return }
    if (!form.preco_custo) { notify.warn('Informe o preço de custo'); return }
    if (!form.preco_venda) { notify.warn('Informe o preço de venda'); return }
    setSaving(true)
    const payload = {
      empresa_id: empresaId,
      produto_id: Number(form.produto_id),
      tipo: form.tipo, condicao: form.condicao, estado: form.estado,
      status: form.status,
      cor: form.cor || null,
      armazenamento: isVeiculo ? null : (form.armazenamento || null),
      imei: isVeiculo ? null : (form.imei || null),
      bateria: isVeiculo ? null : (form.bateria || null),
      placa: isVeiculo ? (form.placa || null) : null,
      chassi: isVeiculo ? (form.chassi || null) : null,
      renavam: isVeiculo ? (form.renavam || null) : null,
      km: isVeiculo && form.km ? Number(form.km) : null,
      ano: isVeiculo && form.ano ? Number(form.ano) : null,
      preco_custo: Number(form.preco_custo), preco_venda: Number(form.preco_venda),
      custo_reparo: Number(form.custo_reparo) || null,
      cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      observacoes: form.observacoes || null, ativo: true,
    }
    const { data, error } = await supabase.from('inventario_unidades').insert(payload as TablesInsert<'inventario_unidades'>).select().single()
    setSaving(false)
    if (error) { notify.bad('Erro ao cadastrar', error.message); return }
    const prod = produtos.find(p => p.id === Number(form.produto_id))
    onSaved({ ...data, produto_id: data.produto_id!, produto_nome: prod?.nome ?? '', marca_nome: prod?.marca_nome ?? '', fornecedor_nome: null })
  }

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-ink-2">{label}</label>
      {node}
    </div>
  )
  const btnGroup = (k: keyof typeof form, opts: { v: string; label: string }[]) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map(o => (
        <button key={o.v} type="button" onClick={() => set(k, o.v)}
          className={cn('rounded-control border px-3.5 py-2 text-[12.5px] font-medium transition-colors',
            form[k] === o.v ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:border-ink/20')}>
          {o.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <Select
        label={isVeiculo ? 'Modelo (catálogo)' : 'Produto (catálogo)'}
        required
        value={form.produto_id}
        onChange={e => set('produto_id', e.target.value)}
      >
        <option value="">{isVeiculo ? 'Buscar modelo no catálogo…' : 'Buscar modelo no catálogo…'}</option>
        {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.marca_nome}</option>)}
      </Select>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {field('Tipo de entrada *', btnGroup('tipo', [{ v: 'compra', label: 'Compra' }, { v: 'consignado', label: 'Consignado' }, { v: 'troca', label: 'Troca' }]))}
        {field('Condição *', btnGroup('condicao', isVeiculo ? [{ v: 'novo', label: '0km' }, { v: 'usado', label: 'Usado' }] : [{ v: 'novo', label: 'Novo' }, { v: 'seminovo', label: 'Seminovo' }, { v: 'usado', label: 'Usado' }]))}
      </div>

      {!isVeiculo && (preset?.seminovo || form.condicao !== 'novo') && (
        <Select label="Cliente (quem vendeu o aparelho)" value={form.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
          <option value="">— Não vincular —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select label="Estado" value={form.estado} onChange={e => set('estado', e.target.value)}>
          {(isVeiculo ? ['excelente', 'otimo', 'bom', 'regular'] : ['lacrado', 'excelente', 'bom', 'regular']).map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
        </Select>
        {field('Status inicial *', btnGroup('status', [{ v: 'disponivel', label: 'Disponível' }, { v: 'pendente', label: 'Pendente' }, { v: 'assistencia', label: 'Em reparo' }]))}
      </div>

      {isVeiculo ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="Placa" value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC1D23" className="num" />
            <Input label="Ano/modelo" type="number" value={form.ano} onChange={e => set('ano', e.target.value)} placeholder="2022" className="num" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="Chassi" value={form.chassi} onChange={e => set('chassi', e.target.value.toUpperCase())} placeholder="9BW…" className="num" />
            <Input label="Km" type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="45000" className="num" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="Cor" value={form.cor} onChange={e => set('cor', e.target.value)} placeholder="Prata" />
            <Input label="Renavam" value={form.renavam} onChange={e => set('renavam', e.target.value)} placeholder="00000000000" className="num" />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="Cor" value={form.cor} onChange={e => set('cor', e.target.value)} placeholder="Titânio Natural" />
            <Input label="Armazenamento" value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)} placeholder="256GB" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="IMEI / Número de série" value={form.imei} onChange={e => set('imei', e.target.value)} placeholder="354 88•••• ••••" className="num" />
            <Input label="Saúde da bateria" value={form.bateria} onChange={e => set('bateria', e.target.value)} placeholder="100" className="num" />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input label="Preço de custo *" type="number" value={form.preco_custo} onChange={e => set('preco_custo', e.target.value)} placeholder="R$ 0,00" className="num" />
        <Input label="Custo de reparo" type="number" value={form.custo_reparo} onChange={e => set('custo_reparo', e.target.value)} placeholder="R$ 0,00" className="num" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {field('Custo total (auto)',
          <div className="num rounded-control border border-ok/20 bg-ok-soft px-3 py-2 text-[13px] font-semibold text-ok">
            {formatCurrency(custoTotal)}
            {margem && <span className="ml-2 text-[11px] font-normal text-ok/70">· margem {margem}%</span>}
          </div>
        )}
        <Input label="Preço de venda *" type="number" value={form.preco_venda} onChange={e => set('preco_venda', e.target.value)} placeholder="R$ 0,00" className="num" />
      </div>

      {sugestaoPreco != null && (
        <button type="button" onClick={() => set('preco_venda', String(sugestaoPreco))}
          className="flex w-full items-center justify-between rounded-control border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] text-ink-2 transition-colors hover:border-accent">
          <span>Tabela de preços sugere <strong className="text-ink">{formatCurrency(sugestaoPreco)}</strong> para este modelo/condição</span>
          <span className="font-semibold text-accent">Aplicar</span>
        </button>
      )}

      <Textarea
        label="Observações"
        rows={3}
        value={form.observacoes}
        onChange={e => set('observacoes', e.target.value)}
        placeholder="Detalhes da unidade, acessórios inclusos, avarias…"
      />

      <div className="flex justify-end pt-2">
        <Button icon={<ArrowDownLeft size={15} strokeWidth={1.7} />} onClick={salvar} loading={saving}>
          {saving ? 'Salvando…' : 'Registrar entrada'}
        </Button>
      </div>
    </div>
  )
}
