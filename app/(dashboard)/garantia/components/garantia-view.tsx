'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import GarantiaModal from './garantia-modal'

interface Garantia {
  id: number
  protocolo: string | null
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
  tipo: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes: { nome: string; telefone: string | null } | null
  produtos: { nome: string } | null
}

interface Props { garantias: Garantia[] }

// Status badge — cores do modelo
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  em_analise: { label: 'Em análise', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  aprovado:   { label: 'Aprovado',   color: '#3B7DE8', bg: 'rgba(59,125,232,0.12)' },
  em_reparo:  { label: 'Em reparo',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  concluido:  { label: 'Concluído',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  entregue:   { label: 'Entregue',   color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' },
  recusado:   { label: 'Reprovado',  color: '#D7282F', bg: 'rgba(215,40,47,0.12)'  },
}

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS[status ?? ''] ?? { label: status ?? '—', color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' }
  return (
    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  )
}

function fmtPrazo(dias: number | null) {
  if (dias === null) return '—'
  if (dias < 0) return 'Expirada'
  if (dias === 0) return 'Hoje'
  return `${dias} dias`
}

export default function GarantiaView({ garantias }: Props) {
  const [filtro, setFiltro] = useState('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<Garantia | null>(null)
  const [isNew, setIsNew] = useState(false)

  const stats = useMemo(() => ({
    emAnalise:      garantias.filter(g => g.status === 'em_analise').length,
    emReparo:       garantias.filter(g => g.status === 'em_reparo').length,
    dentroGarantia: garantias.filter(g => g.dentro_garantia).length,
    concluidasMes:  garantias.filter(g => g.status === 'concluido' || g.status === 'entregue').length,
  }), [garantias])

  const filtrados = useMemo(() => {
    if (filtro === 'todas') return garantias
    if (filtro === 'em_analise') return garantias.filter(g => g.status === 'em_analise')
    if (filtro === 'em_reparo')  return garantias.filter(g => g.status === 'em_reparo')
    if (filtro === 'concluidas') return garantias.filter(g => g.status === 'concluido' || g.status === 'entregue')
    return garantias
  }, [garantias, filtro])

  const FILTROS = [
    { key: 'todas',     label: 'Todas'      },
    { key: 'em_analise',label: 'Em análise' },
    { key: 'em_reparo', label: 'Em reparo'  },
    { key: 'concluidas',label: 'Concluídas' },
  ]

  // Stat cards — ícones emoji simples com cor de fundo circular
  const STATS = [
    { label: 'Em análise',       value: stats.emAnalise,      iconBg: 'rgba(245,158,11,0.15)',  iconColor: '#F59E0B', icon: '⏱' },
    { label: 'Em reparo',        value: stats.emReparo,       iconBg: 'rgba(139,92,246,0.15)',  iconColor: '#8B5CF6', icon: '🔧' },
    { label: 'Dentro da garantia',value: stats.dentroGarantia,iconBg: 'rgba(34,197,94,0.15)',   iconColor: '#22C55E', icon: '✓'  },
    { label: 'Concluídas no mês', value: stats.concluidasMes, iconBg: 'rgba(92,110,132,0.15)', iconColor: '#5C6E84', icon: '✓'  },
  ]

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      {/* Topbar */}
      <div className="flex items-center px-6 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#788698] uppercase mb-0.5">
            Pós-venda · Produtos vendidos
          </p>
          <h1 className="text-xl font-bold text-[#16212E]">Garantia</h1>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4 shrink-0">
        {STATS.map(s => (
          <div key={s.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0"
              style={{ backgroundColor: s.iconBg, color: s.iconColor }}>
              {s.icon}
            </div>
            <div>
              <div className="text-2xl font-normal text-[#16212E] leading-none">{s.value}</div>
              <div className="text-[11px] text-[#788698] mt-1">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros + botão */}
      <div className="flex items-center justify-between px-6 pb-4 shrink-0">
        <div className="flex items-center gap-1">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={cn('px-4 py-2 rounded-[8px] text-sm font-medium transition-all', filtro === f.key
                ? 'text-[#C01F26]'
                : 'text-[#788698] hover:text-[#788698]')}
              style={filtro === f.key ? { backgroundColor: 'rgba(215,40,47,0.14)' } : { backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => { setSelecionada(null); setIsNew(true); setModalOpen(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold rounded-[10px] transition-colors">
          <Plus size={15} />
          Novo protocolo
        </button>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#16212E]/[0.08]">
                {['Protocolo', 'Cliente / Produto', 'Tipo', 'Prazo', 'Status'].map(h => (
                  <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#788698] uppercase px-5 py-3.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-16 text-[#9AA7B6] text-sm">Nenhuma garantia encontrada</td></tr>
              ) : filtrados.map(g => (
                <tr key={g.id}
                  onClick={() => { setSelecionada(g); setIsNew(false); setModalOpen(true) }}
                  className="border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.04] cursor-pointer transition-colors last:border-0">
                  {/* Protocolo */}
                  <td className="px-5 py-4">
                    <div className="text-sm font-mono font-semibold text-[#1F2A39]">{g.protocolo ?? `#GA-${g.id}`}</div>
                  </td>
                  {/* Cliente / Produto */}
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold text-[#1F2A39]">{g.clientes?.nome ?? '—'}</div>
                    <div className="text-[11px] text-[#788698]">
                      {g.produtos?.nome ?? '—'}{g.imei_serial ? ` · IMEI ··${g.imei_serial.slice(-4)}` : ''}
                    </div>
                  </td>
                  {/* Tipo */}
                  <td className="px-5 py-4">
                    <span className={cn('text-sm', g.dentro_garantia ? 'text-[#1F2A39]' : 'text-[#788698]')}>
                      {g.dentro_garantia ? 'Garantia' : 'Assistência'}
                    </span>
                  </td>
                  {/* Prazo */}
                  <td className="px-5 py-4">
                    <span className={cn('text-sm', g.dias_garantia_restantes != null && g.dias_garantia_restantes < 0 ? 'text-[#D7282F]' : 'text-[#788698]')}>
                      {fmtPrazo(g.dias_garantia_restantes)}
                    </span>
                  </td>
                  {/* Status */}
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
        <GarantiaModal garantia={isNew ? null : selecionada} isNew={isNew} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
