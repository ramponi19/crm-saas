'use client'

import { useState, useMemo } from 'react'
import { Search, Package, CheckCircle, Clock, Wrench, TrendingUp, ArrowDownLeft, History, LayoutDashboard, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import UnidadeModal from './unidade-modal'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { TablesInsert } from '@/types/database'

interface Unidade {
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
}

interface Movimentacao {
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
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  disponivel:  { label: 'Disponível',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  reservado:   { label: 'Reservado',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  vendido:     { label: 'Vendido',     color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' },
  assistencia: { label: 'Em reparo',   color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
}

const CONDICAO_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  novo:      { label: 'Novo',       color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
  seminovo:  { label: 'Seminovo',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  usado:     { label: 'Usado',      color: '#8A9BB0', bg: 'rgba(138,155,176,0.12)' },
  defeito:   { label: 'Com defeito',color: '#F0353D', bg: 'rgba(240,53,61,0.12)' },
}

const TIPO_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  entrada:  { label: 'Entrada',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  saida:    { label: 'Saída',    color: '#F0353D', bg: 'rgba(240,53,61,0.12)' },
  ajuste:   { label: 'Ajuste',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  compra:   { label: 'Entrada',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  venda:    { label: 'Saída',    color: '#F0353D', bg: 'rgba(240,53,61,0.12)' },
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => {
  const d = new Date(s)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

type Tab = 'dashboard' | 'lista' | 'entrada' | 'historico'

export default function EstoqueView({ itens: itensInit, movimentacoes, marcas, categorias, produtos }: Props) {
  const [tab, setTab] = useState<Tab>('lista')
  const [itens, setItens] = useState<Unidade[]>(itensInit)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroMarca, setFiltroMarca] = useState('todas')
  const [unidadeSel, setUnidadeSel] = useState<Unidade | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

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
    const matchSearch = !search ||
      i.produto_nome.toLowerCase().includes(search.toLowerCase()) ||
      i.marca_nome.toLowerCase().includes(search.toLowerCase()) ||
      (i.imei ?? '').includes(search) ||
      (i.numero_serie ?? '').includes(search)
    const matchStatus = filtroStatus === 'todos' || i.status === filtroStatus
    const matchMarca = filtroMarca === 'todas' || i.marca_nome === filtroMarca
    return matchSearch && matchStatus && matchMarca
  }), [itens, search, filtroStatus, filtroMarca])

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
    { key: 'lista',     label: 'Lista',     icon: <List size={14} /> },
    { key: 'entrada',   label: 'Entrada',   icon: <ArrowDownLeft size={14} /> },
    { key: 'historico', label: 'Histórico', icon: <History size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      <Topbar eyebrow="Catálogo · Controle de Unidades" title="Estoque" />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white border border-[#16212E]/[0.08] rounded-[12px] w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-[9px] text-[13px] font-medium transition-all',
                tab === t.key ? 'bg-[#E03037] text-white font-bold shadow-[0_4px_12px_rgba(215,40,47,0.3)]' : 'text-[#788698] hover:text-[#56657A]')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-4">
              {[
                { icon: <Package size={20}/>, label: 'Unidades ativas', value: stats.total, color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
                { icon: <CheckCircle size={20}/>, label: 'Disponíveis', value: stats.disponiveis, color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
                { icon: <Clock size={20}/>, label: 'Reservadas', value: stats.reservados, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
                { icon: <Wrench size={20}/>, label: 'Em reparo', value: stats.reparo, color: '#F0353D', bg: 'rgba(240,53,61,0.12)' },
              ].map((c, i) => (
                <div key={i} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-[12px] flex items-center justify-center flex-none" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
                  <div>
                    <div className="text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em]">{c.label}</div>
                    <div className="text-[26px] font-serif text-[#16212E] leading-none mt-1">{c.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6 space-y-4">
              <div className="text-[11px] font-mono text-[#788698] uppercase tracking-[0.12em]">Distribuição por Status</div>
              {[
                { label: 'Disponíveis', count: stats.disponiveis, color: '#22C55E' },
                { label: 'Reservadas',  count: stats.reservados,  color: '#F59E0B' },
                { label: 'Em reparo',   count: stats.reparo,       color: '#6B8CFF' },
                { label: 'Vendidas (total)', count: stats.vendidos, color: '#5C6E84' },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-4">
                  <div className="w-32 text-[13px] text-[#788698]">{r.label}</div>
                  <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: stats.total ? `${(r.count / stats.total) * 100}%` : '0%', background: r.color }} />
                  </div>
                  <div className="w-8 text-[13px] text-[#16212E] font-semibold text-right">{r.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LISTA ── */}
        {tab === 'lista' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-[360px]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#46586E]" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por IMEI, número de série..."
                  className="w-full bg-white border border-[#16212E]/[0.10] rounded-[11px] py-2.5 pl-10 pr-4 text-[13px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-white/[0.2]" />
              </div>

              <div className="flex gap-1 p-1 bg-white border border-[#16212E]/[0.08] rounded-[11px]">
                {['todos','disponivel','reservado','assistencia','vendido'].map(s => (
                  <button key={s} onClick={() => setFiltroStatus(s)}
                    className={cn('px-3 py-1.5 rounded-[8px] text-[12px] font-medium capitalize transition-all',
                      filtroStatus === s ? 'bg-[#E03037] text-white font-bold' : 'text-[#788698] hover:text-[#56657A]')}>
                    {s === 'todos' ? 'Todos' : STATUS_STYLE[s]?.label ?? s}
                  </button>
                ))}
              </div>

              {marcasUnicas.length > 0 && (
                <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
                  className="bg-white border border-[#16212E]/[0.10] rounded-[11px] px-3 py-2.5 text-[13px] text-[#788698] outline-none">
                  <option value="todas">Todas as marcas</option>
                  {marcasUnicas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}

              <div className="flex-1" />
              <button onClick={() => { setUnidadeSel(null); setModalOpen(true) }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold transition-colors shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
                <ArrowDownLeft size={15} /> Entrada de estoque
              </button>
            </div>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
              <div className="grid px-5 py-3 border-b border-[#16212E]/[0.08]"
                style={{ gridTemplateColumns: '2fr 1.2fr 0.9fr 0.7fr 1.2fr 1fr 1fr 1.1fr' }}>
                {['Produto','IMEI','Condição','Bateria','Variante','Custo','Venda','Status'].map(h => (
                  <div key={h} className="text-[10.5px] font-mono text-[#46586E] uppercase tracking-[0.12em]">{h}</div>
                ))}
              </div>

              {filtrados.length === 0 ? (
                <div className="py-14 text-center text-[#788698] text-[13px]">Nenhuma unidade encontrada</div>
              ) : filtrados.map(u => {
                const cond = CONDICAO_STYLE[u.condicao ?? 'novo'] ?? CONDICAO_STYLE.novo
                const st = STATUS_STYLE[u.status ?? 'disponivel'] ?? STATUS_STYLE.disponivel
                const imeiMask = u.imei ? u.imei.slice(0, 3) + ' ' + u.imei.slice(3, 5) + '•••• ' + u.imei.slice(-4) : u.numero_serie ?? '—'
                const variante = [u.cor, u.armazenamento].filter(Boolean).join(' · ') || '—'
                return (
                  <div key={u.id} onClick={() => { setUnidadeSel(u); setModalOpen(true) }}
                    className="grid px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] cursor-pointer transition-colors items-center"
                    style={{ gridTemplateColumns: '2fr 1.2fr 0.9fr 0.7fr 1.2fr 1fr 1fr 1.1fr' }}>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-[#1F2A39] truncate">{u.produto_nome}</div>
                      <div className="text-[11.5px] text-[#6B7C92]">{u.marca_nome}</div>
                    </div>
                    <div className="text-[12.5px] text-[#788698] font-mono">{imeiMask}</div>
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: cond.bg, color: cond.color }}>{cond.label}</span>
                    </div>
                    <div className="text-[13px] font-semibold" style={{ color: Number(u.bateria) >= 90 ? '#22C55E' : Number(u.bateria) >= 80 ? '#F59E0B' : '#F0353D' }}>
                      {u.bateria ? `${u.bateria}%` : '—'}
                    </div>
                    <div className="text-[12.5px] text-[#788698] truncate">{variante}</div>
                    <div className="text-[13px] text-[#788698]">{u.preco_custo ? fmt(u.preco_custo) : '—'}</div>
                    <div className="text-[13.5px] font-bold text-[#16212E]">{u.preco_venda ? fmt(u.preco_venda) : '—'}</div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: st.bg, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                        {st.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── ENTRADA ── */}
        {tab === 'entrada' && (
          <div className="max-w-[700px]">
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] overflow-hidden">
              <div className="flex items-center gap-4 px-6 py-5 border-b border-[#16212E]/[0.08]">
                <div className="w-10 h-10 rounded-[12px] bg-[rgba(215,40,47,0.15)] flex items-center justify-center">
                  <ArrowDownLeft size={18} className="text-[#F0353D]" />
                </div>
                <div>
                  <div className="text-[16px] font-serif text-[#16212E]">Nova entrada de unidade</div>
                  <div className="text-[12px] text-[#788698]">Cadastre uma unidade física no estoque por IMEI / número de série</div>
                </div>
              </div>
              <div className="px-6 py-5">
                <UnidadeInlineForm
                  produtos={produtos}
                  onSaved={(u) => {
                    setItens(prev => [u, ...prev])
                    setTab('lista')
                    toast.success('Unidade adicionada ao estoque!')
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {tab === 'historico' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <div className="grid px-5 py-3 border-b border-[#16212E]/[0.08]"
              style={{ gridTemplateColumns: '1.2fr 1fr 2fr 0.5fr 1.5fr 1.5fr' }}>
              {['Data','Movimento','Produto','Qtd','Responsável','Reservação'].map(h => (
                <div key={h} className="text-[10.5px] font-mono text-[#46586E] uppercase tracking-[0.12em]">{h}</div>
              ))}
            </div>
            {movimentacoes.length === 0 ? (
              <div className="py-14 text-center text-[#788698] text-[13px]">Nenhuma movimentação registrada</div>
            ) : movimentacoes.map(m => {
              const tipo = TIPO_STYLE[m.tipo_movimento] ?? { label: m.tipo_movimento, color: '#8A9BB0', bg: 'rgba(138,155,176,0.12)' }
              return (
                <div key={m.id} className="grid px-5 py-3.5 border-b border-[#16212E]/[0.06] items-center"
                  style={{ gridTemplateColumns: '1.2fr 1fr 2fr 0.5fr 1.5fr 1.5fr' }}>
                  <div className="text-[12.5px] text-[#788698] font-mono">{fmtDate(m.created_at)}</div>
                  <div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: tipo.bg, color: tipo.color }}>{tipo.label}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-[#1F2A39] truncate">{m.produto_nome}</div>
                  <div className="text-[13px] font-semibold" style={{ color: m.quantidade > 0 ? '#22C55E' : '#F0353D' }}>
                    {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                  </div>
                  <div className="text-[13px] text-[#788698]">{m.usuario_nome ?? '—'}</div>
                  <div className="text-[12.5px] text-[#6B7C92] truncate">{m.observacoes ?? '—'}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <UnidadeModal
          unidade={unidadeSel}
          onClose={() => { setModalOpen(false); setUnidadeSel(null) }}
        />
      )}
    </div>
  )
}

// ── Formulário inline de entrada ──
function UnidadeInlineForm({ produtos, onSaved }: {
  produtos: { id: number; nome: string; marca_id: number | null; categoria_id: number | null; marca_nome: string; categoria_nome: string | null; ativo: boolean }[]
  onSaved: (u: Unidade) => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState({
    produto_id: '', tipo: 'compra', condicao: 'novo', estado: 'lacrado',
    status: 'disponivel', cor: '', armazenamento: '', imei: '', bateria: '',
    preco_custo: '', custo_reparo: '', preco_venda: '', observacoes: '', origem: 'fornecedor',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const custoTotal = (Number(form.preco_custo) || 0) + (Number(form.custo_reparo) || 0)
  const margem = form.preco_venda && form.preco_custo
    ? (((Number(form.preco_venda) - custoTotal) / Number(form.preco_venda)) * 100).toFixed(1) : null

  async function salvar() {
    if (!form.produto_id) { toast.error('Selecione um produto'); return }
    if (!form.preco_custo) { toast.error('Informe o preço de custo'); return }
    if (!form.preco_venda) { toast.error('Informe o preço de venda'); return }
    setSaving(true)
    const payload = {
      produto_id: Number(form.produto_id),
      tipo: form.tipo, condicao: form.condicao, estado: form.estado,
      status: form.status,
      cor: form.cor || null, armazenamento: form.armazenamento || null,
      imei: form.imei || null, bateria: form.bateria || null,
      preco_custo: Number(form.preco_custo), preco_venda: Number(form.preco_venda),
      custo_reparo: Number(form.custo_reparo) || null,
      observacoes: form.observacoes || null, ativo: true,
    }
    const { data, error } = await supabase.from('inventario_unidades').insert(payload as TablesInsert<'inventario_unidades'>).select().single()
    setSaving(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    const prod = produtos.find(p => p.id === Number(form.produto_id))
    onSaved({ ...data, produto_id: data.produto_id!, produto_nome: prod?.nome ?? '', marca_nome: prod?.marca_nome ?? '', fornecedor_nome: null })
  }

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="block text-[10.5px] font-mono text-[#788698] uppercase tracking-[0.12em] mb-1.5">{label}</label>
      {node}
    </div>
  )
  const inp = (k: string, placeholder?: string, type = 'text') => (
    <input type={type} value={(form as any)[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-[13px] text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2]" />
  )
  const btnGroup = (k: string, opts: { v: string; label: string }[]) => (
    <div className="flex gap-2 flex-wrap">
      {opts.map(o => (
        <button key={o.v} type="button" onClick={() => set(k, o.v)}
          className={cn('px-4 py-2 rounded-[9px] text-[12.5px] font-medium transition-all border',
            (form as any)[k] === o.v ? 'bg-[#D7282F] text-white border-[#D7282F]' : 'text-[#788698] border-[#16212E]/[0.10] hover:border-white/[0.2]')}>
          {o.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {field('Produto (Catálogo) *',
        <select value={form.produto_id} onChange={e => set('produto_id', e.target.value)}
          className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-[13px] text-[#56657A] outline-none">
          <option value="">Buscar modelo no catálogo...</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.marca_nome}</option>)}
        </select>
      )}

      <div className="grid grid-cols-2 gap-5">
        {field('Tipo de Entrada *', btnGroup('tipo', [{ v:'compra', label:'Compra' }, { v:'consignado', label:'Consignado' }, { v:'troca', label:'Troca' }]))}
        {field('Condição *', btnGroup('condicao', [{ v:'novo', label:'Novo' }, { v:'usado', label:'Usado' }]))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {field('Estado *',
          <select value={form.estado} onChange={e => set('estado', e.target.value)}
            className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-[13px] text-[#56657A] outline-none">
            {['lacrado','excelente','bom','regular'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
          </select>
        )}
        {field('Status Inicial *', btnGroup('status', [{ v:'disponivel', label:'Disponível' }, { v:'pendente', label:'Pendente' }, { v:'assistencia', label:'Em reparo' }]))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {field('Cor', inp('cor', 'Titânio Natural'))}
        {field('Armazenamento', inp('armazenamento', '256GB'))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {field('IMEI / Número de Série', inp('imei', '354 88•••• ••••'))}
        {field('Saúde da Bateria', inp('bateria', '100'))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {field('Preço de Custo *', inp('preco_custo', 'R$ 0,00', 'number'))}
        {field('Custo de Reparo', inp('custo_reparo', 'R$ 0,00', 'number'))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {field('Custo Total (Auto)',
          <div className="w-full bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)] rounded-[9px] px-3 py-2.5 text-[13px] font-semibold text-[#15986A]">
            {custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            {margem && <span className="ml-2 text-[11px] text-[#15986A]/70">· margem {margem}%</span>}
          </div>
        )}
        {field('Preço de Venda *', inp('preco_venda', 'R$ 0,00', 'number'))}
      </div>

      {field('Observações', 
        <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
          placeholder="Detalhes da unidade, acessórios inclusos, avarias..."
          rows={3}
          className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-[13px] text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2] resize-none" />
      )}

      <div className="flex justify-end pt-2">
        <button onClick={salvar} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-[11px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold transition-colors disabled:opacity-50 shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
          <ArrowDownLeft size={15} />
          {saving ? 'Salvando...' : 'Registrar entrada'}
        </button>
      </div>
    </div>
  )
}
