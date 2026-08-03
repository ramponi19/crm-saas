'use client'

import { useState, useMemo } from 'react'
import { Search, UserPlus, Users } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { Card, Table, Input, Button, Badge, EmptyState, type Column } from '@/components/ui'
import ClienteModal from './cliente-modal'

interface Cliente {
  id: number
  nome: string
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
  data_nascimento: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  tipo_cliente: string | null
  instagram: string | null
  origem_cliente: string | null
  observacoes: string | null
  estado_civil: string | null
  profissao: string | null
  nacionalidade: string | null
  ativo: boolean | null
  created_at: string | null
  total_vendas?: number
  valor_total?: number
  ultima_compra?: string | null
}

interface Props {
  clientes: Cliente[]
}

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function fmtUltimaCompra(d: string | null | undefined) {
  if (!d) return '—'
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return `${diff} dias`
  if (diff < 14) return '1 sem'
  if (diff < 30) return `${Math.floor(diff / 7)} sem`
  return new Date(d).toLocaleDateString('pt-BR')
}

function statusBadge(c: Cliente) {
  if (c.tipo_cliente === 'VIP') return <Badge tone="warn">VIP</Badge>
  if (c.ativo === false) return <Badge tone="neutro">Inativo</Badge>
  return <Badge tone="ok" dot>Ativo</Badge>
}

export default function ClientesView({ clientes }: Props) {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [isNew, setIsNew] = useState(false)

  const filtrados = useMemo(() => {
    if (!search) return clientes
    const q = search.toLowerCase()
    return clientes.filter((c) =>
      c.nome.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.telefone ?? '').includes(q),
    )
  }, [clientes, search])

  function openCliente(c: Cliente) { setClienteSelecionado(c); setIsNew(false); setModalOpen(true) }
  function openNovo() { setClienteSelecionado(null); setIsNew(true); setModalOpen(true) }

  const cols: Column<Cliente>[] = [
    {
      key: 'cliente', header: 'Cliente',
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
            {getInitials(c.nome)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{c.nome}</div>
            {c.email && <div className="truncate text-[11px] text-ink-3">{c.email}</div>}
          </div>
        </div>
      ),
    },
    { key: 'telefone', header: 'Telefone', hideOnMobile: true, render: (c) => <span className="num text-ink-2">{c.telefone ?? '—'}</span> },
    {
      key: 'cidade', header: 'Cidade', hideOnMobile: true,
      render: (c) => <span className="text-ink-2">{c.cidade && c.estado ? `${c.cidade} · ${c.estado}` : c.cidade ?? c.estado ?? '—'}</span>,
    },
    { key: 'compras', header: 'Compras', align: 'right', className: 'num', render: (c) => <span className={(c.total_vendas ?? 0) > 0 ? 'text-ink' : 'text-ink-3'}>{c.total_vendas ?? 0}</span> },
    {
      key: 'total', header: 'Total gasto', align: 'right', hideOnMobile: true, className: 'num',
      render: (c) => (c.valor_total ?? 0) > 0 ? <span className="font-semibold text-ink">{formatCurrency(c.valor_total!)}</span> : <span className="text-ink-3">—</span>,
    },
    { key: 'ultima', header: 'Última', align: 'right', hideOnMobile: true, render: (c) => <span className="text-ink-2">{fmtUltimaCompra(c.ultima_compra)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (c) => statusBadge(c) },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Clientes" />

      <div className="flex shrink-0 items-center gap-3 px-4 py-4 sm:px-6">
        <Input
          wrapperClassName="flex-1"
          icon={<Search size={15} strokeWidth={1.7} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente por nome, e-mail ou telefone…"
        />
        <Button icon={<UserPlus size={15} strokeWidth={1.7} />} onClick={openNovo}>Novo cliente</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        <Card flush>
          <Table
            columns={cols}
            rows={filtrados}
            rowKey={(c) => c.id}
            onRowClick={openCliente}
            empty={<EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Nenhum cliente encontrado" description={search ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro cliente.'} action={!search ? <Button size="sm" onClick={openNovo}>Novo cliente</Button> : undefined} />}
          />
        </Card>
      </div>

      {modalOpen && (
        <ClienteModal cliente={isNew ? null : clienteSelecionado} isNew={isNew} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
