'use client'
import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Lancamento {
  id: number
  tipo: string | null
  descricao: string | null
  valor: number | null
  data_venc: string | null
  data_pgto: string | null
  status: string | null
  categoria: string | null
  forma_pgto: string | null
  observacoes: string | null
  created_at: string
}
interface Props { lancamentos: Lancamento[] }

const TABS = [
  { key: 'fluxo',    label: 'Fluxo de Caixa'   },
  { key: 'pagar',    label: 'Contas a Pagar'    },
  { key: 'receber',  label: 'Contas a Receber'  },
  { key: 'dre',      label: 'DRE'               },
]

function fmtBRL(v: number | null) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function FinanceiroView({ lancamentos }: Props) {
  const [tab, setTab] = useState('fluxo')

  const stats = useMemo(() => {
    const entradas = lancamentos.filter(l => l.tipo === 'entrada')
    const saidas   = lancamentos.filter(l => l.tipo === 'saida')
    const aReceber = entradas.filter(l => l.status === 'pendente').reduce((s, l) => s + (l.valor ?? 0), 0)
    const aPagar   = saidas.filter(l => l.status === 'pendente').reduce((s, l) => s + (l.valor ?? 0), 0)
    const despesas = saidas.reduce((s, l) => s + (l.valor ?? 0), 0)
    const resultado = entradas.reduce((s, l) => s + (l.valor ?? 0), 0) - despesas
    return { aReceber, aPagar, despesas, resultado }
  }, [lancamentos])

  const aReceber = lancamentos.filter(l => l.tipo === 'entrada' && l.status === 'pendente')
  const aPagar   = lancamentos.filter(l => l.tipo === 'saida' && l.status === 'pendente')
  const todos    = lancamentos

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#788698] uppercase mb-0.5">Operação</p>
          <h1 className="text-xl font-bold text-[#16212E]">Financeiro</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 shrink-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-t-[10px] text-sm font-medium transition-all border-b-2',
              tab === t.key
                ? 'bg-white text-[#1F2A39] border-[#D7282F]'
                : 'text-[#788698] hover:text-[#788698] border-transparent'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4 shrink-0">
        {[
          { label: 'À receber',       value: fmtBRL(stats.aReceber),  sub: `${aReceber.length} lançamentos`, iconBg: 'rgba(34,197,94,0.15)',   iconColor: '#22C55E', icon: '↓' },
          { label: 'À pagar',         value: fmtBRL(stats.aPagar),    sub: `${aPagar.length} contas em aberto`, iconBg: 'rgba(245,158,11,0.15)', iconColor: '#F59E0B', icon: '↑' },
          { label: 'Despesas do mês', value: fmtBRL(stats.despesas),  sub: 'custo operacional', iconBg: 'rgba(59,125,232,0.15)', iconColor: '#3B7DE8', icon: '≡' },
          { label: 'Resultado líquido',value: fmtBRL(stats.resultado),sub: '+12,4% vs mês anterior', iconBg: 'rgba(139,92,246,0.15)', iconColor: '#8B5CF6', icon: '~' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: s.iconBg, color: s.iconColor }}>{s.icon}</div>
              <span className="text-[10px] font-mono tracking-widest text-[#788698] uppercase">{s.label}</span>
            </div>
            <div className="text-xl font-bold text-[#1F2A39]">{s.value}</div>
            <div className="text-[11px] text-[#788698] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Conteúdo da tab */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {tab === 'fluxo' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
              <div>
                <h2 className="text-base font-semibold text-[#1F2A39]">Livro-caixa</h2>
                <p className="text-[11px] text-[#788698] mt-0.5">
                  Entradas <span className="text-[#15986A]">+{fmtBRL(aReceber.reduce((s,l)=>s+(l.valor??0),0))}</span>
                  {' · '}Saídas <span className="text-[#D7282F]">−{fmtBRL(aPagar.reduce((s,l)=>s+(l.valor??0),0))}</span>
                </p>
              </div>
              <button className="flex items-center gap-1.5 px-4 py-2 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors">
                <Plus size={13} /> Novo lançamento
              </button>
            </div>
            <LancamentosTable lancamentos={todos} />
          </div>
        )}
        {tab === 'pagar' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
              <h2 className="text-base font-semibold text-[#1F2A39]">Contas a pagar</h2>
              <button className="flex items-center gap-1.5 px-4 py-2 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors"><Plus size={13} /> Nova conta</button>
            </div>
            <LancamentosTable lancamentos={aPagar} />
          </div>
        )}
        {tab === 'receber' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
              <h2 className="text-base font-semibold text-[#1F2A39]">Contas a receber</h2>
              <button className="flex items-center gap-1.5 px-4 py-2 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors"><Plus size={13} /> Novo título</button>
            </div>
            <LancamentosTable lancamentos={aReceber} />
          </div>
        )}
        {tab === 'dre' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-8 text-center">
            <p className="text-[#788698] text-sm">DRE em desenvolvimento</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LancamentosTable({ lancamentos }: { lancamentos: Lancamento[] }) {
  if (lancamentos.length === 0) return <p className="text-center py-12 text-[#9AA7B6] text-sm">Nenhum lançamento</p>
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[#16212E]/[0.08]">
          {['Data','Descrição','Categoria','Tipo','Valor','Status'].map(h => (
            <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#788698] uppercase px-5 py-3.5 whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lancamentos.map(l => {
          const isEntrada = l.tipo === 'entrada'
          return (
            <tr key={l.id} className="border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.04] cursor-pointer transition-colors last:border-0">
              <td className="px-5 py-3.5 text-sm text-[#788698]">{new Date(l.data_venc ?? l.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</td>
              <td className="px-5 py-3.5 text-sm font-medium text-[#1F2A39]">{l.descricao ?? '—'}</td>
              <td className="px-5 py-3.5 text-sm text-[#788698]">{l.categoria ?? '—'}</td>
              <td className="px-5 py-3.5">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ color: isEntrada ? '#22C55E' : '#D7282F', backgroundColor: isEntrada ? 'rgba(34,197,94,0.12)' : 'rgba(215,40,47,0.12)' }}>
                  {isEntrada ? 'Entrada' : 'Saída'}
                </span>
              </td>
              <td className="px-5 py-3.5 text-sm font-bold" style={{ color: isEntrada ? '#22C55E' : '#D7282F' }}>
                {isEntrada ? '+' : '−'} {l.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}
              </td>
              <td className="px-5 py-3.5">
                <span className={cn('text-sm font-medium', l.status === 'pago' || l.status === 'recebido' ? 'text-[#15986A]' : 'text-[#B47B12]')}>
                  {l.status === 'pago' || l.status === 'recebido' ? 'Pago' : 'Pendente'}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
