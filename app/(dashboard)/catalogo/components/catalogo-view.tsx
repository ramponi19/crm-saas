'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Tag, Package, MoreHorizontal, X } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { toast } from 'sonner'

interface Produto {
  id: number
  nome: string
  marca_id: number | null
  marca_nome: string
  categoria_id: number | null
  categoria_nome: string | null
  subcategoria_nome: string | null
  preco_novo: number | null
  preco_usado: number | null
}

interface Unidade {
  id: number
  produto_nome: string
  imei: string | null
  numero_serie: string | null
  estado: string | null
  tipo: string | null
  preco_custo: number | null
  custo_reparo: number | null
  preco_venda: number | null
  status: string | null
  created_at: string
}

interface Categoria {
  id: number
  nome: string
  total_produtos: number
  subcategorias: string[]
}

interface Marca {
  id: number
  nome: string
  total_produtos: number
}

interface TabelaPreco {
  id: number
  modelo: string
  armazenamento: string | null
  condicao: string
  preco_sugerido: number
  observacoes: string | null
}

interface Props {
  produtos: Produto[]
  unidades: Unidade[]
  categorias: Categoria[]
  marcas: Marca[]
  tabelaPrecos: TabelaPreco[]
}

type Tab = 'produtos' | 'estoque' | 'categorias' | 'marcas' | 'tabela'

