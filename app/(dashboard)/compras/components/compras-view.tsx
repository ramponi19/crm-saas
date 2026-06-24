'use client'
import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Pedido {
  id: number
  descricao: string | null
  valor_total: number | null
  status: string | null
  data_pedido: string | null
  created_at: string | null
  observacoes: string | null
  fornecedor_id: number | null
  fornecedores: { nome_fantasia: string; contato: string | null; telefone: string | null } | null
}
interface Fornecedor {
  id: number
  nome_fantasia: string
  razao_social: string | null
  cnpj: string | null
  contato: string | null
  telefone: string | null
  email: string | null
  created_at: string | null
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

const FORM_VAZIO = { nome_fantasia: '', razao_social: '', cnpj: '', contato: '', telefone: '', email: '' }
const PEDIDO_VAZIO = { descricao: '', fornecedor_id: '', valor_total: '', data_pedido: '', observacoes: '', status: 'aberto' }

export default function ComprasView({ pedidos: pedidosInit, fornecedores: fornecedoresInit }: Props) {
  const [pedidos,        setPedidos]        = useState(pedidosInit)
  const [fornecedores,   setFornecedores]   = useState(fornecedoresInit)
  const [modalFornecedor, setModalFornecedor] = useState(false)
  const [modalPedido,    setModalPedido]    = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (modalFornecedor) setModalFornecedor(false)
      else if (modalPedido) setModalPedido(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modalFornecedor, modalPedido])
  const [form,           setForm]           = useState(FORM_VAZIO)
  const [formPedido,     setFormPedido]     = useState(PEDIDO_VAZIO)
  const [salvando,       setSalvando]       = useState(false)
  const [salvandoPedido, setSalvandoPedido] = useState(false)
  const [erro,           setErro]           = useState<string | null>(null)
  const [erroPedido,     setErroPedido]     = useState<string | null>(null)

