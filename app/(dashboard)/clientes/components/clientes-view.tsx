'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Users, TrendingUp, DollarSign, UserCheck, Phone, Mail, MapPin, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import ClienteModal from './cliente-modal'

interface ClienteComStats {
  id: number
  nome: string
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
  cidade: string | null
  estado: string | null
  tipo_cliente: string | null
  origem_cliente: string | null
  created_at: string
  total_vendas: number
  valor_total: number
  ultima_compra: string | null
  ativo: boolean
}

interface Props {
  clientes: ClienteComStats[]
}

export default function ClientesView({ clientes }: Props) {
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteComStats | null>(null)
  const [novoCliente, setNovoCliente] = useState(false)

  const stats = useMemo(() => {
    const total = clientes.length
    const comCompras = clientes.filter(c => c.total_vendas > 0).length
    const recorrentes = clientes.filter(c => c.total_vendas > 1).length
    const valorTotal = clientes.reduce((acc, c) => acc + c.valor_total, 0)
    return { total, comCompras, recorrentes, valorTotal }
  }, [clientes])

  const filtrados = useMemo(() => {
    return clientes.filter(c => {
      const matchSearch = !search ||
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.telefone ?? '').includes(search) ||
        (c.cpf_cnpj ?? '').includes(search)
      const matchTipo = filtroTipo === 'todos' ||
        (filtroTipo === 'compradores' && c.total_vendas > 0) ||
        (filtroTipo === 'recorrentes' && c.total_vendas > 1) ||
        (filtroTipo === 'novos' && c.total_vendas === 0)
      return matchSearch && matchTipo
    })
  }, [clientes, search, filtroTipo])

  function openCliente(c: ClienteComStats) {
    setClienteSelecionado(c)
    setNovoCliente(false)
    setModalOpen(true)
  }

  function openNovo() {
    setClienteSelecionado(null)
    setNovoCliente(true)
    setModalOpen(true)
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtData = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.06] shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#F4F6F9]">Clientes</h1>
          <p className="text-sm text-[#5C6E84] mt-0.5">{clientes.length} cadastrados</p>
        </div>
        <button
          onClick={openNovo}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 px-8 py-5 shrink-0">
        {[
          { label: 'Total', value: stats.total, icon: Users, color: '#6B8CFF' },
          { label: 'Compradores', value: stats.comCompras, icon: UserCheck, color: '#22C55E' },
          { label: 'Recorrentes', value: stats.recorrentes, icon: TrendingUp, color: '#F59E0B' },
          { label: 'Receita Total', value: fmt(stats.valorTotal), icon: DollarSign, color: '#D7282F' },
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
            placeholder="Buscar por nome, e-mail, telefone ou CPF..."
            className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'compradores', label: 'Compradores' },
            { key: 'recorrentes', label: 'Recorrentes' },
            { key: 'novos', label: 'Sem compra' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltroTipo(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all',
                filtroTipo === f.key
                  ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]'
                  : 'text-[#5C6E84] hover:text-[#8A9BB0]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Cliente', 'Contato', 'Localização', 'Compras', 'Valor Total', 'Última Compra', ''].map(h => (
                  <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase px-5 py-3.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-[#3F516A] text-sm">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : filtrados.map(c => (
                <tr
                  key={c.id}
                  onClick={() => openCliente(c)}
                  className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-[#1A2D45] to-[#0F1E2E] flex items-center justify-center text-xs font-bold text-[#6B8CFF] shrink-0">
                        {c.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#E9EEF4]">{c.nome}</div>
                        {c.tipo_cliente && (
                          <div className="text-[10px] text-[#5C6E84]">{c.tipo_cliente}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="space-y-0.5">
                      {c.telefone && (
                        <div className="flex items-center gap-1.5 text-xs text-[#8A9BB0]">
                          <Phone size={11} className="text-[#3F516A]" />
                          {c.telefone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-xs text-[#8A9BB0] max-w-[180px] truncate">
                          <Mail size={11} className="text-[#3F516A] shrink-0" />
                          {c.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {(c.cidade || c.estado) ? (
                      <div className="flex items-center gap-1.5 text-xs text-[#8A9BB0]">
                        <MapPin size={11} className="text-[#3F516A]" />
                        {[c.cidade, c.estado].filter(Boolean).join(', ')}
                      </div>
                    ) : <span className="text-[#3F516A] text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      'font-mono text-sm font-semibold',
                      c.total_vendas > 0 ? 'text-[#22C55E]' : 'text-[#3F516A]'
                    )}>
                      {c.total_vendas}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-semibold text-[#F4F6F9]">{fmt(c.valor_total)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-[#8A9BB0]">{fmtData(c.ultima_compra)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <ChevronRight size={15} className="text-[#3F516A]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ClienteModal
          cliente={clienteSelecionado as any}
          isNew={novoCliente}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
