'use client'

import { useState, useMemo } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
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

function avatarColor(name: string): string {
  const colors = [
    '#D7282F', '#3B7DE8', '#22C55E', '#F59E0B',
    '#8B5CF6', '#EC4899', '#06B6D4', '#10B981',
    '#F97316', '#6366F1',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
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

function StatusBadge({ tipo, ativo }: { tipo: string | null; ativo: boolean | null }) {
  if (tipo === 'VIP') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border border-[#F59E0B]/40 text-[#B47B12] bg-[#F59E0B]/10">
        VIP
      </span>
    )
  }
  if (ativo === false) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-[#788698] bg-white/[0.05]">
        Inativo
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-[#15986A] bg-[#22C55E]/10">
      Ativo
    </span>
  )
}

export default function ClientesView({ clientes }: Props) {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [isNew, setIsNew] = useState(false)

  const filtrados = useMemo(() => {
    if (!search) return clientes
    const q = search.toLowerCase()
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.telefone ?? '').includes(q)
    )
  }, [clientes, search])

  function openCliente(c: Cliente) {
    setClienteSelecionado(c)
    setIsNew(false)
    setModalOpen(true)
  }

  function openNovo() {
    setClienteSelecionado(null)
    setIsNew(true)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#788698] uppercase mb-0.5">Relacionamento</p>
          <h1 className="text-xl font-bold text-[#16212E]">Clientes</h1>
        </div>
      </div>

      {/* Search + Button */}
      <div className="flex items-center gap-3 px-6 py-4 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#788698]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente por nome, e-mail ou telefone..."
            className="w-full bg-white border border-[#16212E]/[0.08] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#56657A] placeholder:text-[#788698] outline-none focus:border-[#16212E]/[0.15] transition-colors"
          />
        </div>
        <button
          onClick={openNovo}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D7282F] hover:bg-[#C01F26] text-white text-sm font-semibold rounded-[10px] transition-colors shrink-0"
        >
          <UserPlus size={15} />
          Novo cliente
        </button>
      </div>

      {/* Table — card azul-médio como no modelo */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#16212E]/[0.10]">
                {['Cliente', 'Telefone', 'Cidade', 'Compras', 'Total Gasto', 'Última', 'Status'].map(h => (
                  <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#788698] uppercase px-5 py-3.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-[#788698] text-sm">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : filtrados.map(c => {
                const color = avatarColor(c.nome)
                const tv = c.total_vendas ?? 0
                const vt = c.valor_total ?? 0
                return (
                  <tr
                    key={c.id}
                    onClick={() => openCliente(c)}
                    className="border-b border-[#16212E]/[0.07] hover:bg-[#16212E]/[0.04] cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {getInitials(c.nome)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#1F2A39] leading-tight">{c.nome}</div>
                          {c.email && (
                            <div className="text-[11px] text-[#788698] truncate max-w-[200px]">{c.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-[#788698]">{c.telefone ?? '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-[#788698]">
                        {c.cidade && c.estado ? `${c.cidade} · ${c.estado}` : c.cidade ?? c.estado ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        'text-sm font-semibold font-mono',
                        tv > 0 ? 'text-[#16212E]' : 'text-[#788698]'
                      )}>
                        {tv}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {vt > 0 ? (
                        <span className="text-sm font-bold text-[#16212E]">
                          {vt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      ) : (
                        <span className="text-[#788698]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-[#788698]">{fmtUltimaCompra(c.ultima_compra)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tipo={c.tipo_cliente} ativo={c.ativo} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ClienteModal
          cliente={isNew ? null : clienteSelecionado}
          isNew={isNew}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
