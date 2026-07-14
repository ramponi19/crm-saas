'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Tag, Package, MoreHorizontal } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import ProdutoModal from '@/app/(dashboard)/estoque/components/produto-modal'
import {
  Button,
  IconButton,
  Input,
  Select,
  Modal,
  Table,
  Card,
  Badge,
  Tabs,
  EmptyState,
  notify,
  type Column,
  type TabItem,
} from '@/components/ui'

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
type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

const fmt = (v: number) => formatCurrency(v)

const STATUS: Record<string, { label: string; tone: Tone }> = {
  disponivel: { label: 'Disponível', tone: 'ok' },
  reservado: { label: 'Reservado', tone: 'warn' },
  vendido: { label: 'Vendido', tone: 'neutro' },
  assistencia: { label: 'Em reparo', tone: 'acc' },
}

const COND: Record<string, { label: string; tone: Tone }> = {
  lacrado: { label: 'Lacrado', tone: 'ok' },
  excelente: { label: 'Excelente', tone: 'acc' },
  bom: { label: 'Bom', tone: 'warn' },
  regular: { label: 'Regular', tone: 'bad' },
}

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
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
  const router = useRouter()
  const [editProd, setEditProd] = useState<Produto | 'new' | null>(null)

  const marcasVisiveis = marcas.filter((m) => m.total_produtos > 0)

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
    if (!precoForm.modelo || !precoForm.preco_sugerido) { notify.bad('Modelo e preço são obrigatórios'); return }
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
    notify.ok('Preço adicionado!')
    setSaving(false)
  }

  // Estoque tem módulo próprio (/estoque) — não duplica aqui.
  const TABS: TabItem[] = [
    { value: 'produtos', label: 'Produtos', badge: produtos.length || undefined },
    { value: 'categorias', label: 'Categorias', badge: categorias.length || undefined },
    { value: 'marcas', label: 'Marcas', badge: marcasVisiveis.length || undefined },
    { value: 'tabela', label: 'Tabela de preços', badge: tabela.length || undefined },
  ]

  const categTabs: TabItem[] = [
    { value: 'todas', label: 'Todos' },
    ...categsUnicas.map((c) => ({ value: c ?? 'todas', label: (c ?? '').replace(/^[^\w]+/, '').split(' ')[0] })),
  ]

  const colsProdutos: Column<Produto>[] = [
    { key: 'categoria', header: 'Categoria', render: (p) => <span className="text-ink-2">{p.categoria_nome?.replace(/^[^\w]+/, '') ?? '—'}</span> },
    { key: 'subcategoria', header: 'Subcategoria', hideOnMobile: true, render: (p) => <span className="text-ink-2">{p.subcategoria_nome ?? '—'}</span> },
    { key: 'marca', header: 'Marca', hideOnMobile: true, render: (p) => <span className="text-ink-2">{p.marca_nome}</span> },
    { key: 'nome', header: 'Nome', render: (p) => <span className="font-semibold text-ink">{p.nome}</span> },
    { key: 'novo', header: 'Novo', align: 'right', className: 'num', render: (p) => p.preco_novo ? <span className="font-semibold text-ink">{fmt(p.preco_novo)}</span> : <span className="text-ink-3">—</span> },
    { key: 'usado', header: 'Usado', align: 'right', className: 'num', render: (p) => p.preco_usado ? <span className="text-ink-2">{fmt(p.preco_usado)}</span> : <span className="text-ink-3">—</span> },
  ]

  const colsEstoque: Column<Unidade>[] = [
    {
      key: 'data', header: 'Data', className: 'num w-[80px]',
      render: (u) => { const d = new Date(u.created_at); return <span className="text-ink-2">{`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`}</span> },
    },
    { key: 'produto', header: 'Produto', render: (u) => <span className="truncate font-semibold text-ink">{u.produto_nome}</span> },
    {
      key: 'imei', header: 'IMEI', hideOnMobile: true, className: 'num',
      render: (u) => <span className="text-ink-2">{u.imei ? u.imei.slice(0, 3) + ' ' + u.imei.slice(3, 5) + '•••• ' + u.imei.slice(-4) : u.numero_serie ?? '—'}</span>,
    },
    { key: 'estado', header: 'Estado', render: (u) => { const c = COND[u.estado ?? 'lacrado'] ?? COND.lacrado; return <Badge tone={c.tone}>{c.label}</Badge> } },
    { key: 'tipo', header: 'Tipo', hideOnMobile: true, render: (u) => <span className="capitalize text-ink-2">{u.tipo ?? '—'}</span> },
    {
      key: 'custo', header: 'Custo total', align: 'right', hideOnMobile: true, className: 'num',
      render: (u) => { const t = (u.preco_custo ?? 0) + (u.custo_reparo ?? 0); return t > 0 ? <span className="text-ink-2">{fmt(t)}</span> : <span className="text-ink-3">—</span> },
    },
    { key: 'venda', header: 'Venda', align: 'right', className: 'num', render: (u) => u.preco_venda ? <span className="font-semibold text-ink">{fmt(u.preco_venda)}</span> : <span className="text-ink-3">—</span> },
    { key: 'status', header: 'Status', align: 'right', render: (u) => { const s = STATUS[u.status ?? 'disponivel'] ?? STATUS.disponivel; return <Badge tone={s.tone} dot>{s.label}</Badge> } },
  ]

  const colsTabela: Column<TabelaPreco>[] = [
    { key: 'modelo', header: 'Modelo', render: (t) => <span className="font-semibold text-ink">{t.modelo}</span> },
    { key: 'armazenamento', header: 'Armazenamento', hideOnMobile: true, render: (t) => <span className="text-ink-2">{t.armazenamento ?? '—'}</span> },
    { key: 'condicao', header: 'Condição', render: (t) => { const c = COND[t.condicao] ?? COND.lacrado; return <Badge tone={c.tone}>{c.label}</Badge> } },
    { key: 'preco', header: 'Preço sugerido', align: 'right', className: 'num', render: (t) => <span className="font-semibold text-ink">{fmt(t.preco_sugerido)}</span> },
    { key: 'obs', header: 'Observações', hideOnMobile: true, render: (t) => <span className="text-ink-2">{t.observacoes ?? '—'}</span> },
    { key: 'acao', header: '', align: 'right', render: () => <IconButton aria-label="Ações" size="sm"><MoreHorizontal size={16} strokeWidth={1.7} /></IconButton> },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Produtos" />

      <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1240px] space-y-5">

          <Tabs items={TABS} value={tab} onValueChange={(v) => setTab(v as Tab)} />

          {/* ── LISTA DE PRODUTOS ── */}
          {tab === 'produtos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs items={categTabs} value={filtroCategoria} onValueChange={setFiltroCategoria} className="border-b-0" />
                <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setEditProd('new')}>Cadastrar produto</Button>
              </div>

              <Card flush>
                <Table
                  columns={colsProdutos}
                  rows={prodsFiltrados}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => setEditProd(p)}
                  empty={<EmptyState icon={<Package size={22} strokeWidth={1.7} />} title="Nenhum produto encontrado" description="Ajuste o filtro ou cadastre um novo produto." />}
                />
              </Card>
            </div>
          )}

          {/* ── LISTA DE ESTOQUE ── */}
          {tab === 'estoque' && (
            <div className="space-y-4">
              <Input
                icon={<Search size={15} strokeWidth={1.7} />}
                value={searchEst}
                onChange={(e) => setSearchEst(e.target.value)}
                placeholder="Buscar por produto, IMEI ou número de série…"
              />

              <Card flush>
                <Table
                  columns={colsEstoque}
                  rows={unidadesFiltradas}
                  rowKey={(u) => u.id}
                  empty={<EmptyState icon={<Package size={22} strokeWidth={1.7} />} title="Nenhuma unidade encontrada" description="Ajuste a busca para localizar unidades em estoque." />}
                />
              </Card>
            </div>
          )}

          {/* ── CATEGORIAS ── */}
          {tab === 'categorias' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => window.location.href = '/configuracoes'}>Nova categoria</Button>
              </div>
              {categorias.length === 0 ? (
                <Card><EmptyState icon={<Tag size={22} strokeWidth={1.7} />} title="Nenhuma categoria cadastrada" /></Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {categorias.map((c) => (
                    <div key={c.id} className="rounded-card border border-line bg-card p-5 transition-colors hover:bg-raised">
                      <div className="mb-4 grid h-10 w-10 place-items-center rounded-control bg-ink/[0.04] text-ink-2">
                        <Package size={18} strokeWidth={1.7} />
                      </div>
                      <div className="text-[15px] font-semibold text-ink">{c.nome}</div>
                      <div className="mt-1 text-[12px] text-ink-3">{c.total_produtos} produtos</div>
                      {c.subcategorias.length > 0 && (
                        <div className="mt-2 truncate text-[11.5px] text-ink-3">
                          Subcategorias: {c.subcategorias.join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── MARCAS ── */}
          {tab === 'marcas' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => window.location.href = '/configuracoes'}>Nova marca</Button>
              </div>
              {marcasVisiveis.length === 0 ? (
                <Card><EmptyState icon={<Tag size={22} strokeWidth={1.7} />} title="Nenhuma marca com produtos" /></Card>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {marcasVisiveis.map((m) => (
                    <div key={m.id} className="flex flex-col items-center gap-3 rounded-card border border-line bg-card p-6 transition-colors hover:bg-raised">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">
                        {getInitials(m.nome)}
                      </span>
                      <div className="text-[14px] font-semibold text-ink">{m.nome}</div>
                      <div className="text-[12px] text-ink-3">{m.total_produtos} produtos</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TABELA DE PREÇOS ── */}
          {tab === 'tabela' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setModalPreco(true)}>Novo preço</Button>
              </div>

              <Card flush>
                <Table
                  columns={colsTabela}
                  rows={tabela}
                  rowKey={(t) => t.id}
                  empty={<EmptyState icon={<Tag size={22} strokeWidth={1.7} />} title="Nenhum preço cadastrado" description='Clique em "Novo preço" para começar.' action={<Button size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => setModalPreco(true)}>Novo preço</Button>} />}
                />
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Modal Novo Preço */}
      <Modal
        open={modalPreco}
        onClose={() => setModalPreco(false)}
        title="Novo preço de referência"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalPreco(false)}>Cancelar</Button>
            <Button type="submit" form="preco-form" loading={saving}>Salvar</Button>
          </>
        }
      >
        <form id="preco-form" onSubmit={(e) => { e.preventDefault(); salvarPreco() }} className="space-y-4">
          <Input
            label="Modelo"
            required
            value={precoForm.modelo}
            onChange={(e) => setPrecoForm((pf) => ({ ...pf, modelo: e.target.value }))}
            placeholder="Ex: iPhone 15 Pro Max"
          />
          <Input
            label="Armazenamento"
            value={precoForm.armazenamento}
            onChange={(e) => setPrecoForm((pf) => ({ ...pf, armazenamento: e.target.value }))}
            placeholder="Ex: 256GB"
          />
          <Input
            label="Preço sugerido"
            required
            type="number"
            value={precoForm.preco_sugerido}
            onChange={(e) => setPrecoForm((pf) => ({ ...pf, preco_sugerido: e.target.value }))}
            placeholder="0.00"
          />
          <Select
            label="Condição"
            value={precoForm.condicao}
            onChange={(e) => setPrecoForm((pf) => ({ ...pf, condicao: e.target.value }))}
          >
            <option value="lacrado">Lacrado</option>
            <option value="excelente">Excelente</option>
            <option value="bom">Bom</option>
            <option value="regular">Regular</option>
          </Select>
          <Input
            label="Observações"
            value={precoForm.observacoes}
            onChange={(e) => setPrecoForm((pf) => ({ ...pf, observacoes: e.target.value }))}
            placeholder="Ex: Seminovo grade A"
          />
        </form>
      </Modal>

      {editProd !== null && (
        <ProdutoModal
          produto={editProd === 'new' ? null : { id: editProd.id, nome: editProd.nome, marca_id: editProd.marca_id, categoria_id: editProd.categoria_id }}
          marcas={marcas.map((m) => ({ id: m.id, nome: m.nome }))}
          categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
          onClose={() => setEditProd(null)}
          onSaved={() => { setEditProd(null); router.refresh() }}
          onDeleted={() => { setEditProd(null); router.refresh() }}
        />
      )}
    </div>
  )
}
