'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Package, AlertTriangle, TrendingUp, DollarSign, ChevronRight, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import UnidadeModal from './unidade-modal'
import ProdutoModal from './produto-modal'

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
  observacoes: string | null
  created_at: string
}

interface ProdutoCat {
  id: number
  nome: string
  marca_id: number | null
  marca_nome: string
  categoria_id: number | null
  categoria_nome: string | null
  ativo: boolean
}

interface Props {
  itens: Unidade[]
  marcas: { id: number; nome: string }[]
  categorias: { id: number; nome: string }[]
  produtos: ProdutoCat[]
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  disponivel: { label: 'Disponível', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  reservado:  { label: 'Reservado',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  vendido:    { label: 'Vendido',    color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' },
  assistencia:{ label: 'Assistência',color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
}

export default function EstoqueView({ itens, marcas, categorias, produtos: produtosInit }: Props) {
  const [tab, setTab] = useState<'unidades' | 'produtos'>('unidades')

  // --- Unidades ---
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroMarca, setFiltroMarca] = useState<string>('todas')
  const [modalUnidade, setModalUnidade] = useState(false)
  const [unidadeSel, setUnidadeSel] = useState<Unidade | null>(null)

  // --- Produtos ---
  const [produtos, setProdutos] = useState<ProdutoCat[]>(produtosInit)
  const [searchProd, setSearchProd] = useState('')
  const [filtroMarcaProd, setFiltroMarcaProd] = useState('todas')
  const [modalProduto, setModalProduto] = useState(false)
  const [produtoSel, setProdutoSel] = useState<ProdutoCat | null>(null)

  const stats = useMemo(() => {
    const disponiveis = itens.filter(i => i.status === 'disponivel')
    const valorEstoque = disponiveis.reduce((acc, i) => acc + (i.preco_venda ?? 0), 0)
    const semIMEI = disponiveis.filter(i => !i.imei && !i.numero_serie).length
    return { total: itens.length, disponiveis: disponiveis.length, valorEstoque, semIMEI }
  }, [itens])

  const filtrados = useMemo(() => {
    return itens.filter(i => {
      const matchSearch = !search ||
        i.produto_nome.toLowerCase().includes(search.toLowerCase()) ||
        i.marca_nome.toLowerCase().includes(search.toLowerCase()) ||
        (i.imei ?? '').includes(search) ||
        (i.numero_serie ?? '').includes(search) ||
        (i.cor ?? '').toLowerCase().includes(search.toLowerCase())
      const matchStatus = filtroStatus === 'todos' || i.status === filtroStatus
      const matchMarca = filtroMarca === 'todas' || i.marca_nome === filtroMarca
      return matchSearch && matchStatus && matchMarca
    })
  }, [itens, search, filtroStatus, filtroMarca])

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p => {
      const matchSearch = !searchProd ||
        p.nome.toLowerCase().includes(searchProd.toLowerCase()) ||
        p.marca_nome.toLowerCase().includes(searchProd.toLowerCase())
      const matchMarca = filtroMarcaProd === 'todas' || p.marca_nome === filtroMarcaProd
      return matchSearch && matchMarca
    })
  }, [produtos, searchProd, filtroMarcaProd])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#F4F6F9]">Estoque</h1>
            <p className="text-sm text-[#5C6E84] mt-0.5">
              {tab === 'unidades' ? `${itens.length} unidades cadastradas` : `${produtos.length} modelos cadastrados`}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
            {([['unidades', 'Unidades'], ['produtos', 'Produtos']] as const).map(([key, label]) => (
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
          onClick={() => {
            if (tab === 'unidades') { setUnidadeSel(null); setModalUnidade(true) }
            else { setProdutoSel(null); setModalProduto(true) }
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          {tab === 'unidades' ? 'Adicionar Unidade' : 'Novo Produto'}
        </button>
      </div>

      {tab === 'unidades' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 px-8 py-5 shrink-0">
            {[
              { label: 'Total Unidades', value: stats.total, icon: Package, color: '#6B8CFF' },
              { label: 'Disponíveis', value: stats.disponiveis, icon: TrendingUp, color: '#22C55E' },
              { label: 'Valor em Estoque', value: fmt(stats.valorEstoque), icon: DollarSign, color: '#F59E0B' },
              { label: 'Sem ID / IMEI', value: stats.semIMEI, icon: AlertTriangle, color: stats.semIMEI > 0 ? '#F0353D' : '#5C6E84' },
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
                placeholder="Buscar por modelo, IMEI, cor..."
                className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
              />
            </div>
            <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'disponivel', label: 'Disponível' },
                { key: 'reservado', label: 'Reservado' },
                { key: 'assistencia', label: 'Assistência' },
                { key: 'vendido', label: 'Vendido' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFiltroStatus(f.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all',
                    filtroStatus === f.key ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={filtroMarca}
              onChange={e => setFiltroMarca(e.target.value)}
              className="bg-[#0D1824] border border-white/[0.06] rounded-[10px] px-3 py-2 text-xs text-[#8A9BB0] outline-none"
            >
              <option value="todas">Todas as marcas</option>
              {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
            </select>
          </div>

          {/* Tabela Unidades */}
          <div className="flex-1 overflow-y-auto px-8 pb-6">
            <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Produto', 'IMEI / Série', 'Cor / Armazenamento', 'Bateria', 'Status', 'Custo', 'Venda', ''].map(h => (
                      <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase px-4 py-3.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-[#3F516A] text-sm">
                        Nenhuma unidade encontrada
                      </td>
                    </tr>
                  ) : filtrados.map(item => {
                    const st = STATUS_LABELS[item.status ?? ''] ?? STATUS_LABELS.disponivel
                    return (
                      <tr
                        key={item.id}
                        onClick={() => { setUnidadeSel(item); setModalUnidade(true) }}
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <div>
                            <div className="text-sm font-semibold text-[#E9EEF4]">{item.produto_nome}</div>
                            <div className="text-[11px] text-[#5C6E84]">{item.marca_nome}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs text-[#8A9BB0]">
                            {item.imei ?? item.numero_serie ?? <span className="text-[#F59E0B]">Sem ID</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs text-[#8A9BB0]">
                            {[item.cor, item.armazenamento].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {item.bateria ? (
                            <span className={cn('text-xs font-mono', Number(item.bateria) < 80 ? 'text-[#F59E0B]' : 'text-[#22C55E]')}>
                              {item.bateria}%
                            </span>
                          ) : <span className="text-[#3F516A] text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: st.color, background: st.bg }}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-[#8A9BB0]">{item.preco_custo ? fmt(item.preco_custo) : '—'}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-semibold text-[#F4F6F9]">{item.preco_venda ? fmt(item.preco_venda) : '—'}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <ChevronRight size={15} className="text-[#3F516A]" />
                        </td>
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
          {/* Filtros Produtos */}
          <div className="flex items-center gap-3 px-8 py-5 shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3F516A]" />
              <input
                value={searchProd}
                onChange={e => setSearchProd(e.target.value)}
                placeholder="Buscar por modelo ou marca..."
                className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
              />
            </div>
            <select
              value={filtroMarcaProd}
              onChange={e => setFiltroMarcaProd(e.target.value)}
              className="bg-[#0D1824] border border-white/[0.06] rounded-[10px] px-3 py-2 text-xs text-[#8A9BB0] outline-none"
            >
              <option value="todas">Todas as marcas</option>
              {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
            </select>
            <div className="text-xs text-[#5C6E84]">{produtosFiltrados.length} modelos</div>
          </div>

          {/* Grid Produtos */}
          <div className="flex-1 overflow-y-auto px-8 pb-6">
            {produtosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[#3F516A]">
                <Tag size={40} className="mb-3 opacity-40" />
                <p className="text-sm">Nenhum produto encontrado</p>
              </div>
            ) : (
              <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Modelo', 'Marca', 'Categoria', 'Unidades', ''].map(h => (
                        <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase px-5 py-3.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {produtosFiltrados.map(p => {
                      const unidadesCount = itens.filter(u => u.produto_id === p.id).length
                      const dispCount = itens.filter(u => u.produto_id === p.id && u.status === 'disponivel').length
                      return (
                        <tr
                          key={p.id}
                          onClick={() => { setProdutoSel(p); setModalProduto(true) }}
                          className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-[9px] bg-[rgba(107,140,255,0.1)] flex items-center justify-center">
                                <Package size={14} className="text-[#6B8CFF]" />
                              </div>
                              <span className="text-sm font-semibold text-[#E9EEF4]">{p.nome}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-[#8A9BB0]">{p.marca_nome}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-[#5C6E84]">{p.categoria_nome ?? '—'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#F4F6F9]">{unidadesCount}</span>
                              {dispCount > 0 && (
                                <span className="text-[10px] text-[#22C55E] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 rounded-full">
                                  {dispCount} disp.
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <ChevronRight size={15} className="text-[#3F516A]" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalUnidade && (
        <UnidadeModal unidade={unidadeSel as any} onClose={() => setModalUnidade(false)} />
      )}

      {modalProduto && (
        <ProdutoModal
          produto={produtoSel}
          marcas={marcas}
          categorias={categorias}
          onClose={() => setModalProduto(false)}
          onSaved={(p) => setProdutos(prev =>
            produtoSel ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]
          )}
          onDeleted={(id) => setProdutos(prev => prev.filter(x => x.id !== id))}
        />
      )}
    </div>
  )
}
