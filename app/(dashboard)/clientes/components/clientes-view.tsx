'use client'

import { useState, useMemo } from 'react'
import { Search, UserPlus, Users, SlidersHorizontal } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { Card, Table, Input, Button, Badge, EmptyState, Select, type Column } from '@/components/ui'
import ClienteModal from './cliente-modal'
import ClienteModalImob from './cliente-modal-imob'
import { TIPO_NEGOCIO, STATUS_APROVACAO, rotuloTipoNegocio, statusAprovacao } from './cliente-imob-tipos'

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
  /** Campos do cliente imobiliário (migração de 20/08/2026). */
  lead_id?: number | null
  tipo_negocio?: string | null
  status_aprovacao?: string | null
  corretor_id?: string | null
  valor_pretendido?: number | null
  regiao_interesse?: string | null
  total_vendas?: number
  valor_total?: number
  ultima_compra?: string | null
}

/** Jornada resolvida no servidor: etapa, score e corretor vêm do lead ligado. */
export interface ClienteImob {
  etapaId: string | null
  etapaLabel: string | null
  score: number | null
  corretorNome: string | null
}

interface Props {
  clientes: Cliente[]
  /** Segmento em que cliente é a mesma pessoa do funil (`clienteComPipeline`). */
  imob?: boolean
  etapas?: { id: string; label: string; tipo: string | null }[]
  equipe?: { id: string; nome: string }[]
  jornada?: Record<number, ClienteImob>
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

export default function ClientesView({ clientes, imob = false, etapas = [], equipe = [], jornada = {} }: Props) {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [fCorretor, setFCorretor] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fStatus, setFStatus] = useState('')

  const filtrados = useMemo(() => {
    if (!search) return clientes
    const q = search.toLowerCase()
    /**
     * Busca também por CPF/CNPJ, comparando só os DÍGITOS.
     *
     * Faltava o campo inteiro: quem digitava o CPF do cliente não achava ninguém
     * e concluía que não estava cadastrado — e cadastrava de novo. E comparar o
     * texto cru não resolveria: o cadastro guarda "123.456.789-00" e no balcão a
     * pessoa digita "12345678900".
     */
    const digitos = q.replace(/\D/g, '')
    return clientes.filter((c) =>
      c.nome.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (digitos.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(digitos)) ||
      (digitos.length >= 3 && (c.cpf_cnpj ?? '').replace(/\D/g, '').includes(digitos)),
    )
  }, [clientes, search])

  /**
   * Filtros de Corretor / Tipo / Status — os três da tela dele.
   *
   * Aplicados DEPOIS da busca, e só na imobiliária: no varejo esses campos não
   * existem, e filtro de campo vazio é botão que não faz nada.
   */
  const visiveis = useMemo(() => {
    if (!imob) return filtrados
    return filtrados.filter((c) => {
      if (fCorretor && (jornada[c.id]?.corretorNome ?? '') !== fCorretor) return false
      if (fTipo && c.tipo_negocio !== fTipo) return false
      if (fStatus && (c.status_aprovacao ?? 'pendente') !== fStatus) return false
      return true
    })
  }, [filtrados, imob, fCorretor, fTipo, fStatus, jornada])

  function openCliente(c: Cliente) { setClienteSelecionado(c); setIsNew(false); setModalOpen(true) }
  function openNovo() { setClienteSelecionado(null); setIsNew(true); setModalOpen(true) }

  const colsImob: Column<Cliente>[] = [
    {
      key: 'cliente', header: 'Nome',
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
    { key: 'cpf', header: 'CPF', hideOnMobile: true, render: (c) => <span className="num text-ink-2">{c.cpf_cnpj ?? '—'}</span> },
    { key: 'telefone', header: 'Telefone', hideOnMobile: true, render: (c) => <span className="num text-ink-2">{c.telefone ?? '—'}</span> },
    {
      key: 'tipo', header: 'Tipo',
      render: (c) => {
        const l = rotuloTipoNegocio(c.tipo_negocio)
        return l ? <Badge tone="acc">{l}</Badge> : <span className="text-ink-3">—</span>
      },
    },
    {
      key: 'score', header: 'Score', align: 'right', className: 'num',
      // Score vem do lead ligado. Sem lead não há jornada, e "0" mentiria: seria
      // lead frio, quando na verdade é cliente que nunca passou pelo funil.
      render: (c) => {
        const j = jornada[c.id]
        return j?.score != null
          ? <span className="font-semibold text-ink">{j.score}</span>
          : <span className="text-ink-3" title="Sem lead vinculado">—</span>
      },
    },
    {
      key: 'etapa', header: 'Etapa', hideOnMobile: true,
      render: (c) => <span className="text-ink-2">{jornada[c.id]?.etapaLabel ?? '—'}</span>,
    },
    {
      key: 'corretor', header: 'Corretor', hideOnMobile: true,
      render: (c) => <span className="text-ink-2">{jornada[c.id]?.corretorNome ?? '—'}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (c) => {
        const st = statusAprovacao(c.status_aprovacao)
        return <Badge tone={st.tone}>{st.l}</Badge>
      },
    },
  ]

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

      {imob && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-6">
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Clientes</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">Gerencie seus clientes e leads</p>
          </div>
          {/* "Fundir Leads" é a próxima fatia: o botão só aparece quando existir a
              tela, para o menu não prometer o que ainda não abre. */}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
        <Input
          wrapperClassName="flex-1 min-w-[220px]"
          icon={<Search size={15} strokeWidth={1.7} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={imob ? 'Buscar por nome, CPF ou e-mail…' : 'Buscar cliente por nome, e-mail ou telefone…'}
        />
        {imob && (
          <Button
            variant="outline"
            icon={<SlidersHorizontal size={15} strokeWidth={1.7} />}
            onClick={() => setMostrarFiltros((v) => !v)}
          >
            Filtros
          </Button>
        )}
        <Button icon={<UserPlus size={15} strokeWidth={1.7} />} onClick={openNovo}>Novo cliente</Button>
      </div>

      {imob && mostrarFiltros && (
        <div className="grid shrink-0 gap-3 px-4 pb-4 sm:grid-cols-3 sm:px-6">
          <Select label="Corretor" value={fCorretor} onChange={(e) => setFCorretor(e.target.value)}>
            <option value="">Todos</option>
            {equipe.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
          </Select>
          <Select label="Tipo de cliente" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos</option>
            {TIPO_NEGOCIO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Select label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_APROVACAO.map((st) => <option key={st.v} value={st.v}>{st.l}</option>)}
          </Select>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        <Card flush>
          <Table
            columns={imob ? colsImob : cols}
            rows={visiveis}
            rowKey={(c) => c.id}
            onRowClick={openCliente}
            empty={<EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Nenhum cliente encontrado" description={search ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro cliente.'} action={!search ? <Button size="sm" onClick={openNovo}>Novo cliente</Button> : undefined} />}
          />
        </Card>
      </div>

      {modalOpen && (imob ? (
        <ClienteModalImob
          cliente={isNew ? null : clienteSelecionado}
          isNew={isNew}
          etapas={etapas}
          equipe={equipe}
          jornada={clienteSelecionado ? jornada[clienteSelecionado.id] : undefined}
          onClose={() => setModalOpen(false)}
        />
      ) : (
        <ClienteModal cliente={isNew ? null : clienteSelecionado} isNew={isNew} onClose={() => setModalOpen(false)} />
      ))}
    </div>
  )
}
