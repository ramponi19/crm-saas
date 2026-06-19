'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Truck, Clock, CheckCircle2, Package, DollarSign, ChevronRight, X, Save, Building2, Phone, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Pedido {
  id: number
  fornecedor_id: number | null
  fornecedor_nome: string
  descricao: string | null
  valor_total: number | null
  status: string | null
  observacoes: string | null
  data_pedido: string
  created_at: string
}

interface Fornecedor {
  id: number
  nome_fantasia: string
  razao_social: string | null
  cnpj: string | null
  telefone: string | null
  email: string | null
  contato: string | null
  observacoes: string | null
}

interface Props {
  pedidos: Pedido[]
  fornecedores: Fornecedor[]
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pendente:   { label: 'Pendente',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  confirmado: { label: 'Confirmado', color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
  enviado:    { label: 'Enviado',    color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  recebido:   { label: 'Recebido',   color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' },
  cancelado:  { label: 'Cancelado',  color: '#F0353D', bg: 'rgba(215,40,47,0.12)' },
}

const FORNECEDOR_EMPTY = {
  nome_fantasia: '', razao_social: '', cnpj: '', telefone: '', email: '', contato: '', observacoes: '',
}

export default function ComprasView({ pedidos, fornecedores: fornecedoresInit }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [tab, setTab] = useState<'pedidos' | 'fornecedores'>('pedidos')

  // --- Pedidos ---
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [modalPedido, setModalPedido] = useState(false)
  const [pedidoSel, setPedidoSel] = useState<Pedido | null>(null)
  const [formPedido, setFormPedido] = useState({ fornecedor_id: '', descricao: '', valor_total: '', status: 'pendente', observacoes: '', data_pedido: new Date().toISOString().split('T')[0] })
  const [savingPedido, setSavingPedido] = useState(false)

  // --- Fornecedores ---
  const [searchForn, setSearchForn] = useState('')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(fornecedoresInit)
  const [modalForn, setModalForn] = useState(false)
  const [fornSel, setFornSel] = useState<Fornecedor | null>(null)
  const [formForn, setFormForn] = useState({ ...FORNECEDOR_EMPTY })
  const [savingForn, setSavingForn] = useState(false)

  // Stats pedidos
  const statsPedidos = useMemo(() => ({
    total: pedidos.length,
    pendentes: pedidos.filter(p => p.status === 'pendente').length,
    enviados: pedidos.filter(p => p.status === 'enviado').length,
    valorTotal: pedidos.reduce((acc, p) => acc + (p.valor_total ?? 0), 0),
  }), [pedidos])

  const filtrados = useMemo(() => pedidos.filter(p => {
    const matchSearch = !search ||
      p.fornecedor_nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.descricao ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
    return matchSearch && matchStatus
  }), [pedidos, search, filtroStatus])

  const fornecedoresFiltrados = useMemo(() => {
    if (!searchForn) return fornecedores
    const q = searchForn.toLowerCase()
    return fornecedores.filter(f =>
      f.nome_fantasia.toLowerCase().includes(q) ||
      (f.razao_social ?? '').toLowerCase().includes(q) ||
      (f.cnpj ?? '').includes(q)
    )
  }, [fornecedores, searchForn])

  // --- Handlers Pedidos ---
  function openNovoPedido() {
    setPedidoSel(null)
    setFormPedido({ fornecedor_id: '', descricao: '', valor_total: '', status: 'pendente', observacoes: '', data_pedido: new Date().toISOString().split('T')[0] })
    setModalPedido(true)
  }

  function openEditarPedido(p: Pedido) {
    setPedidoSel(p)
    setFormPedido({
      fornecedor_id: String(p.fornecedor_id ?? ''),
      descricao: p.descricao ?? '',
      valor_total: String(p.valor_total ?? ''),
      status: p.status ?? 'pendente',
      observacoes: p.observacoes ?? '',
      data_pedido: p.data_pedido,
    })
    setModalPedido(true)
  }

  async function salvarPedido() {
    setSavingPedido(true)
    const payload = {
      fornecedor_id: formPedido.fornecedor_id ? Number(formPedido.fornecedor_id) : null,
      descricao: formPedido.descricao || null,
      valor_total: formPedido.valor_total ? Number(formPedido.valor_total) : null,
      status: formPedido.status,
      observacoes: formPedido.observacoes || null,
      data_pedido: formPedido.data_pedido,
    }
    if (!pedidoSel) {
      const { error } = await supabase.from('pedidos_compra').insert(payload)
      if (error) { toast.error('Erro: ' + error.message); setSavingPedido(false); return }
      toast.success('Pedido criado!')
    } else {
      const { error } = await supabase.from('pedidos_compra').update(payload).eq('id', pedidoSel.id)
      if (error) { toast.error('Erro: ' + error.message); setSavingPedido(false); return }
      toast.success('Pedido atualizado!')
    }
    router.refresh()
    setModalPedido(false)
    setSavingPedido(false)
  }

  // --- Handlers Fornecedores ---
  function openNovoForn() {
    setFornSel(null)
    setFormForn({ ...FORNECEDOR_EMPTY })
    setModalForn(true)
  }

  function openEditarForn(f: Fornecedor) {
    setFornSel(f)
    setFormForn({
      nome_fantasia: f.nome_fantasia,
      razao_social: f.razao_social ?? '',
      cnpj: f.cnpj ?? '',
      telefone: f.telefone ?? '',
      email: f.email ?? '',
      contato: f.contato ?? '',
      observacoes: f.observacoes ?? '',
    })
    setModalForn(true)
  }

  async function salvarForn() {
    if (!formForn.nome_fantasia.trim()) { toast.error('Nome é obrigatório'); return }
    setSavingForn(true)
    const payload = {
      nome_fantasia: formForn.nome_fantasia,
      razao_social: formForn.razao_social || null,
      cnpj: formForn.cnpj || null,
      telefone: formForn.telefone || null,
      email: formForn.email || null,
      contato: formForn.contato || null,
      observacoes: formForn.observacoes || null,
      ativo: true,
    }
    if (!fornSel) {
      const { data, error } = await supabase.from('fornecedores').insert(payload).select().single()
      if (error) { toast.error('Erro: ' + error.message); setSavingForn(false); return }
      setFornecedores(prev => [...prev, data])
      toast.success('Fornecedor cadastrado!')
    } else {
      const { error } = await supabase.from('fornecedores').update(payload).eq('id', fornSel.id)
      if (error) { toast.error('Erro: ' + error.message); setSavingForn(false); return }
      setFornecedores(prev => prev.map(f => f.id === fornSel.id ? { ...f, ...payload } : f))
      toast.success('Fornecedor atualizado!')
    }
    setModalForn(false)
    setSavingForn(false)
  }

  async function excluirForn() {
    if (!fornSel) return
    if (!confirm('Desativar este fornecedor?')) return
    await supabase.from('fornecedores').update({ ativo: false }).eq('id', fornSel.id)
    setFornecedores(prev => prev.filter(f => f.id !== fornSel.id))
    toast.success('Fornecedor removido')
    setModalForn(false)
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtData = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

  const FieldInput = ({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
    <div>
      <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2] transition-colors"
      />
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#F4F6F9]">Compras</h1>
            <p className="text-sm text-[#5C6E84] mt-0.5">{tab === 'pedidos' ? `${pedidos.length} pedidos` : `${fornecedores.length} fornecedores`}</p>
          </div>
          <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
            {([['pedidos', 'Pedidos'], ['fornecedores', 'Fornecedores']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all',
                  tab === key ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
                )}
              >{label}</button>
            ))}
          </div>
        </div>
        <button
          onClick={tab === 'pedidos' ? openNovoPedido : openNovoForn}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          {tab === 'pedidos' ? 'Novo Pedido' : 'Novo Fornecedor'}
        </button>
      </div>

      {tab === 'pedidos' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 px-8 py-5 shrink-0">
            {[
              { label: 'Total Pedidos', value: statsPedidos.total, icon: Truck, color: '#6B8CFF' },
              { label: 'Pendentes', value: statsPedidos.pendentes, icon: Clock, color: '#F59E0B' },
              { label: 'A Receber', value: statsPedidos.enviados, icon: Package, color: '#22C55E' },
              { label: 'Valor Total', value: fmt(statsPedidos.valorTotal), icon: DollarSign, color: '#D7282F' },
            ].map(s => (
              <div key={s.label} className="bg-[#0D1824] border border-white/[0.06] rounded-[14px] px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: s.color + '1A' }}>
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <div>
                  <div className="text-[11px] text-[#5C6E84] font-mono tracking-wide uppercase">{s.label}</div>
                  <div className="text-xl font-bold text-[#F4F6F9] mt-0.5">{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-3 px-8 pb-4 shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3F516A]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por fornecedor ou descrição..."
                className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
              />
            </div>
            <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
              {['todos', 'pendente', 'confirmado', 'enviado', 'recebido'].map(f => (
                <button
                  key={f}
                  onClick={() => setFiltroStatus(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all capitalize',
                    filtroStatus === f ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
                  )}
                >{f === 'todos' ? 'Todos' : STATUS_CFG[f]?.label ?? f}</button>
              ))}
            </div>
          </div>

          {/* Tabela Pedidos */}
          <div className="flex-1 overflow-y-auto px-8 pb-6">
            <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['#', 'Fornecedor', 'Descrição', 'Data Pedido', 'Valor Total', 'Status', ''].map(h => (
                      <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase px-5 py-3.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-16 text-[#3F516A] text-sm">Nenhum pedido encontrado</td></tr>
                  ) : filtrados.map(p => {
                    const st = STATUS_CFG[p.status ?? 'pendente'] ?? STATUS_CFG.pendente
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openEditarPedido(p)}
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs text-[#3F516A]">#{p.id}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-[8px] bg-[rgba(107,140,255,0.1)] flex items-center justify-center">
                              <Truck size={13} className="text-[#6B8CFF]" />
                            </div>
                            <span className="text-sm font-semibold text-[#E9EEF4]">{p.fornecedor_nome}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 max-w-[220px]">
                          <span className="text-sm text-[#8A9BB0] truncate block">{p.descricao ?? '—'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs text-[#8A9BB0]">{fmtData(p.data_pedido)}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-semibold text-[#F4F6F9]">{p.valor_total ? fmt(p.valor_total) : '—'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: st.color, background: st.bg }}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5"><ChevronRight size={15} className="text-[#3F516A]" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Barra de busca Fornecedores */}
          <div className="px-8 pt-5 pb-4 shrink-0">
            <div className="relative max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3F516A]" />
              <input
                value={searchForn}
                onChange={e => setSearchForn(e.target.value)}
                placeholder="Buscar por nome, razão social ou CNPJ..."
                className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
              />
            </div>
          </div>

          {/* Grid Fornecedores */}
          <div className="flex-1 overflow-y-auto px-8 pb-6">
            {fornecedoresFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#3F516A]">
                <Building2 size={40} className="mb-3 opacity-40" />
                <p className="text-sm">Nenhum fornecedor cadastrado</p>
                <button
                  onClick={openNovoForn}
                  className="mt-4 text-xs text-[#D7282F] hover:underline"
                >
                  Cadastrar primeiro fornecedor
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {fornecedoresFiltrados.map(f => (
                  <button
                    key={f.id}
                    onClick={() => openEditarForn(f)}
                    className="text-left bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-5 hover:border-white/[0.15] hover:bg-[#111D2C] transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-[10px] bg-[rgba(107,140,255,0.1)] flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-[#6B8CFF]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#F4F6F9] truncate">{f.nome_fantasia}</div>
                        {f.razao_social && (
                          <div className="text-[11px] text-[#5C6E84] truncate">{f.razao_social}</div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {f.telefone && (
                        <div className="flex items-center gap-2 text-xs text-[#8A9BB0]">
                          <Phone size={11} className="text-[#3F516A] shrink-0" />
                          {f.telefone}
                        </div>
                      )}
                      {f.email && (
                        <div className="flex items-center gap-2 text-xs text-[#8A9BB0] truncate">
                          <Mail size={11} className="text-[#3F516A] shrink-0" />
                          {f.email}
                        </div>
                      )}
                      {f.contato && (
                        <div className="text-[11px] text-[#5C6E84]">Contato: {f.contato}</div>
                      )}
                      {f.cnpj && (
                        <div className="font-mono text-[10px] text-[#3F516A]">{f.cnpj}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Pedido */}
      {modalPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[520px] bg-[#0D1824] border border-white/[0.08] rounded-[20px] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <h2 className="text-base font-bold text-[#F4F6F9]">{pedidoSel ? 'Editar Pedido' : 'Novo Pedido'}</h2>
              <button onClick={() => setModalPedido(false)} className="text-[#5C6E84] hover:text-[#9FB0C2]"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Fornecedor</label>
                <select
                  value={formPedido.fornecedor_id}
                  onChange={e => setFormPedido(f => ({ ...f, fornecedor_id: e.target.value }))}
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
                >
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Data do Pedido</label>
                <input
                  type="date"
                  value={formPedido.data_pedido}
                  onChange={e => setFormPedido(f => ({ ...f, data_pedido: e.target.value }))}
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Valor Total</label>
                <input
                  type="number"
                  value={formPedido.valor_total}
                  onChange={e => setFormPedido(f => ({ ...f, valor_total: e.target.value }))}
                  placeholder="0,00"
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Status</label>
                <select
                  value={formPedido.status}
                  onChange={e => setFormPedido(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none"
                >
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Descrição / Itens</label>
                <textarea
                  value={formPedido.descricao}
                  onChange={e => setFormPedido(f => ({ ...f, descricao: e.target.value }))}
                  rows={3}
                  placeholder="Ex: 2x iPhone 15 Pro Max 256GB Preto..."
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none resize-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Observações</label>
                <textarea
                  value={formPedido.observacoes}
                  onChange={e => setFormPedido(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  placeholder="Prazo de entrega, forma de pagamento, etc."
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
              <button onClick={() => setModalPedido(false)} className="px-4 py-2 rounded-[9px] text-sm text-[#5C6E84] hover:text-[#D4DEEA]">Cancelar</button>
              <button
                onClick={salvarPedido}
                disabled={savingPedido}
                className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold disabled:opacity-50"
              >
                <Save size={14} />
                {savingPedido ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fornecedor */}
      {modalForn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[560px] max-h-[85vh] bg-[#0D1824] border border-white/[0.08] rounded-[20px] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
              <h2 className="text-base font-bold text-[#F4F6F9]">{fornSel ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
              <button onClick={() => setModalForn(false)} className="text-[#5C6E84] hover:text-[#9FB0C2]"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <FieldInput label="Nome Fantasia *" value={formForn.nome_fantasia} onChange={v => setFormForn(f => ({ ...f, nome_fantasia: v }))} placeholder="Nome comercial" />
                </div>
                <div className="col-span-2">
                  <FieldInput label="Razão Social" value={formForn.razao_social} onChange={v => setFormForn(f => ({ ...f, razao_social: v }))} placeholder="Razão social completa" />
                </div>
                <FieldInput label="CNPJ" value={formForn.cnpj} onChange={v => setFormForn(f => ({ ...f, cnpj: v }))} placeholder="00.000.000/0001-00" />
                <FieldInput label="Telefone / WhatsApp" value={formForn.telefone} onChange={v => setFormForn(f => ({ ...f, telefone: v }))} placeholder="(11) 99999-9999" />
                <div className="col-span-2">
                  <FieldInput label="E-mail" value={formForn.email} onChange={v => setFormForn(f => ({ ...f, email: v }))} type="email" placeholder="contato@fornecedor.com" />
                </div>
                <div className="col-span-2">
                  <FieldInput label="Nome do Contato" value={formForn.contato} onChange={v => setFormForn(f => ({ ...f, contato: v }))} placeholder="Nome da pessoa de contato" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Observações</label>
                  <textarea
                    value={formForn.observacoes}
                    onChange={e => setFormForn(f => ({ ...f, observacoes: e.target.value }))}
                    rows={3}
                    placeholder="Condições de pagamento, prazo, etc."
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2] resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0">
              {fornSel ? (
                <button onClick={excluirForn} className="text-xs text-[#5C6E84] hover:text-[#F0353D] transition-colors">
                  Desativar
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button onClick={() => setModalForn(false)} className="px-4 py-2 rounded-[9px] text-sm text-[#5C6E84] hover:text-[#D4DEEA]">Cancelar</button>
                <button
                  onClick={salvarForn}
                  disabled={savingForn}
                  className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold disabled:opacity-50"
                >
                  <Save size={14} />
                  {savingForn ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
