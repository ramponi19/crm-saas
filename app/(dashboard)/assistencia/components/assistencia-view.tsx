'use client'
import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import OSModal from './os-modal'

interface OS {
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
interface Props { ordens: OS[] }

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  em_analise:      { label: 'Em análise',      color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  em_reparo:       { label: 'Em reparo',        color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)'  },
  aguardando_peca: { label: 'Aguardando peça',  color: '#3B7DE8', bg: 'rgba(59,125,232,0.12)'  },
  concluido:       { label: 'Concluído',        color: '#22C55E', bg: 'rgba(34,197,94,0.12)'   },
  entregue:        { label: 'Entregue',         color: '#5C6E84', bg: 'rgba(92,110,132,0.12)'  },
  reprovado:       { label: 'Reprovado',        color: '#D7282F', bg: 'rgba(215,40,47,0.12)'   },
}

const ORIGEM: Record<string, { label: string; color: string; bg: string }> = {
  garantia:       { label: 'Garantia',       color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  reparo_externo: { label: 'Reparo externo', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
}

function Badge({ val, map }: { val: string | null; map: Record<string, { label: string; color: string; bg: string }> }) {
  const s = map[val ?? ''] ?? { label: val ?? '—', color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' }
  return <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
}

const FILTROS = [
  { key: 'todas',           label: 'Todas'            },
  { key: 'em_analise',      label: 'Em análise'       },
  { key: 'em_reparo',       label: 'Em reparo'        },
  { key: 'aguardando_peca', label: 'Aguardando peça'  },
  { key: 'concluido',       label: 'Concluídas'       },
]

export default function AssistenciaView({ ordens }: Props) {
  const [filtro, setFiltro] = useState('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<OS | null>(null)
  const [isNew, setIsNew] = useState(false)

  const stats = useMemo(() => ({
    emAnalise:      ordens.filter(o => o.status === 'em_analise').length,
    emReparo:       ordens.filter(o => o.status === 'em_reparo').length,
    aguardando:     ordens.filter(o => o.status === 'aguardando_peca').length,
    concluidasMes:  ordens.filter(o => o.status === 'concluido' || o.status === 'entregue').length,
  }), [ordens])

  const filtrados = useMemo(() =>
    filtro === 'todas' ? ordens : ordens.filter(o => o.status === filtro)
  , [ordens, filtro])

  const STATS = [
    { label: 'Em análise',     value: stats.emAnalise,     iconBg: 'rgba(245,158,11,0.15)', iconColor: '#F59E0B', icon: '⏱' },
    { label: 'Em reparo',      value: stats.emReparo,      iconBg: 'rgba(139,92,246,0.15)', iconColor: '#8B5CF6', icon: '🔧' },
    { label: 'Aguardando peça',value: stats.aguardando,    iconBg: 'rgba(59,125,232,0.15)', iconColor: '#3B7DE8', icon: '📦' },
    { label: 'Concluídas no mês',value: stats.concluidasMes,iconBg:'rgba(34,197,94,0.15)',  iconColor: '#22C55E', icon: '✓'  },
  ]

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#5C6E84] uppercase mb-0.5">Pós-venda · Ordens de serviço</p>
          <h1 className="text-xl font-bold text-[#F4F6F9]">Assistência Técnica</h1>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 px-6 py-4 shrink-0">
        {STATS.map(s => (
          <div key={s.label} className="bg-[#122036] border border-white/[0.06] rounded-[16px] px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: s.iconBg, color: s.iconColor }}>{s.icon}</div>
            <div>
              <div className="text-2xl font-normal text-[#F4F6F9] leading-none">{s.value}</div>
              <div className="text-[11px] text-[#5C6E84] mt-1">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-6 pb-4 shrink-0">
        <div className="flex items-center gap-1">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={cn('px-4 py-2 rounded-[8px] text-sm font-medium transition-all', filtro === f.key ? 'text-[#F0656B]' : 'text-[#5C6E84] hover:text-[#8A9BB0]')}
              style={filtro === f.key ? { backgroundColor: 'rgba(215,40,47,0.14)' } : { backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => { setSelecionada(null); setIsNew(true); setModalOpen(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold rounded-[10px] transition-colors">
          <Plus size={15} /> Nova ordem de serviço
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-[#122036] border border-white/[0.06] rounded-[16px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['OS', 'Aparelho', 'Origem', 'Defeito', 'Técnico', 'Status'].map(h => (
                  <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#5C6E84] uppercase px-5 py-3.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-[#4F6178] text-sm">Nenhuma ordem encontrada</td></tr>
              ) : filtrados.map(o => (
                <tr key={o.id} onClick={() => { setSelecionada(o); setIsNew(false); setModalOpen(true) }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors last:border-0">
                  <td className="px-5 py-4"><span className="text-sm font-mono font-semibold text-[#E9EEF4]">{o.protocolo ?? `#OS-${o.id}`}</span></td>
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold text-[#E9EEF4]">{o.produtos?.nome ?? '—'}</div>
                    {o.clientes?.nome && <div className="text-[11px] text-[#5C6E84]">{o.clientes.nome}</div>}
                  </td>
                  <td className="px-5 py-4"><Badge val={o.dentro_garantia ? 'garantia' : 'reparo_externo'} map={ORIGEM} /></td>
                  <td className="px-5 py-4"><span className="text-sm text-[#8A9BB0]">{o.defeito_relatado ?? '—'}</span></td>
                  <td className="px-5 py-4"><span className="text-sm text-[#8A9BB0]">—</span></td>
                  <td className="px-5 py-4"><Badge val={o.status} map={STATUS} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <OSModal os={isNew ? null : selecionada} isNew={isNew} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
