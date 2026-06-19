'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, Wrench, Clock, CheckCircle2, AlertCircle, ChevronRight, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import OSModal from './os-modal'

interface Ordem {
  id: number
  tipo: string | null
  protocolo: string | null
  cliente_nome: string
  cliente_telefone: string | null
  produto_nome: string
  imei_serial: string | null
  defeito_relatado: string | null
  estado_entrada: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  dentro_garantia: boolean | null
  status: string | null
  data_entrada: string
  tecnico_nome: string | null
  cliente_id: number | null
  produto_id: number | null
  responsavel_tecnico_id: string | null
  observacoes: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
}

interface Props {
  ordens: Ordem[]
  clientes: { id: number; nome: string; telefone: string | null }[]
  produtos: { id: number; nome: string }[]
  tecnicos: { id: string; nome: string }[]
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  aguardando:  { label: 'Aguardando',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icon: Clock },
  em_reparo:   { label: 'Em Reparo',    color: '#6B8CFF', bg: 'rgba(107,140,255,0.12)', icon: Wrench },
  aguard_peca: { label: 'Ag. Peça',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icon: AlertCircle },
  pronto:      { label: 'Pronto',       color: '#22C55E', bg: 'rgba(34,197,94,0.12)',   icon: CheckCircle2 },
  entregue:    { label: 'Entregue',     color: '#5C6E84', bg: 'rgba(92,110,132,0.12)',  icon: CheckCircle2 },
  cancelado:   { label: 'Cancelado',    color: '#F0353D', bg: 'rgba(215,40,47,0.12)',   icon: XCircle },
}

export default function AssistenciaView({ ordens, clientes, produtos, tecnicos }: Props) {
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<Ordem | null>(null)

  const stats = useMemo(() => ({
    total: ordens.length,
    aguardando: ordens.filter(o => o.status === 'aguardando').length,
    em_reparo: ordens.filter(o => o.status === 'em_reparo').length,
    prontos: ordens.filter(o => o.status === 'pronto').length,
    garantia: ordens.filter(o => o.dentro_garantia).length,
  }), [ordens])

  const filtradas = useMemo(() => ordens.filter(o => {
    const matchSearch = !search ||
      o.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      (o.protocolo ?? '').includes(search) ||
      (o.imei_serial ?? '').includes(search) ||
      o.produto_nome.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || o.status === filtroStatus
    return matchSearch && matchStatus
  }), [ordens, search, filtroStatus])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtData = (d: string) => new Date(d).toLocaleDateString('pt-BR')

  function diasEmAberto(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    return Math.floor(diff / 86400000)
  }

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.06] shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[#F4F6F9]">Assistência</h1>
          <p className="text-sm text-[#5C6E84] mt-0.5">{ordens.length} ordens de serviço</p>
        </div>
        <button
          onClick={() => { setSelecionada(null); setModalOpen(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          Nova OS
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 px-8 py-5 shrink-0">
        {[
          { label: 'Total', value: stats.total, color: '#6B8CFF' },
          { label: 'Aguardando', value: stats.aguardando, color: '#F59E0B' },
          { label: 'Em Reparo', value: stats.em_reparo, color: '#6B8CFF' },
          { label: 'Prontos', value: stats.prontos, color: '#22C55E' },
          { label: 'Em Garantia', value: stats.garantia, color: '#D7282F' },
        ].map(s => (
          <div key={s.label} className="bg-[#0D1824] border border-white/[0.06] rounded-[14px] px-4 py-4 text-center">
            <div className="text-[11px] text-[#5C6E84] font-mono tracking-wide uppercase mb-1">{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 px-8 pb-4 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3F516A]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, protocolo, IMEI..."
            className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'aguardando', label: 'Aguardando' },
            { key: 'em_reparo', label: 'Em Reparo' },
            { key: 'pronto', label: 'Pronto' },
            { key: 'entregue', label: 'Entregue' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltroStatus(f.key)}
              className={cn(
                'px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all',
                filtroStatus === f.key ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
              )}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Protocolo', 'Cliente', 'Produto / IMEI', 'Defeito', 'Orçamento', 'Status', 'Dias', ''].map(h => (
                  <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase px-4 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-[#3F516A] text-sm">Nenhuma OS encontrada</td></tr>
              ) : filtradas.map(o => {
                const st = STATUS_CFG[o.status ?? 'aguardando'] ?? STATUS_CFG.aguardando
                const Icon = st.icon
                const dias = diasEmAberto(o.data_entrada)
                return (
                  <tr
                    key={o.id}
                    onClick={() => { setSelecionada(o); setModalOpen(true) }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-mono text-xs text-[#6B8CFF]">#{o.protocolo ?? o.id}</div>
                      {o.dentro_garantia && (
                        <div className="text-[9px] text-[#22C55E] font-mono mt-0.5">GARANTIA</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-semibold text-[#E9EEF4]">{o.cliente_nome}</div>
                      {o.cliente_telefone && <div className="text-xs text-[#5C6E84]">{o.cliente_telefone}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-[#D4DEEA]">{o.produto_nome}</div>
                      {o.imei_serial && <div className="font-mono text-[10px] text-[#3F516A]">{o.imei_serial}</div>}
                    </td>
                    <td className="px-4 py-3.5 max-w-[180px]">
                      <div className="text-xs text-[#8A9BB0] truncate">{o.defeito_relatado ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-semibold text-[#F4F6F9]">
                        {o.orcamento_valor ? fmt(o.orcamento_valor) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-full" style={{ color: st.color, background: st.bg }}>
                        <Icon size={11} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn('font-mono text-xs', dias > 7 ? 'text-[#F0353D]' : dias > 3 ? 'text-[#F59E0B]' : 'text-[#5C6E84]')}>
                        {dias}d
                      </span>
                    </td>
                    <td className="px-4 py-3.5"><ChevronRight size={15} className="text-[#3F516A]" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <OSModal
          ordem={selecionada}
          clientes={clientes}
          produtos={produtos}
          tecnicos={tecnicos}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
