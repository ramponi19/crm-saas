'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import ProdutoModal from '@/app/(dashboard)/estoque/components/produto-modal'
import { Topbar } from '@/components/layout/topbar'
import { Card, Table, StatCard, Tabs, Input, Button, Badge, EmptyState, type Column, type TabItem } from '@/components/ui'

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

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'PR'
}

function statusBadge(estoque: number) {
  if (estoque === 0) return <Badge tone="bad">Esgotado</Badge>
  if (estoque <= 2) return <Badge tone="warn">Estoque baixo</Badge>
  return <Badge tone="ok" dot>Em estoque</Badge>
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

  const catTabs: TabItem[] = useMemo(() => [
    { value: 'todas', label: 'Todos' },
    ...categoriasUnicas.map(({ key, label }) => ({ value: label, label: key })),
  ], [categoriasUnicas])

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

  const cols: Column<Produto>[] = [
    {
      key: 'produto', header: 'Produto',
      render: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink text-[11px] font-bold text-white">
            {getInitials(p.nome)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{p.nome}</div>
            <div className="truncate text-[11px] text-ink-3">{p.marca_nome}</div>
          </div>
        </div>
      ),
    },
    { key: 'condicao', header: 'Condição', hideOnMobile: true, render: () => <Badge tone="acc">Novo</Badge> },
    { key: 'estoque', header: 'Estoque', className: 'num', render: (p) => <span className="font-semibold text-ink">{p.estoque} un</span> },
    { key: 'custo', header: 'Custo', align: 'right', hideOnMobile: true, className: 'num', render: (p) => p.custo_min ? <span className="text-ink-2">{fmt(p.custo_min)}</span> : <span className="text-ink-3">—</span> },
    { key: 'preco', header: 'Preço', align: 'right', className: 'num', render: (p) => p.preco_max ? <span className="font-semibold text-ink">{fmt(p.preco_max)}</span> : <span className="text-ink-3">—</span> },
    {
      key: 'margem', header: 'Margem', align: 'right', hideOnMobile: true, className: 'num',
      render: (p) => {
        const margem = p.custo_min && p.preco_max && p.custo_min > 0
          ? Math.round(((p.preco_max - p.custo_min) / p.preco_max) * 100)
          : null
        return margem != null ? <span className="font-semibold text-ok">{margem}%</span> : <span className="text-ink-3">—</span>
      },
    },
    { key: 'status', header: 'Status', align: 'right', render: (p) => statusBadge(p.estoque) },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Produtos" />

      <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="space-y-5">

          {/* Cards de summary */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            <StatCard bare label="Produtos ativos" value={stats.total} />
            <StatCard bare label="Valor em estoque" value={fmt(stats.valorEstoque)} />
            <StatCard bare label="Estoque baixo" value={stats.baixo} />
            <StatCard bare label="Esgotados" value={stats.esgotado} />
          </div>

          {/* Busca + botão */}
          <div className="flex items-center gap-3">
            <Input
              wrapperClassName="flex-1 max-w-[360px]"
              icon={<Search size={15} strokeWidth={1.7} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, modelo ou marca…"
            />
            <div className="flex-1" />
            <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={abrirNovo}>Novo produto</Button>
          </div>

          {/* Filtro por categoria */}
          <Tabs items={catTabs} value={filtroCategoria} onValueChange={setFiltroCategoria} />

          {/* Tabela */}
          <Card flush>
            <Table
              columns={cols}
              rows={filtrados}
              rowKey={(p) => p.id}
              onRowClick={abrirEditar}
              empty={<EmptyState icon={<Package size={22} strokeWidth={1.7} />} title="Nenhum produto encontrado" description={search ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro produto.'} action={!search ? <Button size="sm" onClick={abrirNovo}>Novo produto</Button> : undefined} />}
            />
          </Card>

        </div>
      </main>

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
