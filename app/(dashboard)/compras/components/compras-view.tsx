'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'

interface Pedido {
  id: number
  descricao: string | null
  valor_total: number | null
  status: string | null
  data_pedido: string | null
  created_at: string
  observacoes: string | null
  fornecedor_id: number | null
  fornecedores: { nome: string; contato: string | null; telefone: string | null } | null
}
interface Fornecedor {
  id: number
  nome: string
  contato: string | null
  telefone: string | null
  email: string | null
  created_at: string
}
interface Props { pedidos: Pedido[]; fornecedores: Fornecedor[] }

const STATUS_PEDIDO: Record<string, { label: string; color: string; bg: string }> = {
  aberto:      { label: 'Aberto',       color: '#3B7DE8', bg: 'rgba(59,125,232,0.12)'  },
  em_transito: { label: 'Em trânsito',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  recebido:    { label: 'Recebido',     color: '#22C55E', bg: 'rgba(34,197,94,0.12)'   },
  cancelado:   { label: 'Cancelado',    color: '#D7282F', bg: 'rgba(215,40,47,0.12)'   },
}

function avatarColor(name: string) {
  const colors = ['#D7282F','#3B7DE8','#22C55E','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#10B981']
  let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function fmtBRL(v: number | null) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function ComprasView({ pedidos, fornecedores }: Props) {
  const stats = {
    abertos:    pedidos.filter(p => p.status === 'aberto').length,
    transito:   pedidos.filter(p => p.status === 'em_transito').length,
    recebidos:  pedidos.filter(p => p.status === 'recebido').length,
    investido:  pedidos.reduce((s, p) => s + (p.valor_total ?? 0), 0),
  }

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#788698] uppercase mb-0.5">Operação</p>
          <h1 className="text-xl font-bold text-[#16212E]">Compras</h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4 shrink-0">
        {[
          { label: 'Pedidos abertos', value: stats.abertos,  iconBg: 'rgba(59,125,232,0.15)',  iconColor: '#3B7DE8', icon: '🛒' },
          { label: 'Em trânsito',     value: stats.transito,  iconBg: 'rgba(245,158,11,0.15)',  iconColor: '#F59E0B', icon: '🚚' },
          { label: 'Recebidos no mês',value: stats.recebidos, iconBg: 'rgba(34,197,94,0.15)',   iconColor: '#22C55E', icon: '📦' },
          { label: 'Investido no mês',value: fmtBRL(stats.investido), iconBg: 'rgba(139,92,246,0.15)', iconColor: '#8B5CF6', icon: '💰' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: s.iconBg, color: s.iconColor }}>{s.icon}</div>
            <div>
              <div className="text-xl font-normal text-[#16212E] leading-none">{s.value}</div>
              <div className="text-[11px] text-[#788698] mt-1">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Dois painéis */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 grid grid-cols-[1fr_360px] gap-4">
        {/* Pedidos */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
            <h2 className="text-base font-semibold text-[#1F2A39]">Pedidos de compra</h2>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors">
              <Plus size={13} /> Novo pedido
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {pedidos.length === 0 ? (
              <p className="text-center py-12 text-[#9AA7B6] text-sm">Nenhum pedido</p>
            ) : pedidos.map(p => {
              const s = STATUS_PEDIDO[p.status ?? ''] ?? { label: p.status ?? '—', color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' }
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] cursor-pointer last:border-0">
                  <div>
                    <div className="text-sm font-medium text-[#1F2A39]">{p.descricao ?? `Pedido #${p.id}`}</div>
                    <div className="text-[11px] text-[#788698] mt-0.5">{p.fornecedores?.nome ?? '—'} · {fmtData(p.data_pedido ?? p.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-[#1F2A39]">{fmtBRL(p.valor_total)}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fornecedores */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
            <h2 className="text-base font-semibold text-[#1F2A39]">Fornecedores</h2>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-[#56657A] text-xs font-semibold rounded-[8px] transition-colors">
              <Plus size={13} /> Novo
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {fornecedores.length === 0 ? (
              <p className="text-center py-12 text-[#9AA7B6] text-sm">Nenhum fornecedor</p>
            ) : fornecedores.map(f => {
              const color = avatarColor(f.nome)
              const initials = f.nome.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
              const qtd = pedidos.filter(p => p.fornecedor_id === f.id).length
              return (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] cursor-pointer last:border-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: color }}>{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1F2A39] truncate">{f.nome}</div>
                    <div className="text-[11px] text-[#788698] truncate">{f.contato ?? '—'}{f.telefone ? ` · ${f.telefone}` : ''}</div>
                  </div>
                  <span className="text-[11px] text-[#788698] shrink-0">{qtd} pedidos</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
