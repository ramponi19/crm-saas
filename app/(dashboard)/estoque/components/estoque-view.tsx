'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, Package, ArrowDownLeft, History, LayoutDashboard, List, RefreshCw, PackageCheck } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import UnidadeModal from './unidade-modal'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-cliente'
import { buscarModeloApple } from '@/lib/apple-modelos'
import {
  Card, StatCard, Table, Tabs, Badge, Button, Input, Select, Textarea, EmptyState, notify, ConfirmDialog,
  type Column,
} from '@/components/ui'
import type { TablesInsert } from '@/types/database'
import type { Segmento } from '@/lib/segmentos'

export interface Unidade {
  id: number
  /** Nulo em unidade sem cadastro de produto (aparelho recebido em troca). */
  produto_id: number | null
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
  /** Fotos desta unidade — URLs separadas por vírgula. */
  fotos_urls: string | null
  /** Foto do modelo; usada quando a unidade não tem foto própria. */
  produto_foto?: string | null
  /** Em entrada por troca: quem aceitou o aparelho e responde por ele até chegar. */
  responsavel_nome?: string | null
  /** Fechamento do PDV que trouxe a unidade — agrupa as trocas da mesma venda. */
  grupo_pdv?: string | null
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
  // "Pendente", a mesma palavra do cadastro manual e do PDV. Eu havia escrito
  // "A receber" aqui: dois nomes para o mesmo status deixam o vendedor sem saber
  // se são coisas diferentes.
  pendente:    { label: 'Pendente',   tone: 'warn' },
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
  { value: 'pendente', label: 'Pendente' },
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
  const [confirmar, setConfirmar] = useState<Unidade | null>(null)
  const [confirmando, setConfirmando] = useState<number | null>(null)