const fmt = (v: number) => formatCurrency(v)

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  disponivel: { label: 'Disponível', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  reservado:  { label: 'Reservado',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  vendido:    { label: 'Vendido',    color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' },
  assistencia:{ label: 'Em reparo',  color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
}

const COND_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  lacrado:    { label: 'Lacrado',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  excelente:  { label: 'Excelente', color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)' },
  bom:        { label: 'Bom',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  regular:    { label: 'Regular',   color: '#F0353D', bg: 'rgba(240,53,61,0.12)' },
}

const MARCA_ICON: Record<string, string> = {
  apple: '⌘', samsung: '◈', xiaomi: '◉', motorola: '◎',
  sony: '◐', lg: '◑', anker: '◒', asus: '◓',
}

export default function CatalogoView({ produtos: produtosInit, unidades, categorias, marcas, tabelaPrecos: tabelaInit }: Props) {
  const [tab, setTab] = useState<Tab>('produtos')
  const produtos = produtosInit
  const [tabela, setTabela] = useState(tabelaInit)
  const searchProd: string = ''
  const [searchEst, setSearchEst] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [modalPreco, setModalPreco] = useState(false)
  const [precoForm, setPrecoForm] = useState({ modelo: '', armazenamento: '', condicao: 'lacrado', preco_sugerido: '', observacoes: '' })
  const [saving, setSaving] = useState(false)

  const TABS = [
    { key: 'produtos' as Tab, label: 'Lista de Produtos',  icon: <Package size={13} /> },
    { key: 'estoque'  as Tab, label: 'Lista de Estoque',   icon: <Package size={13} /> },
    { key: 'categorias' as Tab, label: 'Categorias',       icon: <Tag size={13} /> },
    { key: 'marcas'   as Tab, label: 'Marcas',             icon: <Tag size={13} /> },
    { key: 'tabela'   as Tab, label: 'Tabela de Preços',   icon: <Tag size={13} /> },
  ]

  const categsUnicas = useMemo(() => [...new Set(produtos.map(p => p.categoria_nome).filter(Boolean))], [produtos])

  const prodsFiltrados = useMemo(() => produtos.filter(p => {
    const ms = !searchProd || p.nome.toLowerCase().includes(searchProd.toLowerCase()) || p.marca_nome.toLowerCase().includes(searchProd.toLowerCase())
    const mc = filtroCategoria === 'todas' || p.categoria_nome === filtroCategoria
    return ms && mc
  }), [produtos, searchProd, filtroCategoria])

  const unidadesFiltradas = useMemo(() => unidades.filter(u =>
    !searchEst || u.produto_nome.toLowerCase().includes(searchEst.toLowerCase()) || (u.imei ?? '').includes(searchEst)
  ), [unidades, searchEst])

  async function salvarPreco() {
    if (!precoForm.modelo || !precoForm.preco_sugerido) { toast.error('Modelo e preço são obrigatórios'); return }
    setSaving(true)
    // Tabela de preços usa inventario_unidades de referência ou uma tabela dedicada
    // Usamos a tabela tabelaprecos se existir, senão só atualiza localmente
    const novo: TabelaPreco = {
      id: Date.now(),
      modelo: precoForm.modelo,
      armazenamento: precoForm.armazenamento || null,
      condicao: precoForm.condicao,
      preco_sugerido: Number(precoForm.preco_sugerido),
      observacoes: precoForm.observacoes || null,
    }
    setTabela(prev => [novo, ...prev])
    setModalPreco(false)
    setPrecoForm({ modelo: '', armazenamento: '', condicao: 'lacrado', preco_sugerido: '', observacoes: '' })
    toast.success('Preço adicionado!')
    setSaving(false)
  }

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      <Topbar eyebrow="Catálogo" title="Catálogo" />

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

        {/* ── LISTA DE PRODUTOS ── */}
        {tab === 'produtos' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 p-1 bg-white border border-[#16212E]/[0.08] rounded-[11px]">
                <button onClick={() => setFiltroCategoria('todas')}
                  className={cn('px-3.5 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all',
                    filtroCategoria === 'todas' ? 'bg-[#E03037] text-white' : 'text-[#788698] hover:text-[#56657A]')}>
                  Todos
                </button>
                {categsUnicas.map(c => {
                  const clean = (c ?? '').replace(/^[^\w]+/, '').split(' ')[0]
                  return (
                    <button key={c} onClick={() => setFiltroCategoria(c ?? 'todas')}
                      className={cn('px-3.5 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all whitespace-nowrap',
                        filtroCategoria === c ? 'bg-[#E03037] text-white' : 'text-[#788698] hover:text-[#56657A]')}>
                      {clean}
                    </button>
                  )
                })}
              </div>
              <div className="flex-1" />
              <button onClick={() => window.location.href = '/produtos'}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold transition-colors shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
                <Plus size={15} /> Cadastrar produto
              </button>
            </div>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
              <div className="grid px-5 py-3 border-b border-[#16212E]/[0.08]"
                style={{ gridTemplateColumns: '1.2fr 1fr 1fr 2fr 1fr 1fr' }}>
                {['Categoria','Subcategoria','Marca','Nome','Novo','Usado'].map(h => (
                  <div key={h} className="text-[10.5px] font-mono text-[#46586E] uppercase tracking-[0.12em]">{h}</div>
                ))}
              </div>
              {prodsFiltrados.length === 0
                ? <div className="py-14 text-center text-[#788698] text-[13px]">Nenhum produto encontrado</div>
                : prodsFiltrados.map(p => (
                  <div key={p.id} className="grid px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] cursor-pointer transition-colors items-center"
                    style={{ gridTemplateColumns: '1.2fr 1fr 1fr 2fr 1fr 1fr' }}
                    onClick={() => window.location.href = '/produtos'}>
                    <div className="text-[12.5px] text-[#788698]">{p.categoria_nome?.replace(/^[^\w]+/, '') ?? '—'}</div>
                    <div className="text-[12.5px] text-[#6B7C92]">{p.subcategoria_nome ?? '—'}</div>
                    <div className="text-[12.5px] text-[#788698]">{p.marca_nome}</div>
                    <div className="text-[13.5px] font-semibold text-[#1F2A39]">{p.nome}</div>
                    <div className="text-[13px] font-bold text-[#16212E]">{p.preco_novo ? fmt(p.preco_novo) : '—'}</div>
                    <div className="text-[13px] text-[#6B8CFF]">{p.preco_usado ? fmt(p.preco_usado) : '—'}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── LISTA DE ESTOQUE ── */}
        {tab === 'estoque' && (
          <div className="space-y-4">
            <div className="relative max-w-full">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#46586E]" />
              <input value={searchEst} onChange={e => setSearchEst(e.target.value)}
                placeholder="Buscar por produto, IMEI ou número de série..."
                className="w-full bg-white border border-[#16212E]/[0.10] rounded-[11px] py-2.5 pl-10 pr-4 text-[13px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-white/[0.2]" />
            </div>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
              <div className="grid px-5 py-3 border-b border-[#16212E]/[0.08]"
                style={{ gridTemplateColumns: '0.8fr 2fr 1.4fr 1fr 1fr 1fr 1fr 1fr' }}>
                {['Data','Produto','IMEI','Estado','Tipo','Custo Total','Venda','Status'].map(h => (
                  <div key={h} className="text-[10.5px] font-mono text-[#46586E] uppercase tracking-[0.12em]">{h}</div>
                ))}
              </div>
              {unidadesFiltradas.length === 0
                ? <div className="py-14 text-center text-[#788698] text-[13px]">Nenhuma unidade encontrada</div>
                : unidadesFiltradas.map(u => {
                  const st = STATUS_STYLE[u.status ?? 'disponivel'] ?? STATUS_STYLE.disponivel
                  const cond = COND_STYLE[u.estado ?? 'lacrado'] ?? COND_STYLE.lacrado
                  const custoTotal = (u.preco_custo ?? 0) + (u.custo_reparo ?? 0)
                  const imei = u.imei ? u.imei.slice(0,3)+' '+u.imei.slice(3,5)+'•••• '+u.imei.slice(-4) : u.numero_serie ?? '—'
                  const data = new Date(u.created_at)
                  const dataFmt = `${String(data.getDate()).padStart(2,'0')}/${String(data.getMonth()+1).padStart(2,'0')}`
                  return (
                    <div key={u.id} className="grid px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] items-center"
                      style={{ gridTemplateColumns: '0.8fr 2fr 1.4fr 1fr 1fr 1fr 1fr 1fr' }}>
                      <div className="text-[12px] text-[#6B7C92] font-mono">{dataFmt}</div>
                      <div className="text-[13.5px] font-semibold text-[#1F2A39] truncate">{u.produto_nome}</div>
                      <div className="text-[12px] text-[#788698] font-mono">{imei}</div>
                      <div><span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: cond.bg, color: cond.color }}>{cond.label}</span></div>
                      <div className="text-[12.5px] text-[#788698] capitalize">{u.tipo ?? '—'}</div>
                      <div className="text-[13px] text-[#788698]">{custoTotal > 0 ? fmt(custoTotal) : '—'}</div>
                      <div className="text-[13.5px] font-bold text-[#16212E]">{u.preco_venda ? fmt(u.preco_venda) : '—'}</div>
                      <div><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: st.bg, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />{st.label}
                      </span></div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* ── CATEGORIAS ── */}
        {tab === 'categorias' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => window.location.href = '/configuracoes'}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold transition-colors shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
                <Plus size={15} /> Nova categoria
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {categorias.map(c => (
                <div key={c.id} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5 hover:bg-[#16212E]/[0.03] cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-[11px] bg-[rgba(215,40,47,0.12)] flex items-center justify-center mb-4">
                    <Package size={18} className="text-[#F0353D]" />
                  </div>
                  <div className="text-[15px] font-semibold text-[#16212E]">{c.nome}</div>
                  <div className="text-[12px] text-[#788698] mt-1">{c.total_produtos} produtos</div>
                  {c.subcategorias.length > 0 && (
                    <div className="text-[11.5px] text-[#46586E] mt-2 truncate">
                      Subcategorias: {c.subcategorias.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
              {categorias.length === 0 && (
                <div className="col-span-4 py-14 text-center text-[#788698] text-[13px]">Nenhuma categoria cadastrada</div>
              )}
            </div>
          </div>
        )}

        {/* ── MARCAS ── */}
        {tab === 'marcas' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => window.location.href = '/configuracoes'}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold transition-colors shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
                <Plus size={15} /> Nova marca
              </button>
            </div>
            <div className="grid grid-cols-5 gap-4">
              {marcas.filter(m => m.total_produtos > 0).map(m => (
                <div key={m.id} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6 flex flex-col items-center gap-3 hover:bg-[#16212E]/[0.03] cursor-pointer transition-colors">
                  <div className="w-12 h-12 rounded-[13px] bg-white/[0.05] flex items-center justify-center text-[24px] text-[#9FB0C2]">
                    {MARCA_ICON[m.nome.toLowerCase()] ?? '◻'}
                  </div>
                  <div className="text-[14px] font-semibold text-[#16212E]">{m.nome}</div>
                  <div className="text-[12px] text-[#788698]">{m.total_produtos} produtos</div>
                </div>
              ))}
              {marcas.filter(m => m.total_produtos > 0).length === 0 && (
                <div className="col-span-5 py-14 text-center text-[#788698] text-[13px]">Nenhuma marca com produtos</div>
              )}
            </div>
          </div>
        )}

        {/* ── TABELA DE PREÇOS ── */}
        {tab === 'tabela' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setModalPreco(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[11px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold transition-colors shadow-[0_4px_14px_rgba(215,40,47,0.3)]">
                <Plus size={15} /> Novo preço
              </button>
            </div>

            <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
              <div className="grid px-5 py-3 border-b border-[#16212E]/[0.08]"
                style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1.2fr 2fr 0.3fr' }}>
                {['Modelo','Armazenamento','Condição','Preço Sugerido','Observações',''].map(h => (
                  <div key={h} className="text-[10.5px] font-mono text-[#46586E] uppercase tracking-[0.12em]">{h}</div>
                ))}
              </div>
              {tabela.length === 0
                ? <div className="py-14 text-center text-[#788698] text-[13px]">Nenhum preço cadastrado. Clique em &quot;+ Novo preço&quot; para começar.</div>
                : tabela.map(t => {
                  const cond = COND_STYLE[t.condicao] ?? COND_STYLE.lacrado
                  return (
                    <div key={t.id} className="grid px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] items-center"
                      style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1.2fr 2fr 0.3fr' }}>
                      <div className="text-[13.5px] font-semibold text-[#1F2A39]">{t.modelo}</div>
                      <div className="text-[12.5px] text-[#788698]">{t.armazenamento ?? '—'}</div>
                      <div><span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: cond.bg, color: cond.color }}>{cond.label}</span></div>
                      <div className="text-[13.5px] font-bold text-[#16212E]">{fmt(t.preco_sugerido)}</div>
                      <div className="text-[12.5px] text-[#6B7C92] truncate">{t.observacoes ?? '—'}</div>
                      <button className="text-[#46586E] hover:text-[#9FB0C2] transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* Modal Novo Preço */}
      {modalPreco && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-[460px] bg-[#F0F2F5] border border-[#16212E]/[0.10] rounded-[20px] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08]">
              <h2 className="text-[16px] font-serif text-[#16212E]">Novo preço de referência</h2>
              <button onClick={() => setModalPreco(false)} className="text-[#788698] hover:text-[#9FB0C2]"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); salvarPreco() }}>
            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'Modelo *', key: 'modelo', placeholder: 'Ex: iPhone 15 Pro Max' },
                { label: 'Armazenamento', key: 'armazenamento', placeholder: 'Ex: 256GB' },
                { label: 'Preço Sugerido *', key: 'preco_sugerido', placeholder: '0.00', type: 'number' },
                { label: 'Observações', key: 'observacoes', placeholder: 'Ex: Seminovo grade A' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[10.5px] font-mono text-[#788698] uppercase tracking-[0.12em] mb-1.5">{f.label}</label>
                  <input type={f.type ?? 'text'} value={(precoForm as Record<string, string>)[f.key]}
                    onChange={e => setPrecoForm(pf => ({ ...pf, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-[#F4F6F9] border border-[#16212E]/[0.10] rounded-[9px] px-3 py-2.5 text-[13px] text-[#56657A] placeholder:text-[#9AA7B6] outline-none focus:border-white/[0.2]" />
                </div>
              ))}
              <div>
                <label className="block text-[10.5px] font-mono text-[#788698] uppercase tracking-[0.12em] mb-1.5">Condição</label>
                <div className="flex gap-2">
                  {['lacrado','excelente','bom','regular'].map(c => (
                    <button type="button" key={c} onClick={() => setPrecoForm(pf => ({ ...pf, condicao: c }))}
                      className={cn('px-3 py-2 rounded-[9px] text-[12px] font-medium transition-all border capitalize',
                        precoForm.condicao === c ? 'bg-[#D7282F] text-white border-[#D7282F]' : 'text-[#788698] border-[#16212E]/[0.10] hover:border-white/[0.2]')}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#16212E]/[0.08]">
              <button type="button" onClick={() => setModalPreco(false)} className="px-4 py-2 text-[13px] text-[#788698] hover:text-[#56657A]">Cancelar</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C01F26] text-white text-[13px] font-semibold disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
