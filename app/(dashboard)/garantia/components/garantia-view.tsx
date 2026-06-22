'use client'

import { useState, useMemo } from 'react'
import { Search, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import GarantiaModal from './garantia-modal'

interface Garantia {
  id: number
  protocolo: string | null
  tipo: string | null
  status: string | null
  defeito_relatado: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  imei_serial: string | null
  dentro_garantia: boolean | null
  dias_garantia_restantes: number | null
  data_entrada: string | null
  created_at: string
  observacoes: string | null
  estado_entrada: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes: { nome: string; telefone: string | null } | null
  produtos: { nome: string } | null
}

interface Props {
  garantias: Garantia[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'em_analise':    { label: 'Em análise',    color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)'   },
  'aprovado':      { label: 'Aprovado',      color: '#3B7DE8', bg: 'rgba(59,125,232,0.1)',   border: 'rgba(59,125,232,0.3)'   },
  'em_reparo':     { label: 'Em reparo',     color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)',   border: 'rgba(139,92,246,0.3)'   },
  'concluido':     { label: 'Concluído',     color: '#22C55E', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.3)'    },
  'entregue':      { label: 'Entregue',      color: '#5C6E84', bg: 'rgba(92,110,132,0.1)',   border: 'rgba(92,110,132,0.3)'   },
  'recusado':      { label: 'Recusado',      color: '#D7282F', bg: 'rgba(215,40,47,0.1)',    border: 'rgba(215,40,47,0.3)'    },
}

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS_CONFIG[status ?? ''] ?? { label: status ?? '—', color: '#5C6E84', bg: 'rgba(92,110,132,0.1)', border: 'rgba(92,110,132,0.3)' }
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap"
      style={{ color: s.color, backgroundColor: s.bg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function fmtPrazo(dias: number | null) {
  if (dias === null) return '—'
  if (dias < 0) return <span className="text-[#D7282F] font-semibold">Vencido</span>
  if (dias === 0) return <span className="text-[#F59E0B] font-semibold">Hoje</span>
  return <span>{dias}d</span>
}

export default function GarantiaView({ garantias }: Props) {
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<Garantia | null>(null)
  const [isNew, setIsNew] = useState(false)

  const stats = useMemo(() => {
    const total = garantias.length
    const emAnalise = garantias.filter(g => g.status === 'em_analise').length
    const emReparo = garantias.filter(g => g.status === 'em_reparo').length
    const concluidas = garantias.filter(g => g.status === 'concluido' || g.status === 'entregue').length
    return { total, emAnalise, emReparo, concluidas }
  }, [garantias])

  const filtrados = useMemo(() => {
    return garantias.filter(g => {
      const q = search.toLowerCase()
      const matchSearch = !search ||
        (g.protocolo ?? '').toLowerCase().includes(q) ||
        (g.clientes?.nome ?? '').toLowerCase().includes(q) ||
        (g.produtos?.nome ?? '').toLowerCase().includes(q) ||
        (g.imei_serial ?? '').toLowerCase().includes(q)
      const matchStatus = filtroStatus === 'todos' || g.status === filtroStatus
      return matchSearch && matchStatus
    })
  }, [garantias, search, filtroStatus])

  function openGarantia(g: Garantia) {
    setSelecionada(g); setIsNew(false); setModalOpen(true)
  }
  function openNova() {
    setSelecionada(null); setIsNew(true); setModalOpen(true)
  }

  const statusKeys = Object.keys(STATUS_CONFIG)

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#5C6E84] uppercase mb-0.5">Relacionamento</p>
          <h1 className="text-xl font-bold text-[#F4F6F9]">Garantia</h1>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4 shrink-0">
        {[
          { label: 'Total',       value: stats.total,     color: '#3B7DE8' },
          { label: 'Em análise',  value: stats.emAnalise, color: '#F59E0B' },
          { label: 'Em reparo',   value: stats.emReparo,  color: '#8B5CF6' },
          { label: 'Concluídos',  value: stats.concluidas,color: '#22C55E' },
        ].map(s => (
          <div key={s.label} className="bg-[#122036] border border-white/[0.06] rounded-[13px] px-4 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <div>
              <div className="text-[9.5px] font-mono tracking-widest text-[#4F6178] uppercase">{s.label}</div>
              <div className="text-lg font-bold text-[#E9EEF4] font-mono leading-tight">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filtros + botão */}
      <div className="flex items-center gap-3 px-6 pb-4 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4F6178]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por protocolo, cliente, produto ou IMEI..."
            className="w-full bg-[#122036] border border-white/[0.08] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#E9EEF4] placeholder:text-[#4F6178] outline-none focus:border-white/20 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#122036] border border-white/[0.06] rounded-[10px] p-1">
          <button
            onClick={() => setFiltroStatus('todos')}
            className={cn('px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all',
              filtroStatus === 'todos' ? 'bg-white/[0.08] text-[#E9EEF4]' : 'text-[#4F6178] hover:text-[#8A9BB0]'
            )}
          >Todos</button>
          {statusKeys.map(k => (
            <button key={k}
              onClick={() => setFiltroStatus(k)}
              className={cn('px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all',
                filtroStatus === k ? 'bg-white/[0.08] text-[#E9EEF4]' : 'text-[#4F6178] hover:text-[#8A9BB0]'
              )}
            >{STATUS_CONFIG[k].label}</button>
          ))}
        </div>
        <button
          onClick={openNova}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold rounded-[10px] transition-colors shrink-0"
        >
          <Plus size={15} />
          Novo protocolo
        </button>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-[#122036] border border-white/[0.06] rounded-[16px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Protocolo', 'Cliente / Produto', 'Tipo', 'Prazo', 'Status'].map(h => (
                  <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#5C6E84] uppercase px-5 py-3.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-[#4F6178] text-sm">
                    Nenhuma garantia encontrada
                  </td>
                </tr>
              ) : filtrados.map(g => (
                <tr key={g.id}
                  onClick={() => openGarantia(g)}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors last:border-0"
                >
                  <td className="px-5 py-4">
                    <div className="text-sm font-mono font-semibold text-[#E9EEF4]">{g.protocolo ?? `#${g.id}`}</div>
                    <div className="text-[11px] text-[#4F6178] mt-0.5">{fmtData(g.data_entrada ?? g.created_at)}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold text-[#E9EEF4] leading-tight">{g.clientes?.nome ?? '—'}</div>
                    <div className="text-[11px] text-[#5C6E84]">{g.produtos?.nome ?? '—'}{g.imei_serial ? ` · ${g.imei_serial}` : ''}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-[#8A9BB0]">
                      {g.dentro_garantia ? 'Garantia' : 'Assistência'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-[#8A9BB0]">{fmtPrazo(g.dias_garantia_restantes)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <GarantiaModal
          garantia={isNew ? null : selecionada}
          isNew={isNew}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
