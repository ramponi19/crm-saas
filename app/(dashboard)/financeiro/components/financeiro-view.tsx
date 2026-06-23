'use client'
import { useState, useMemo } from 'react'
import { Plus, X, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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
interface Categoria {
  id: number
  nome: string
  tipo: string
  cor: string
}
interface Props { lancamentos: Lancamento[]; categorias: Categoria[] }

const TABS = [
  { key: 'fluxo',   label: 'Fluxo de Caixa'  },
  { key: 'pagar',   label: 'Contas a Pagar'   },
  { key: 'receber', label: 'Contas a Receber' },
  { key: 'dre',     label: 'DRE'              },
]

const FORMAS = ['pix','dinheiro','credito','debito','transferencia','boleto']
const FORMAS_LABEL: Record<string,string> = {
  pix:'Pix', dinheiro:'Dinheiro', credito:'Crédito', debito:'Débito',
  transferencia:'Transferência', boleto:'Boleto',
}

const EMPTY_FORM = {
  tipo: 'despesa' as string,
  descricao: '',
  valor: '' as string | number,
  data_venc: new Date().toISOString().split('T')[0],
  data_pgto: '',
  status: 'pendente',
  categoria: '',
  forma_pgto: '',
  observacoes: '',
}

function fmtBRL(v: number | null) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function FinanceiroView({ lancamentos: initial, categorias }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState('fluxo')
  const [lancamentos, setLancamentos] = useState(initial)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const stats = useMemo(() => {
    const receitas = lancamentos.filter(l => l.tipo === 'receita')
    const despesas = lancamentos.filter(l => l.tipo === 'despesa')
    const aReceber = receitas.filter(l => l.status === 'pendente').reduce((s, l) => s + (l.valor ?? 0), 0)
    const aPagar   = despesas.filter(l => l.status === 'pendente').reduce((s, l) => s + (l.valor ?? 0), 0)
    const totalDespesas = despesas.reduce((s, l) => s + (l.valor ?? 0), 0)
    const resultado = receitas.reduce((s, l) => s + (l.valor ?? 0), 0) - totalDespesas
    return { aReceber, aPagar, despesas: totalDespesas, resultado }
  }, [lancamentos])

  const listaReceber = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pendente')
  const listaPagar   = lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pendente')
  const todos        = lancamentos

  function abrirNovo(tipoInicial: string) {
    setForm({ ...EMPTY_FORM, tipo: tipoInicial })
    setEditId(null)
    setErro(null)
    setModal(true)
  }

  function abrirEditar(l: Lancamento) {
    setForm({
      tipo:        l.tipo ?? 'despesa',
      descricao:   l.descricao ?? '',
      valor:       l.valor ?? '',
      data_venc:   l.data_venc ?? '',
      data_pgto:   l.data_pgto ?? '',
      status:      l.status ?? 'pendente',
      categoria:   l.categoria ?? '',
      forma_pgto:  l.forma_pgto ?? '',
      observacoes: l.observacoes ?? '',
    })
    setEditId(l.id)
    setErro(null)
    setModal(true)
  }

  function set(k: keyof typeof EMPTY_FORM, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function salvar() {
    if (!form.descricao.trim()) { setErro('Descrição é obrigatória'); return }
    if (!form.valor || Number(form.valor) <= 0) { setErro('Valor deve ser maior que zero'); return }
    if (!form.data_venc) { setErro('Data de vencimento é obrigatória'); return }
    setSaving(true)
    setErro(null)
    const payload = {
      tipo:        form.tipo,
      descricao:   form.descricao.trim(),
      valor:       Number(form.valor),
      data_venc:   form.data_venc,
      data_pgto:   form.data_pgto || null,
      status:      form.status,
      categoria:   form.categoria || null,
      forma_pgto:  form.forma_pgto || null,
      observacoes: form.observacoes.trim() || null,
    }
    if (editId) {
      const { error } = await supabase.from('lancamentos_financeiros').update(payload).eq('id', editId)
      if (error) { setErro('Erro ao atualizar. Tente novamente.'); setSaving(false); return }
      setLancamentos(prev => prev.map(l => l.id === editId ? { ...l, ...payload } : l))
    } else {
      const { data, error } = await supabase.from('lancamentos_financeiros').insert(payload).select().single()
      if (error) { setErro('Erro ao salvar. Tente novamente.'); setSaving(false); return }
      setLancamentos(prev => [data as Lancamento, ...prev])
    }
    setSaving(false)
    setModal(false)
  }

  async function excluir() {
    if (!editId) return
    const { error } = await supabase.from('lancamentos_financeiros').delete().eq('id', editId)
    if (error) { setErro('Erro ao excluir.'); return }
    setLancamentos(prev => prev.filter(l => l.id !== editId))
    setModal(false)
  }

  const catsFiltradas = categorias.filter(c => c.tipo === form.tipo || c.tipo === 'ambos')

  return (
    <div className="flex flex-col h-full bg-[#F4F6F9] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#788698] uppercase mb-0.5">Operação</p>
          <h1 className="text-xl font-bold text-[#16212E]">Financeiro</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 pb-0 shrink-0">
        <div className="flex gap-[4px] bg-white border border-[#16212E]/[0.08] rounded-[13px] p-[5px] w-max">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-[16px] py-[9px] rounded-[9px] text-[13.5px] font-semibold transition-all whitespace-nowrap',
                tab === t.key
                  ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white shadow-[0_4px_14px_rgba(215,40,47,0.35)]'
                  : 'text-[#788698] hover:text-[#16212E] hover:bg-[#16212E]/[0.04]'
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4 shrink-0">
        {[
          { label: 'À receber',        value: fmtBRL(stats.aReceber),  sub: `${listaReceber.length} lançamentos`,    iconBg: 'rgba(34,197,94,0.15)',   iconColor: '#22C55E', icon: '↓' },
          { label: 'À pagar',          value: fmtBRL(stats.aPagar),    sub: `${listaPagar.length} contas em aberto`, iconBg: 'rgba(245,158,11,0.15)',  iconColor: '#F59E0B', icon: '↑' },
          { label: 'Despesas do mês',  value: fmtBRL(stats.despesas),  sub: 'custo operacional',                     iconBg: 'rgba(59,125,232,0.15)',  iconColor: '#3B7DE8', icon: '≡' },
          { label: 'Resultado líquido',value: fmtBRL(stats.resultado), sub: 'receitas − despesas',                   iconBg: 'rgba(139,92,246,0.15)',  iconColor: '#8B5CF6', icon: '~' },
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
                  Entradas <span className="text-[#15986A]">+{fmtBRL(listaReceber.reduce((s,l)=>s+(l.valor??0),0))}</span>
                  {' · '}Saídas <span className="text-[#D7282F]">−{fmtBRL(listaPagar.reduce((s,l)=>s+(l.valor??0),0))}</span>
                </p>
              </div>
              <button onClick={() => abrirNovo('receita')} className="flex items-center gap-1.5 px-4 py-2 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors">
                <Plus size={13} /> Novo lançamento
              </button>
            </div>
            <LancamentosTable lancamentos={todos} onEditar={abrirEditar} />
          </div>
        )}
        {tab === 'pagar' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
              <h2 className="text-base font-semibold text-[#1F2A39]">Contas a pagar</h2>
              <button onClick={() => abrirNovo('despesa')} className="flex items-center gap-1.5 px-4 py-2 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors">
                <Plus size={13} /> Nova conta
              </button>
            </div>
            <LancamentosTable lancamentos={listaPagar} onEditar={abrirEditar} />
          </div>
        )}
        {tab === 'receber' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#16212E]/[0.08]">
              <h2 className="text-base font-semibold text-[#1F2A39]">Contas a receber</h2>
              <button onClick={() => abrirNovo('receita')} className="flex items-center gap-1.5 px-4 py-2 bg-[#D7282F] hover:bg-[#C0232A] text-white text-xs font-semibold rounded-[8px] transition-colors">
                <Plus size={13} /> Novo título
              </button>
            </div>
            <LancamentosTable lancamentos={listaReceber} onEditar={abrirEditar} />
          </div>
        )}
        {tab === 'dre' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-8 text-center">
            <p className="text-[#788698] text-sm">DRE em desenvolvimento</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08] shrink-0">
              <h2 className="text-base font-bold text-[#1F2A39]">{editId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
              <button onClick={() => setModal(false)} className="text-[#788698] hover:text-[#1F2A39] transition-colors"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {(['receita','despesa'] as const).map(t => (
                  <button key={t} onClick={() => set('tipo', t)}
                    className={cn(
                      'py-2.5 rounded-[10px] text-sm font-semibold transition-all border',
                      form.tipo === t
                        ? t === 'receita'
                          ? 'bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.3)] text-[#15986A]'
                          : 'bg-[rgba(215,40,47,0.1)] border-[rgba(215,40,47,0.3)] text-[#D7282F]'
                        : 'bg-transparent border-[#16212E]/[0.1] text-[#788698] hover:border-[#16212E]/20'
                    )}>
                    {t === 'receita' ? '↑ Receita' : '↓ Despesa'}
                  </button>
                ))}
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Descrição *</label>
                <input value={form.descricao} onChange={e => set('descricao', e.target.value)}
                  placeholder="Ex: Pagamento fornecedor, Venda à vista..."
                  className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
              </div>

              {/* Valor + Vencimento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Valor (R$) *</label>
                  <input type="number" step="0.01" min="0" value={form.valor} onChange={e => set('valor', e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Vencimento *</label>
                  <input type="date" value={form.data_venc} onChange={e => set('data_venc', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
                </div>
              </div>

              {/* Categoria + Forma */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Categoria</label>
                  <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors">
                    <option value="">— Selecionar —</option>
                    {catsFiltradas.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Forma de pagamento</label>
                  <select value={form.forma_pgto} onChange={e => set('forma_pgto', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors">
                    <option value="">— Selecionar —</option>
                    {FORMAS.map(f => <option key={f} value={f}>{FORMAS_LABEL[f]}</option>)}
                  </select>
                </div>
              </div>

              {/* Status + Data pgto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors">
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Data de pagamento</label>
                  <input type="date" value={form.data_pgto} onChange={e => set('data_pgto', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Observações</label>
                <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
                  rows={2} placeholder="Notas adicionais..."
                  className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors resize-none" />
              </div>

              {erro && <p className="text-xs text-[#D7282F]">{erro}</p>}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[#16212E]/[0.08] shrink-0">
              {editId ? (
                <button onClick={excluir} className="flex items-center gap-1.5 text-xs text-[#788698] hover:text-[#D7282F] transition-colors">
                  <Trash2 size={13} /> Remover
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button onClick={() => setModal(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-[#788698] bg-[#F4F6F9] rounded-[10px] hover:bg-[#E8EAED] transition-colors">
                  Cancelar
                </button>
                <button onClick={salvar} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#D7282F] hover:bg-[#C0232A] rounded-[10px] transition-colors disabled:opacity-60">
                  <Save size={13} />
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LancamentosTable({ lancamentos, onEditar }: { lancamentos: Lancamento[]; onEditar: (l: Lancamento) => void }) {
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
          const isReceita = l.tipo === 'receita'
          return (
            <tr key={l.id} onClick={() => onEditar(l)} className="border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.04] cursor-pointer transition-colors last:border-0">
              <td className="px-5 py-3.5 text-sm text-[#788698]">{new Date((l.data_venc ?? l.created_at) + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</td>
              <td className="px-5 py-3.5 text-sm font-medium text-[#1F2A39]">{l.descricao ?? '—'}</td>
              <td className="px-5 py-3.5 text-sm text-[#788698]">{l.categoria ?? '—'}</td>
              <td className="px-5 py-3.5">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ color: isReceita ? '#22C55E' : '#D7282F', backgroundColor: isReceita ? 'rgba(34,197,94,0.12)' : 'rgba(215,40,47,0.12)' }}>
                  {isReceita ? 'Receita' : 'Despesa'}
                </span>
              </td>
              <td className="px-5 py-3.5 text-sm font-bold" style={{ color: isReceita ? '#22C55E' : '#D7282F' }}>
                {isReceita ? '+' : '−'} {l.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}
              </td>
              <td className="px-5 py-3.5">
                <span className={cn('text-sm font-medium', l.status === 'pago' ? 'text-[#15986A]' : l.status === 'atrasado' ? 'text-[#D7282F]' : 'text-[#B47B12]')}>
                  {l.status === 'pago' ? 'Pago' : l.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
