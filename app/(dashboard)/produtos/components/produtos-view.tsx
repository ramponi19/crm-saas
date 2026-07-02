'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Package, TrendingUp, AlertTriangle, XCircle } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import ProdutoModal from '@/app/(dashboard)/estoque/components/produto-modal'
import { Topbar } from '@/components/layout/topbar'

interface Produto {
  id: number
  nome: string
  marca_nome: string
  categoria_nome: string | null
  categoria_id: number | null
  marca_id: number | null
  estoque: number
  custo_min: number | null
  preco_max: number | null
  ativo: boolean
}

interface Props {
  produtos: Produto[]
  marcas: { id: number; nome: string }[]
  categorias: { id: number; nome: string }[]
}

const ICON_MAP: Record<string, string> = {
  apple: '🍎',
  samsung: '📱',
  xiaomi: '📱',
  motorola: '📱',
  sony: '🎧',
}

function getIcon(marca: string) {
  return ICON_MAP[marca.toLowerCase()] ?? '📦'
}

function getStatusLabel(estoque: number): { label: string; color: string; bg: string } {
  if (estoque === 0) return { label: 'Esgotado', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' }
  if (estoque <= 2) return { label: 'Estoque baixo', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' }
  return { label: 'Em estoque', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' }
}

export default function ProdutosView({ produtos: produtosInit, marcas, categorias }: Props) {
  const [produtos, setProdutos] = useState<Produto[]>(produtosInit)
  const [search, setSearch] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [produtoSel, setProdutoSel] = useState<Produto | null>(null)

  const fmt = (v: number) => formatCurrency(v)

  // Cards de summary
  const stats = useMemo(() => {
    const total = produtos.length
    const valorEstoque = produtos.reduce((acc, p) => acc + (p.preco_max ?? 0) * p.estoque, 0)
    const baixo = produtos.filter(p => p.estoque > 0 && p.estoque <= 2).length
    const esgotado = produtos.filter(p => p.estoque === 0).length
    return { total, valorEstoque, baixo, esgotado }
  }, [produtos])

  // Categorias únicas para filtro
  const categoriasUnicas = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of produtos) {
      if (p.categoria_nome) {
        const key = p.categoria_nome.replace(/^[^a-zA-Z]+/, '').trim()
        set.set(key, p.categoria_nome)
      }
    }
    return Array.from(set.entries()).map(([key, val]) => ({ key, label: val }))
  }, [produtos])

  const filtrados = useMemo(() => {
    return produtos.filter(p => {
      const matchSearch = !search ||
        p.nome.toLowerCase().includes(search.toLowerCase()) ||
        p.marca_nome.toLowerCase().includes(search.toLowerCase())
      const matchCat = filtroCategoria === 'todas' || p.categoria_nome === filtroCategoria
      return matchSearch && matchCat
    })
  }, [produtos, search, filtroCategoria])

  function abrirNovo() { setProdutoSel(null); setModalOpen(true) }
  function abrirEditar(p: Produto) { setProdutoSel(p); setModalOpen(true) }

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      <Topbar eyebrow="Catálogo" title="Produtos" />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

        {/* Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: <Package size={20} />, label: 'Produtos ativos', value: stats.total.toString(), color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
            { icon: <TrendingUp size={20} />, label: 'Valor em estoque', value: fmt(stats.valorEstoque), color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
            { icon: <AlertTriangle size={20} />, label: 'Estoque baixo', value: stats.baixo.toString(), color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
            { icon: <XCircle size={20} />, label: 'Esgotados', value: stats.esgotado.toString(), color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
          ].map((c, i) => (
            <div key={i} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-[12px] flex items-center justify-center flex-none" style={{ background: c.bg, color: c.color }}>
                {c.icon}
              </div>
              <div>
                <div className="text-[11px] font-mono text-[#788698] uppercase tracking-[0.1em]">{c.label}</div>
                <div className="text-[22px] font-serif text-[#16212E] mt-0.5 leading-none">{c.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Barra de busca + filtros + botão */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-[360px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#46586E]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, modelo ou marca..."
              className="w-full bg-white border border-[#16212E]/[0.10] rounded-[11px] py-2.5 pl-10 pr-4 text-[13px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-white/[0.2] transition-all"
            />
          </div>

          <div className="flex gap-1 p-1 bg-white border border-[#16212E]/[0.08] rounded-[11px]">
            <button
              onClick={() => setFiltroCategoria('todas')}
              className={cn('px-3.5 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all',
                filtroCategoria === 'todas' ? 'bg-[#22303F] text-white font-bold' : 'text-[#788698] hover:text-[#56657A]')}
            >
              Todos
            </button>
            {categoriasUnicas.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFiltroCategoria(label)}
                className={cn('px-3.5 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all whitespace-nowrap',
                  filtroCategoria === label ? 'bg-[#22303F] text-white font-bold' : 'text-[#788698] hover:text-[#56657A]')}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="flex-1" />
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-[#16212E] hover:bg-[#16212E] text-white text-[13px] font-semibold transition-colors shadow-[0_4px_14px_rgba(22,33,46,0.3)]"
          >
            <Plus size={16} />
            Novo produto
          </button>
        </div>

        {/* Tabela */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
          {/* Header */}
          <div className="grid gap-3 px-5 py-3 border-b border-[#16212E]/[0.08]" style={{ gridTemplateColumns: '2.4fr 1fr 0.9fr 1fr 1fr 0.8fr 1.1fr' }}>
            {['Produto', 'Condição', 'Estoque', 'Custo', 'Preço', 'Margem', 'Status'].map(h => (
              <div key={h} className="text-[10.5px] font-mono text-[#46586E] uppercase tracking-[0.12em]">{h}</div>
            ))}
          </div>

          {/* Linhas */}
          {filtrados.length === 0 ? (
            <div className="py-16 text-center text-[#788698] text-[13px]">Nenhum produto encontrado</div>
          ) : filtrados.map(p => {
            const margem = p.custo_min && p.preco_max && p.custo_min > 0
              ? Math.round(((p.preco_max - p.custo_min) / p.preco_max) * 100)
              : null
            const st = getStatusLabel(p.estoque)
            return (
              <div
                key={p.id}
                onClick={() => abrirEditar(p)}
                className="grid gap-3 px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] cursor-pointer transition-colors items-center"
                style={{ gridTemplateColumns: '2.4fr 1fr 0.9fr 1fr 1fr 0.8fr 1.1fr' }}
              >
                {/* Produto */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-[42px] h-[42px] rounded-[11px] bg-white/[0.05] flex items-center justify-center flex-none text-[22px]">
                    {getIcon(p.marca_nome)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-[#1F2A39] truncate">{p.nome}</div>
                    <div className="text-[11.5px] text-[#6B7C92]">{p.marca_nome}</div>
                  </div>
                </div>

                {/* Condição — produtos são novos por padrão */}
                <div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[rgba(107,140,255,0.12)] text-[#6B8CFF]">Novo</span>
                </div>

                {/* Estoque */}
                <div className="text-[13px] text-[#16212E] font-semibold">{p.estoque} un</div>

                {/* Custo */}
                <div className="text-[13px] text-[#788698] text-right">
                  {p.custo_min ? fmt(p.custo_min) : '—'}
                </div>

                {/* Preço */}
                <div className="text-[13.5px] text-[#16212E] font-bold text-right">
                  {p.preco_max ? fmt(p.preco_max) : '—'}
                </div>

                {/* Margem */}
                <div className="text-[13px] font-semibold text-right" style={{ color: margem ? '#34D399' : '#5C6E84' }}>
                  {margem != null ? `${margem}%` : '—'}
                </div>

                {/* Status */}
                <div className="flex items-center justify-end">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: st.bg, color: st.color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

      </div>

      {modalOpen && (
        <ProdutoModal
          produto={produtoSel ? { id: produtoSel.id, nome: produtoSel.nome, marca_id: produtoSel.marca_id, categoria_id: produtoSel.categoria_id } : null}
          marcas={marcas}
          categorias={categorias}
          onClose={() => setModalOpen(false)}
          onSaved={(saved) => {
            setProdutos(prev => {
              const exists = prev.find(p => p.id === saved.id)
              const novo: Produto = {
                id: saved.id,
                nome: saved.nome,
                marca_nome: saved.marca_nome,
                categoria_nome: saved.categoria_nome,
                marca_id: saved.marca_id,
                categoria_id: saved.categoria_id,
                estoque: exists?.estoque ?? 0,
                custo_min: exists?.custo_min ?? null,
                preco_max: exists?.preco_max ?? null,
                ativo: saved.ativo,
              }
              return exists ? prev.map(p => p.id === saved.id ? novo : p) : [...prev, novo]
            })
            setModalOpen(false)
          }}
          onDeleted={(id) => setProdutos(prev => prev.filter(p => p.id !== id))}
        />
      )}
    </div>
  )
}