  async function salvarPedido() {
    if (!formPedido.descricao.trim()) { setErroPedido('Descrição é obrigatória'); return }
    if (formPedido.valor_total && isNaN(parseFloat(formPedido.valor_total.replace(',', '.')))) {
      setErroPedido('Valor total inválido'); return
    }
    setSalvandoPedido(true)
    setErroPedido(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('pedidos_compra')
      .insert({
        descricao:     formPedido.descricao.trim(),
        fornecedor_id: formPedido.fornecedor_id ? Number(formPedido.fornecedor_id) : null,
        valor_total:   formPedido.valor_total ? parseFloat(formPedido.valor_total.replace(',', '.')) : null,
        data_pedido:   formPedido.data_pedido || null,
        observacoes:   formPedido.observacoes.trim() || null,
        status:        formPedido.status,
      })
      .select('*, fornecedores(nome_fantasia, contato, telefone)')
      .single()
    if (error) { setErroPedido('Erro ao salvar. Tente novamente.') }
    else { setPedidos(p => [data as Pedido, ...p]); setModalPedido(false); setFormPedido(PEDIDO_VAZIO) }
    setSalvandoPedido(false)
  }

  const stats = {
    abertos:    pedidos.filter(p => p.status === 'aberto').length,
    transito:   pedidos.filter(p => p.status === 'em_transito').length,
    recebidos:  pedidos.filter(p => p.status === 'recebido').length,
    investido:  pedidos.reduce((s, p) => s + (p.valor_total ?? 0), 0),
  }

  function set(k: keyof typeof FORM_VAZIO, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function salvarFornecedor() {
    if (!form.nome_fantasia.trim()) { setErro('Nome fantasia é obrigatório'); return }
    setSalvando(true)
    setErro(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('fornecedores')
      .insert({
        nome_fantasia: form.nome_fantasia.trim(),
        razao_social:  form.razao_social.trim() || null,
        cnpj:          form.cnpj.trim() || null,
        contato:       form.contato.trim() || null,
        telefone:      form.telefone.trim() || null,
        email:         form.email.trim() || null,
        ativo:         true,
      })
      .select()
      .single()

    if (error) {
      setErro('Erro ao salvar. Tente novamente.')
    } else {
      setFornecedores(f => [...f, data as Fornecedor])
      setModalFornecedor(false)
      setForm(FORM_VAZIO)
    }
    setSalvando(false)
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
          { label: 'Pedidos abertos', value: stats.abertos,  iconBg: 'rgba(59,125,232,0.15)',  icon: '🛒' },
          { label: 'Em trânsito',     value: stats.transito,  iconBg: 'rgba(245,158,11,0.15)',  icon: '🚚' },
          { label: 'Recebidos no mês',value: stats.recebidos, iconBg: 'rgba(34,197,94,0.15)',   icon: '📦' },
          { label: 'Investido no mês',value: fmtBRL(stats.investido), iconBg: 'rgba(139,92,246,0.15)', icon: '💰' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: s.iconBg }}>{s.icon}</div>
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
            <button
              onClick={() => { setFormPedido(PEDIDO_VAZIO); setErroPedido(null); setModalPedido(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D7282F] hover:bg-[#C01F26] text-white text-xs font-semibold rounded-[8px] transition-colors">
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
                    <div className="text-[11px] text-[#788698] mt-0.5">{p.fornecedores?.nome_fantasia ?? '—'} · {fmtData(p.data_pedido ?? p.created_at)}</div>
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
            <button
              onClick={() => { setForm(FORM_VAZIO); setErro(null); setModalFornecedor(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D7282F] hover:bg-[#C01F26] text-white text-xs font-semibold rounded-[8px] transition-colors"
            >
              <Plus size={13} /> Novo
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {fornecedores.length === 0 ? (
              <p className="text-center py-12 text-[#9AA7B6] text-sm">Nenhum fornecedor</p>
            ) : fornecedores.map(f => {
              const color = avatarColor(f.nome_fantasia)
              const initials = f.nome_fantasia.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
              const qtd = pedidos.filter(p => p.fornecedor_id === f.id).length
              return (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#16212E]/[0.06] hover:bg-[#16212E]/[0.03] cursor-pointer last:border-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: color }}>{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1F2A39] truncate">{f.nome_fantasia}</div>
                    <div className="text-[11px] text-[#788698] truncate">{f.contato ?? '—'}{f.telefone ? ` · ${f.telefone}` : ''}</div>
                  </div>
                  <span className="text-[11px] text-[#788698] shrink-0">{qtd} pedidos</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Modal novo fornecedor */}
      {modalFornecedor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08]">
              <h2 className="text-base font-bold text-[#1F2A39]">Novo fornecedor</h2>
              <button onClick={() => setModalFornecedor(false)} className="text-[#788698] hover:text-[#1F2A39] transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'Nome fantasia *', key: 'nome_fantasia', placeholder: 'Ex: Distribuidora ABC' },
                { label: 'Razão social',    key: 'razao_social',  placeholder: 'Ex: ABC Comércio Ltda' },
                { label: 'CNPJ',            key: 'cnpj',          placeholder: '00.000.000/0000-00' },
                { label: 'Contato (pessoa)',key: 'contato',       placeholder: 'Nome do responsável' },
                { label: 'Telefone',        key: 'telefone',      placeholder: '(11) 99999-9999' },
                { label: 'E-mail',          key: 'email',         placeholder: 'contato@fornecedor.com' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">{label}</label>
                  <input
                    type="text"
                    value={form[key as keyof typeof FORM_VAZIO]}
                    onChange={e => set(key as keyof typeof FORM_VAZIO, e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors"
                  />
                </div>
              ))}

              {erro && <p className="text-xs text-[#D7282F]">{erro}</p>}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setModalFornecedor(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-[#788698] bg-[#F4F6F9] rounded-[10px] hover:bg-[#E8EAED] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarFornecedor}
                disabled={salvando}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#D7282F] hover:bg-[#C01F26] rounded-[10px] transition-colors disabled:opacity-60"
              >
                {salvando ? 'Salvando...' : 'Salvar fornecedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo pedido */}
      {modalPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08]">
              <h2 className="text-base font-bold text-[#1F2A39]">Novo pedido de compra</h2>
              <button onClick={() => setModalPedido(false)} className="text-[#788698] hover:text-[#1F2A39] transition-colors"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Descrição *</label>
                <input value={formPedido.descricao} onChange={e => setFormPedido(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Reposição de estoque smartphones"
                  className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Fornecedor</label>
                <select value={formPedido.fornecedor_id} onChange={e => setFormPedido(f => ({ ...f, fornecedor_id: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors">
                  <option value="">— Selecionar —</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Valor total (R$)</label>
                  <input value={formPedido.valor_total} onChange={e => setFormPedido(f => ({ ...f, valor_total: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Data do pedido</label>
                  <input type="date" value={formPedido.data_pedido} onChange={e => setFormPedido(f => ({ ...f, data_pedido: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Status</label>
                <select value={formPedido.status} onChange={e => setFormPedido(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors">
                  {Object.entries(STATUS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5">Observações</label>
                <textarea value={formPedido.observacoes} onChange={e => setFormPedido(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2} placeholder="Informações adicionais..."
                  className="w-full px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] rounded-[10px] outline-none focus:border-[#D7282F]/50 transition-colors resize-none" />
              </div>
              {erroPedido && <p className="text-xs text-[#D7282F]">{erroPedido}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModalPedido(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-[#788698] bg-[#F4F6F9] rounded-[10px] hover:bg-[#E8EAED] transition-colors">
                Cancelar
              </button>
              <button onClick={salvarPedido} disabled={salvandoPedido}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#D7282F] hover:bg-[#C01F26] rounded-[10px] transition-colors disabled:opacity-60">
                {salvandoPedido ? 'Salvando...' : 'Criar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
