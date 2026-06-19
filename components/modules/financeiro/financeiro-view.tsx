'use client'

import { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle,
  Plus, Filter, ChevronDown, ArrowUpRight, ArrowDownRight,
  Wallet, Receipt, X, Save, Trash2, Calendar
} from 'lucide-react'
import { cn, formatCurrency, formatDateShort } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Lancamento {
  id: number
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  data_venc: string
  data_pgto: string | null
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado'
  categoria: string | null
  forma_pgto: string | null
  observacoes: string | null
  created_at: string
}

interface Categoria {
  id: number
  nome: string
  tipo: string
  cor: string
}

interface Props {
  lancamentos: Lancamento[]
  categorias: Categoria[]
  vendasMes: Array<{ valor_venda: number; data_venda: string | null; forma_pagamento: string | null }>
}

const STATUS_CFG = {
  pendente:  { label: 'Pendente',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icon: Clock },
  pago:      { label: 'Pago',      color: '#34D399', bg: 'rgba(52,211,153,0.12)',  icon: CheckCircle2 },
  atrasado:  { label: 'Atrasado',  color: '#F0353D', bg: 'rgba(240,53,61,0.12)',   icon: AlertCircle },
  cancelado: { label: 'Cancelado', color: '#5C6E84', bg: 'rgba(92,110,132,0.12)',  icon: X },
}

const FORMAS = ['pix','dinheiro','credito','debito','transferencia','boleto']
const FORMAS_LABEL: Record<string,string> = {
  pix:'Pix', dinheiro:'Dinheiro', credito:'Crédito', debito:'Débito',
  transferencia:'Transferência', boleto:'Boleto',
}

const EMPTY: Partial<Lancamento> = {
  tipo: 'despesa',
  descricao: '',
  valor: 0,
  data_venc: new Date().toISOString().split('T')[0],
  status: 'pendente',
}