  // Confirma a chegada física do aparelho aceito em troca. É o que tira a unidade
  // do limbo: entra no PDV e a comissão do fechamento é liberada.
  async function confirmarChegada() {
    if (!confirmar) return
    const alvo = confirmar
    setConfirmando(alvo.id)
    try {
      const { ok, json, sessaoExpirada } = await apiFetch<{ error?: string }>('/api/estoque/confirmar-chegada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alvo.id }),
      })
      if (sessaoExpirada) return
      if (!ok) { notify.bad('Não foi possível confirmar', json.error); return }
      setItens((prev) => prev.map((i) => i.id === alvo.id ? { ...i, status: 'disponivel' } : i))
      notify.ok('Chegada confirmada', 'A unidade entrou no estoque e a comissão foi liberada.')
    } finally {
      setConfirmando(null)
      setConfirmar(null)
    }
  }

  function abrirEntrada(p: Preset) { setPreset(p); setTab('entrada') }

  // Stats
  const stats = useMemo(() => {
    const disponiveis = itens.filter(i => i.status === 'disponivel').length
    const reservados = itens.filter(i => i.status === 'reservado').length
    const reparo = itens.filter(i => i.status === 'assistencia').length
    const vendidos = itens.filter(i => i.status === 'vendido').length
    const pendentes = itens.filter(i => i.status === 'pendente').length
    const total = itens.length
    // Só o que está na loja soma no valor do estoque — pendente ainda não chegou.
    const valorEstoque = itens.filter(i => i.status === 'disponivel').reduce((acc, i) => acc + (i.preco_venda ?? 0), 0)
    return { total, disponiveis, reservados, reparo, vendidos, pendentes, valorEstoque }
  }, [itens])

  // Quantas trocas do MESMO fechamento ainda faltam chegar (incluindo a que está
  // sendo confirmada). É o que decide se este clique libera a comissão ou não.
  const pendentesDoMesmoFechamento = useMemo(() => {
    if (!confirmar?.grupo_pdv) return 1
    return itens.filter(i => i.grupo_pdv === confirmar.grupo_pdv && i.status === 'pendente').length
  }, [itens, confirmar])

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
      render: (u) => {
        // Miniatura junto do nome: não gasta coluna nova e já mostra se a foto
        // da unidade foi salva. A da unidade ganha da do modelo — é o aparelho
        // real que o cliente vai levar.
        const foto = (u.fotos_urls ?? '').split(',').map((s) => s.trim()).find(Boolean) ?? u.produto_foto ?? null
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-control border border-line-soft bg-ink/[0.03] text-ink-3">
              {foto
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={foto} alt="" className="h-full w-full object-cover" />
                : <Package size={15} strokeWidth={1.7} />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">{u.produto_nome}</div>
              <div className="text-[11.5px] text-ink-3">{u.marca_nome}</div>
            </div>
          </div>
        )
      },
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
      render: (u) => {
        const s = STATUS_BADGE[u.status ?? 'disponivel'] ?? STATUS_BADGE.disponivel
        return (
          <div className="flex flex-col items-end gap-0.5">
            <Badge tone={s.tone} dot={s.dot}>{s.label}</Badge>
            {/* Pendente sem dono visível não cobra ninguém. O nome de quem aceitou
                a troca é o que faz a pendência ter responsável. */}
            {u.status === 'pendente' && u.responsavel_nome && (
              <span className="text-[11px] text-ink-3">com {u.responsavel_nome}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'chegada', header: '', align: 'right',
      render: (u) => u.status === 'pendente' ? (
        <Button size="sm" variant="outline" icon={<PackageCheck size={12} strokeWidth={1.8} />}
          loading={confirmando === u.id} onClick={() => setConfirmar(u)}>
          Confirmar chegada
        </Button>
      ) : null,
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

      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4 sm:px-6 sm:py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1240px] space-y-4">

          <Tabs items={TABS} value={tab} onValueChange={(v) => setTab(v as Tab)} />

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-5 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
                <StatCard bare label="Unidades ativas" value={stats.total} />
                <StatCard bare label="Disponíveis" value={stats.disponiveis} deltaTone="ok" />
                {/* Aparelho de troca que ainda não chegou. Estava sendo contado e
                    não aparecia em lugar nenhum — é justamente o que alguém tem
                    de olhar todo dia para ir cobrar o cliente. */}
                <StatCard bare label="Pendentes" value={stats.pendentes} />
                <StatCard bare label="Reservadas" value={stats.reservados} />
                <StatCard bare label="Em reparo" value={stats.reparo} />
              </div>

              <Card title="Distribuição por status">
                <div className="space-y-4">
                  {[
                    { label: 'Disponíveis', count: stats.disponiveis, bar: 'bg-ok' },
                    { label: 'Pendentes (troca a receber)', count: stats.pendentes, bar: 'bg-warn' },
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
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                  wrapperClassName="w-full sm:min-w-[240px] sm:flex-1"
                  icon={<Search size={15} strokeWidth={1.7} />}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={isVeiculo ? 'Buscar por modelo, marca, placa ou chassi…' : 'Buscar por produto, marca, IMEI ou número de série…'}
                />
                {marcasUnicas.length > 0 && (
                  <Select wrapperClassName="w-full sm:w-[190px]" value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
                    <option value="todas">Todas as marcas</option>
                    {marcasUnicas.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                )}
                <Button className="w-full sm:w-auto" icon={<ArrowDownLeft size={15} strokeWidth={1.7} />} onClick={() => { setUnidadeSel(null); setModalOpen(true) }}>
                  {isVeiculo ? 'Adicionar veículo' : 'Entrada de estoque'}
                </Button>
                {!isVeiculo && (
                  <Button variant="outline" className="w-full sm:w-auto" icon={<RefreshCw size={15} strokeWidth={1.7} />} onClick={() => abrirEntrada({ condicao: 'usado', tipo: 'compra', seminovo: true })}>
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

      <ConfirmDialog
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={confirmarChegada}
        loading={confirmando != null}
        title="Confirmar que o aparelho chegou?"
        description={
          `"${confirmar?.produto_nome ?? 'Aparelho'}"${confirmar?.imei ? ` (IMEI ${confirmar.imei})` : ''} passa a disponível para venda.`
          // Quando a venda trouxe MAIS DE UM aparelho, confirmar só este não
          // libera nada — o outro segue segurando o fechamento. O texto antigo
          // prometia a liberação sempre, e no teste com duas trocas prometeu
          // errado: confirmei um e a comissão continuou (corretamente) retida.
          + (pendentesDoMesmoFechamento > 1
            ? ` Ainda ${pendentesDoMesmoFechamento - 1 === 1 ? 'falta 1 aparelho' : `faltam ${pendentesDoMesmoFechamento - 1} aparelhos`} desta mesma venda`
              + `${confirmar?.responsavel_nome ? ` — a comissão de ${confirmar.responsavel_nome}` : ' — a comissão'} só é liberada quando todos chegarem.`
            : `${confirmar?.responsavel_nome ? ` A comissão de ${confirmar.responsavel_nome}` : ' A comissão'} pela venda que trouxe este aparelho é liberada.`)
          + ' Confirme apenas com o aparelho em mãos.'
        }
        confirmLabel="Chegou, confirmar"
      />
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
    status: 'disponivel', cor: '', armazenamento: '', imei: '', modelo_num: '', bateria: '',
    placa: '', chassi: '', renavam: '', km: '', ano: '',
    preco_custo: '', custo_reparo: '', preco_venda: '', observacoes: '', origem: 'fornecedor', cliente_id: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  /**
   * Consulta pelo número de série / IMEI.
   *
   * A fonte é o histórico da PRÓPRIA loja — não existe consulta externa de IMEI
   * no sistema, e inventar uma seria prometer dado que não temos. O que isso
   * resolve de verdade:
   *
   * - DUPLICADO: já existe unidade ativa com esse IMEI. Hoje nada impede cadastrar
   *   o mesmo aparelho duas vezes (os índices de imei/série não são únicos), e o
   *   estoque passa a mentir na contagem.
   * - CONHECIDO: aparelho que já passou pela loja (vendido, ou que voltou em
   *   troca/garantia). Traz modelo, cor e capacidade preenchidos — é o caso comum
   *   de recompra e de aparelho que volta.
   *
   * Preço NÃO é copiado de propósito: custo e venda são desta negociação, não da
   * anterior. Repetir o valor antigo seria o tipo de "ajuda" que passa batida.
   */
  type Achado =
    | { tipo: 'duplicado'; rotulo: string; status: string }
    | { tipo: 'conhecido'; rotulo: string; quando: string | null }
  const [serieBuscando, setSerieBuscando] = useState(false)
  const [serieAchado, setSerieAchado] = useState<Achado | null>(null)

  useEffect(() => {
    const serie = form.imei.trim()
    if (isVeiculo || serie.length < 6) { setSerieAchado(null); return }
    let cancelado = false
    setSerieBuscando(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('inventario_unidades')
        .select('id, status, ativo, cor, armazenamento, condicao, bateria, produto_id, created_at, produtos!produto_id(nome)')
        .eq('empresa_id', empresaId)
        .or(`imei.eq.${serie},numero_serie.eq.${serie}`)
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelado) return
      setSerieBuscando(false)

      const u = (data ?? [])[0] as (Record<string, unknown> & { produtos?: { nome?: string } | { nome?: string }[] | null }) | undefined
      if (!u) { setSerieAchado(null); return }

      const prod = Array.isArray(u.produtos) ? u.produtos[0] : u.produtos
      const rotulo = prod?.nome ?? 'Aparelho sem cadastro de produto'

      // Ativo e não vendido = está no estoque agora. É duplicata, não histórico.
      if (u.ativo && u.status !== 'vendido') {
        setSerieAchado({ tipo: 'duplicado', rotulo, status: String(u.status ?? '') })
        return
      }

      setSerieAchado({ tipo: 'conhecido', rotulo, quando: (u.created_at as string) ?? null })
      // Preenche só o que identifica o aparelho, e sem sobrescrever o que a
      // pessoa já digitou.
      setForm(f => ({
        ...f,
        produto_id: f.produto_id || (u.produto_id ? String(u.produto_id) : ''),
        cor: f.cor || String(u.cor ?? ''),
        armazenamento: f.armazenamento || String(u.armazenamento ?? ''),
        bateria: f.bateria || String(u.bateria ?? ''),
      }))
    }, 450)
    return () => { cancelado = true; clearTimeout(t) }
  }, [form.imei, isVeiculo, empresaId, supabase])

  /**
   * Número de MODELO da Apple (o "A" atrás do aparelho e em Ajustes > Geral >
   * Sobre). Diz QUAL É o aparelho: modelo, capacidades e cores possíveis.
   *
   * Não confundir com IMEI. O número de modelo é do MODELO, não da peça: todo
   * iPhone 15 Pro Max vendido aqui é A3106. Ele não identifica a unidade e não
   * serve para detectar duplicata — quem faz isso é o IMEI, no campo acima.
   */
  const modeloApple = useMemo(
    () => (isVeiculo ? null : buscarModeloApple(form.modelo_num)),
    [form.modelo_num, isVeiculo],
  )

  /** Produto do catálogo com o mesmo nome do modelo reconhecido. */
  const produtoDoModelo = useMemo(() => {
    if (!modeloApple) return null
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    const alvo = norm(modeloApple.modelo)
    return produtos.find(p => norm(p.nome) === alvo) ?? null
  }, [modeloApple, produtos])

  // Reconheceu o modelo → seleciona o produto e limpa variante que não existe
  // nele (trocar de A#### depois de escolher deixaria cor/capacidade do anterior).
  useEffect(() => {
    if (!modeloApple) return
    setForm(f => ({
      ...f,
      produto_id: produtoDoModelo ? String(produtoDoModelo.id) : f.produto_id,
      armazenamento: modeloApple.capacidades.includes(f.armazenamento) ? f.armazenamento : '',
      cor: modeloApple.cores.includes(f.cor) ? f.cor : '',
    }))
  }, [modeloApple, produtoDoModelo])

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
    // Barra a duplicata de verdade. Só o aviso na tela não segura: quem está
    // dando entrada em lote passa direto e o estoque fica com o mesmo aparelho
    // contado duas vezes.
    if (serieAchado?.tipo === 'duplicado') {
      notify.bad('Este número de série já está no estoque', 'Localize a unidade existente em vez de cadastrar outra.')
      return
    }
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
      {/* Começa pelo aparelho em mãos, não pelo catálogo. Dois dados, com papéis
          diferentes: o número de MODELO diz o que é; o IMEI diz qual é. */}
      {!isVeiculo && (
        <div className="flex flex-col gap-1.5">
          <Input
            label="Número de modelo (atrás do aparelho ou em Ajustes › Geral › Sobre)"
            value={form.modelo_num}
            onChange={e => set('modelo_num', e.target.value.toUpperCase())}
            placeholder="A3106 — traz modelo, capacidades e cores"
            className="num"
            autoFocus
          />
          {modeloApple ? (
            <span className="text-[11.5px] text-ok">
              {modeloApple.codigo} = <strong className="font-semibold">{modeloApple.modelo}</strong>
              {produtoDoModelo
                ? ' — produto selecionado no catálogo.'
                : ' — não há esse produto no catálogo ainda; escolha abaixo ou cadastre em Produtos.'}
            </span>
          ) : form.modelo_num.trim().length >= 4 ? (
            <span className="text-[11.5px] text-ink-3">
              Número de modelo não reconhecido. Siga pelo catálogo abaixo.
            </span>
          ) : null}
        </div>
      )}

      {!isVeiculo && (
        <div className="flex flex-col gap-1.5">
          <Input
            label="IMEI (identifica este aparelho)"
            value={form.imei}
            onChange={e => set('imei', e.target.value.replace(/\s/g, ''))}
            placeholder="Bipe ou digite — avisa se este aparelho já está no estoque"
            className="num"
          />
          {serieBuscando && <span className="text-[11.5px] text-ink-3">Procurando no histórico da loja…</span>}
          {!serieBuscando && serieAchado?.tipo === 'duplicado' && (
            <span className="text-[11.5px] font-medium text-bad">
              Este número já está no estoque ({serieAchado.rotulo} · {STATUS_BADGE[serieAchado.status]?.label ?? serieAchado.status}).
              Confira antes de cadastrar de novo — dois cadastros do mesmo aparelho fazem a contagem mentir.
            </span>
          )}
          {!serieBuscando && serieAchado?.tipo === 'conhecido' && (
            <span className="text-[11.5px] text-ok">
              Aparelho já conhecido: {serieAchado.rotulo}
              {serieAchado.quando ? ` (entrada em ${fmtDate(serieAchado.quando)})` : ''}.
              Modelo e variante preenchidos — confira os preços, que são desta negociação.
            </span>
          )}
          {!serieBuscando && !serieAchado && form.imei.trim().length >= 6 && (
            <span className="text-[11.5px] text-ink-3">Aparelho novo para a loja — selecione o produto abaixo.</span>
          )}
        </div>
      )}

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
          {/* Com o modelo reconhecido, cor e capacidade viram lista fechada: são
              as que a Apple fez para aquele aparelho. Digitar livre aqui é como
              nascem "256 gb", "256GB" e "256 GB" como três variantes diferentes. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {modeloApple && modeloApple.cores.length > 0 ? (
              <Select label="Cor" value={form.cor} onChange={e => set('cor', e.target.value)}>
                <option value="">Selecione…</option>
                {modeloApple.cores.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            ) : (
              <Input label="Cor" value={form.cor} onChange={e => set('cor', e.target.value)} placeholder="Titânio Natural" />
            )}
            {modeloApple && modeloApple.capacidades.length > 0 ? (
              <Select label="Armazenamento" value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)}>
                <option value="">Selecione…</option>
                {modeloApple.capacidades.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            ) : (
              <Input label="Armazenamento" value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)} placeholder="256GB" />
            )}
          </div>
          {/* O IMEI subiu para o topo do formulário — é por ele que a entrada
              começa agora. Aqui fica só a bateria. */}
          <Input label="Saúde da bateria" value={form.bateria} onChange={e => set('bateria', e.target.value)} placeholder="100" className="num" />
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