export function FinanceiroView({ lancamentos: initial, categorias, vendasMes }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [lancamentos, setLancamentos] = useState(initial)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionado, setSelecionado] = useState<Partial<Lancamento>>(EMPTY)
  const [saving, setSaving] = useState(false)

  // ── KPIs
  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  const doMes = lancamentos.filter(l => new Date(l.data_venc) >= inicioMes)
  const receitasMes = doMes.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((s,l) => s + l.valor, 0)
  const despesasMes = doMes.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((s,l) => s + l.valor, 0)
  const saldoMes = receitasMes - despesasMes
  const pendentesReceber = lancamentos.filter(l => l.tipo === 'receita' && ['pendente','atrasado'].includes(l.status)).reduce((s,l) => s + l.valor, 0)
  const pendentesPagar = lancamentos.filter(l => l.tipo === 'despesa' && ['pendente','atrasado'].includes(l.status)).reduce((s,l) => s + l.valor, 0)
  const atrasados = lancamentos.filter(l => l.status === 'atrasado').length

  // ── Filtro
  const filtrados = useMemo(() => {
    return lancamentos.filter(l => {
      if (filtroTipo !== 'todos' && l.tipo !== filtroTipo) return false
      if (filtroStatus !== 'todos' && l.status !== filtroStatus) return false
      return true
    })
  }, [lancamentos, filtroTipo, filtroStatus])

  // ── Abrir modal
  function abrirNovo() {
    setSelecionado({ ...EMPTY })
    setModalOpen(true)
  }
  function abrirEditar(l: Lancamento) {
    setSelecionado({ ...l })
    setModalOpen(true)
  }

  // ── Salvar
  async function salvar() {
    if (!selecionado.descricao || !selecionado.valor || !selecionado.data_venc) {
      toast.error('Preencha descrição, valor e vencimento')
      return
    }
    setSaving(true)
    const payload = {
      tipo: selecionado.tipo as 'receita' | 'despesa',
      descricao: selecionado.descricao as string,
      valor: Number(selecionado.valor),
      data_venc: selecionado.data_venc,
      data_pgto: selecionado.data_pgto || null,
      status: selecionado.status ?? 'pendente',
      categoria: selecionado.categoria || null,
      forma_pgto: selecionado.forma_pgto || null,
      observacoes: selecionado.observacoes || null,
    }
    if (selecionado.id) {
      const { error } = await supabase.from('lancamentos_financeiros').update(payload).eq('id', selecionado.id)
      if (error) { toast.error('Erro ao atualizar'); setSaving(false); return }
      setLancamentos(prev => prev.map(l => l.id === selecionado.id ? { ...l, ...payload } : l))
      toast.success('Lançamento atualizado')
    } else {
      const { data, error } = await supabase.from('lancamentos_financeiros').insert(payload).select().single()
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
      setLancamentos(prev => [data, ...prev])
      toast.success('Lançamento criado')
    }
    setSaving(false)
    setModalOpen(false)
  }

  // ── Excluir
  async function excluir() {
    if (!selecionado.id) return
    const { error } = await supabase.from('lancamentos_financeiros').delete().eq('id', selecionado.id)
    if (error) { toast.error('Erro ao excluir'); return }
    setLancamentos(prev => prev.filter(l => l.id !== selecionado.id))
    toast.success('Lançamento removido')
    setModalOpen(false)
  }

  // ── Marcar como pago rápido
  async function marcarPago(l: Lancamento, e: React.MouseEvent) {
    e.stopPropagation()
    const novo = l.status === 'pago' ? 'pendente' : 'pago'
    const { error } = await supabase
      .from('lancamentos_financeiros')
      .update({ status: novo, data_pgto: novo === 'pago' ? new Date().toISOString().split('T')[0] : null })
      .eq('id', l.id)
    if (error) { toast.error('Erro'); return }
    setLancamentos(prev => prev.map(x => x.id === l.id ? { ...x, status: novo as Lancamento['status'], data_pgto: novo === 'pago' ? new Date().toISOString().split('T')[0] : null } : x))
  }

  const set = (k: keyof Lancamento, v: unknown) => setSelecionado(p => ({ ...p, [k]: v }))
  const isNew = !selecionado.id
  const catsFiltradas = categorias.filter(c => c.tipo === selecionado.tipo || c.tipo === 'ambos')

  return (
    <div className="p-8 space-y-7">
      {/* ── KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Receitas do mês', value: receitasMes, icon: TrendingUp,    color: '#34D399', bg: 'rgba(52,211,153,0.08)' },
          { label: 'Despesas do mês', value: despesasMes, icon: TrendingDown,  color: '#F0353D', bg: 'rgba(240,53,61,0.08)' },
          { label: 'A receber',       value: pendentesReceber, icon: ArrowUpRight,  color: '#6B8CFF', bg: 'rgba(107,140,255,0.08)' },
          { label: 'A pagar',         value: pendentesPagar,   icon: ArrowDownRight, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: k.bg }}>
                <Icon size={18} style={{ color: k.color }} />
              </div>
              <div>
                <div className="text-[11px] text-[#5C6E84] font-mono tracking-wider uppercase mb-1">{k.label}</div>
                <div className="text-xl font-semibold text-[#F4F6F9]">{formatCurrency(k.value)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Saldo + atrasados */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className={cn('flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold',
          saldoMes >= 0
            ? 'bg-[rgba(52,211,153,0.08)] border-[rgba(52,211,153,0.2)] text-[#34D399]'
            : 'bg-[rgba(240,53,61,0.08)] border-[rgba(240,53,61,0.2)] text-[#F0353D]'
        )}>
          <Wallet size={14} />
          Saldo do mês: {formatCurrency(saldoMes)}
        </div>
        {atrasados > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(240,53,61,0.08)] border border-[rgba(240,53,61,0.2)] text-[#F0353D] text-sm font-semibold">
            <AlertCircle size={14} />
            {atrasados} lançamento{atrasados > 1 ? 's' : ''} em atraso
          </div>
        )}
      </div>

      {/* ── Controles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {(['todos','receita','despesa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
                filtroTipo === t
                  ? t === 'receita' ? 'bg-[rgba(52,211,153,0.15)] text-[#34D399]'
                    : t === 'despesa' ? 'bg-[rgba(240,53,61,0.15)] text-[#F0353D]'
                    : 'bg-[rgba(107,140,255,0.15)] text-[#6B8CFF]'
                  : 'text-[#5C6E84] hover:text-[#8A9BB0]'
              )}
            >
              {t === 'todos' ? 'Todos' : t === 'receita' ? 'Receitas' : 'Despesas'}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          {(['todos','pendente','pago','atrasado'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
                filtroStatus === s ? 'bg-white/10 text-[#D4DEEA]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
              )}
            >
              {s === 'todos' ? 'Qualquer status' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label}
            </button>
          ))}
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          Novo lançamento
        </button>
      </div>

      {/* ── Tabela */}
      <div className="bg-[#0D1824] border border-white/[0.06] rounded-[16px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['Tipo', 'Descrição', 'Categoria', 'Vencimento', 'Valor', 'Status', 'Pago em', ''].map(h => (
                <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#3F516A] uppercase px-4 py-3.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-[#3F516A] text-sm">Nenhum lançamento encontrado</td></tr>
            ) : filtrados.map(l => {
              const st = STATUS_CFG[l.status] ?? STATUS_CFG.pendente
              const StIcon = st.icon
              const isReceita = l.tipo === 'receita'
              const vencDate = new Date(l.data_venc + 'T00:00:00')
              const diasVenc = Math.ceil((vencDate.getTime() - hoje.getTime()) / 86400000)

              return (
                <tr
                  key={l.id}
                  onClick={() => abrirEditar(l)}
                  className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <span className={cn(
                      'flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-full',
                    )} style={{
                      color: isReceita ? '#34D399' : '#F0353D',
                      background: isReceita ? 'rgba(52,211,153,0.1)' : 'rgba(240,53,61,0.1)',
                    }}>
                      {isReceita ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {isReceita ? 'Receita' : 'Despesa'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-sm font-medium text-[#E9EEF4]">{l.descricao}</div>
                    {l.forma_pgto && <div className="text-xs text-[#5C6E84]">{FORMAS_LABEL[l.forma_pgto] ?? l.forma_pgto}</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-[#8A9BB0]">{l.categoria ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-sm text-[#D4DEEA]">{formatDateShort(l.data_venc)}</div>
                    {l.status === 'pendente' && diasVenc <= 3 && diasVenc >= 0 && (
                      <div className="text-[10px] text-[#F59E0B] font-mono">vence em {diasVenc}d</div>
                    )}
                    {l.status === 'atrasado' && (
                      <div className="text-[10px] text-[#F0353D] font-mono">{Math.abs(diasVenc)}d atrasado</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={cn('text-sm font-semibold', isReceita ? 'text-[#34D399]' : 'text-[#F4F6F9]')}>
                      {isReceita ? '+' : '-'}{formatCurrency(l.valor)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-full" style={{ color: st.color, background: st.bg }}>
                      <StIcon size={11} />
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-[#5C6E84]">{l.data_pgto ? formatDateShort(l.data_pgto) : '—'}</span>
                  </td>
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    {(l.status === 'pendente' || l.status === 'atrasado' || l.status === 'pago') && (
                      <button
                        onClick={e => marcarPago(l, e)}
                        className={cn(
                          'text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all',
                          l.status === 'pago'
                            ? 'bg-white/[0.06] text-[#5C6E84] hover:bg-white/10'
                            : 'bg-[rgba(52,211,153,0.12)] text-[#34D399] hover:bg-[rgba(52,211,153,0.2)]'
                        )}
                      >
                        {l.status === 'pago' ? 'Desfazer' : '✓ Pagar'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0D1824] border border-white/[0.08] rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
              <h2 className="text-base font-semibold text-[#F4F6F9]">
                {isNew ? 'Novo lançamento' : 'Editar lançamento'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-[#5C6E84] hover:text-[#D4DEEA] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {(['receita','despesa'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => set('tipo', t)}
                    className={cn(
                      'py-2.5 rounded-[10px] text-sm font-semibold transition-all border',
                      selecionado.tipo === t
                        ? t === 'receita'
                          ? 'bg-[rgba(52,211,153,0.12)] border-[rgba(52,211,153,0.3)] text-[#34D399]'
                          : 'bg-[rgba(240,53,61,0.12)] border-[rgba(240,53,61,0.3)] text-[#F0353D]'
                        : 'bg-transparent border-white/[0.08] text-[#5C6E84] hover:border-white/20'
                    )}
                  >
                    {t === 'receita' ? '↑ Receita' : '↓ Despesa'}
                  </button>
                ))}
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs text-[#5C6E84] mb-1.5">Descrição *</label>
                <input
                  value={selecionado.descricao ?? ''}
                  onChange={e => set('descricao', e.target.value)}
                  placeholder="Ex: Pagamento fornecedor, Venda à vista..."
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2]"
                />
              </div>

              {/* Valor + Vencimento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#5C6E84] mb-1.5">Valor (R$) *</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={selecionado.valor ?? ''}
                    onChange={e => set('valor', e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#5C6E84] mb-1.5">Vencimento *</label>
                  <input
                    type="date"
                    value={selecionado.data_venc ?? ''}
                    onChange={e => set('data_venc', e.target.value)}
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2]"
                  />
                </div>
              </div>

              {/* Categoria + Forma pgto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#5C6E84] mb-1.5">Categoria</label>
                  <select
                    value={selecionado.categoria ?? ''}
                    onChange={e => set('categoria', e.target.value || null)}
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2]"
                  >
                    <option value="">— Selecionar —</option>
                    {catsFiltradas.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#5C6E84] mb-1.5">Forma de pagamento</label>
                  <select
                    value={selecionado.forma_pgto ?? ''}
                    onChange={e => set('forma_pgto', e.target.value || null)}
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2]"
                  >
                    <option value="">— Selecionar —</option>
                    {FORMAS.map(f => <option key={f} value={f}>{FORMAS_LABEL[f]}</option>)}
                  </select>
                </div>
              </div>

              {/* Status + Data pgto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#5C6E84] mb-1.5">Status</label>
                  <select
                    value={selecionado.status ?? 'pendente'}
                    onChange={e => set('status', e.target.value)}
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2]"
                  >
                    {Object.entries(STATUS_CFG).map(([v,c]) => <option key={v} value={v}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#5C6E84] mb-1.5">Data de pagamento</label>
                  <input
                    type="date"
                    value={selecionado.data_pgto ?? ''}
                    onChange={e => set('data_pgto', e.target.value || null)}
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] outline-none focus:border-white/[0.2]"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs text-[#5C6E84] mb-1.5">Observações</label>
                <textarea
                  value={selecionado.observacoes ?? ''}
                  onChange={e => set('observacoes', e.target.value || null)}
                  rows={2}
                  placeholder="Notas adicionais..."
                  className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[9px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.2] resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0">
              {!isNew ? (
                <button onClick={excluir} className="flex items-center gap-2 text-xs text-[#5C6E84] hover:text-[#F0353D] transition-colors">
                  <Trash2 size={14} /> Remover
                </button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-[9px] text-sm text-[#5C6E84] hover:text-[#D4DEEA] transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-[9px] bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Save size={14} />
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
