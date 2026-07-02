'use client'
import { useState } from 'react'
import { Plus, X, Save, Pencil, Star, Users, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Plano {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  stripe_price_id: string | null
  limite_usuarios: number
  limite_leads: number
  features: string[]
  destaque: boolean
  ativo: boolean
  ordem: number
  cor: string
}

const ADMIN_COR = '#7C3AED'
const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] outline-none focus:border-[#7C3AED]/40 transition-colors'
const labelCls = 'block text-[11px] font-semibold text-[#788698] uppercase tracking-wide mb-1.5'

function fmtPreco(centavos: number) {
  if (centavos === 0) return 'Grátis'
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês`
}

export default function PlanosAdminView({ planos: initial }: { planos: Plano[] }) {
  const [planos, setPlanos] = useState<Plano[]>(initial)
  const [editing, setEditing] = useState<Plano | null>(null)
  const [saving, setSaving] = useState(false)
  const [newFeature, setNewFeature] = useState('')

  function abrirEdicao(p: Plano) {
    setEditing({ ...p, features: Array.isArray(p.features) ? [...p.features] : [] })
  }

  function setField<K extends keyof Plano>(k: K, v: Plano[K]) {
    setEditing(e => e ? { ...e, [k]: v } : e)
  }

  function addFeature() {
    const f = newFeature.trim()
    if (!f || !editing) return
    setEditing(e => e ? { ...e, features: [...e.features, f] } : e)
    setNewFeature('')
  }

  function removeFeature(i: number) {
    setEditing(e => e ? { ...e, features: e.features.filter((_, idx) => idx !== i) } : e)
  }

  async function salvar() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/planos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setPlanos(prev => prev.map(p => p.id === editing.id ? json.plano : p))
      setEditing(null)
      toast.success('Plano salvo!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-[#16212E]/[0.08] shrink-0">
        <p className="text-[10px] font-mono tracking-[0.2em] uppercase mb-0.5" style={{ color: ADMIN_COR }}>SUPER ADMIN</p>
        <h1 className="text-[22px] font-bold text-[#16212E]">Gestão de Planos</h1>
        <p className="text-sm text-[#788698] mt-0.5">Edite preços, limites e funcionalidades de cada plano</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Cards dos planos */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {planos.map(p => (
            <div key={p.id}
              className={cn('bg-white border rounded-[20px] p-6 relative transition-all',
                p.destaque ? 'border-2 shadow-lg' : 'border-[#16212E]/[0.08]')}
              style={p.destaque ? { borderColor: p.cor, boxShadow: `0 8px 32px ${p.cor}22` } : {}}>

              {p.destaque && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold text-white"
                  style={{ background: p.cor }}>
                  <Star size={10} fill="white" /> DESTAQUE
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full" style={{ background: p.cor }} />
                    <h3 className="text-lg font-bold text-[#1F2A39]">{p.nome}</h3>
                    {!p.ativo && <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-500 rounded-full font-semibold">Inativo</span>}
                  </div>
                  <p className="text-xs text-[#788698]">{p.descricao}</p>
                </div>
                <button onClick={() => abrirEdicao(p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors hover:opacity-80"
                  style={{ background: `${ADMIN_COR}15`, color: ADMIN_COR }}>
                  <Pencil size={12} /> Editar
                </button>
              </div>

              <div className="text-2xl font-bold text-[#1F2A39] mb-4">{fmtPreco(p.preco_centavos)}</div>

              <div className="flex gap-4 mb-4 text-xs text-[#788698]">
                <span className="flex items-center gap-1"><Users size={12} /> {p.limite_usuarios === 999 ? 'Ilimitados' : p.limite_usuarios} usuários</span>
                <span className="flex items-center gap-1"><Layers size={12} /> {p.limite_leads >= 99999 ? 'Ilimitados' : p.limite_leads} leads</span>
              </div>

              <ul className="space-y-1">
                {(Array.isArray(p.features) ? p.features : []).map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-[#56657A]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.cor }} />
                    {f}
                  </li>
                ))}
              </ul>

              {p.stripe_price_id && (
                <p className="mt-3 text-[10px] font-mono text-[#9AA7B6] truncate">Stripe: {p.stripe_price_id}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[20px] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#16212E]/[0.08] shrink-0">
              <div>
                <h2 className="text-base font-bold text-[#1F2A39]">Editar plano</h2>
                <p className="text-xs text-[#788698]">ID: <span className="font-mono">{editing.id}</span></p>
              </div>
              <button onClick={() => setEditing(null)} className="text-[#788698] hover:text-[#1F2A39] transition-colors"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Nome + Descrição */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nome</label>
                  <input value={editing.nome} onChange={e => setField('nome', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Cor (hex)</label>
                  <div className="flex gap-2">
                    <input type="color" value={editing.cor} onChange={e => setField('cor', e.target.value)}
                      className="w-11 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <input value={editing.cor} onChange={e => setField('cor', e.target.value)} className={cn(inputCls, 'font-mono')} />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Descrição</label>
                <input value={editing.descricao ?? ''} onChange={e => setField('descricao', e.target.value)} className={inputCls} />
              </div>

              {/* Preço + Stripe */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Preço (centavos)</label>
                  <input type="number" min="0" value={editing.preco_centavos}
                    onChange={e => setField('preco_centavos', Number(e.target.value))} className={inputCls} />
                  <p className="text-[10px] text-[#9AA7B6] mt-1">{fmtPreco(editing.preco_centavos)}</p>
                </div>
                <div>
                  <label className={labelCls}>Stripe Price ID</label>
                  <input value={editing.stripe_price_id ?? ''} onChange={e => setField('stripe_price_id', e.target.value || null)}
                    className={cn(inputCls, 'font-mono text-xs')} placeholder="price_..." />
                </div>
              </div>

              {/* Limites */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Limite de usuários</label>
                  <input type="number" min="1" value={editing.limite_usuarios}
                    onChange={e => setField('limite_usuarios', Number(e.target.value))} className={inputCls} />
                  <p className="text-[10px] text-[#9AA7B6] mt-1">999 = ilimitado</p>
                </div>
                <div>
                  <label className={labelCls}>Limite de leads</label>
                  <input type="number" min="1" value={editing.limite_leads}
                    onChange={e => setField('limite_leads', Number(e.target.value))} className={inputCls} />
                  <p className="text-[10px] text-[#9AA7B6] mt-1">99999 = ilimitado</p>
                </div>
              </div>

              {/* Flags */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.destaque} onChange={e => setField('destaque', e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-600" />
                  <span className="text-sm font-medium text-[#56657A]">Plano destaque</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.ativo} onChange={e => setField('ativo', e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-600" />
                  <span className="text-sm font-medium text-[#56657A]">Ativo (visível)</span>
                </label>
              </div>

              {/* Features */}
              <div>
                <label className={labelCls}>Funcionalidades</label>
                <div className="space-y-1.5 mb-2">
                  {editing.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#F4F6F9] rounded-[8px]">
                      <span className="flex-1 text-sm text-[#1F2A39]">{f}</span>
                      <button onClick={() => removeFeature(i)} className="text-[#9AA7B6] hover:text-[#16212E] transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newFeature} onChange={e => setNewFeature(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() }}}
                    placeholder="Nova funcionalidade..." className={cn(inputCls, 'flex-1')} />
                  <button onClick={addFeature}
                    className="flex items-center gap-1 px-3 py-2 rounded-[10px] text-sm font-semibold text-white transition-colors"
                    style={{ background: ADMIN_COR }}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#16212E]/[0.08] shrink-0">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2.5 text-sm font-semibold text-[#788698] bg-[#F4F6F9] rounded-[10px] hover:bg-[#E8EAED] transition-colors">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-[10px] disabled:opacity-50 transition-colors"
                style={{ background: ADMIN_COR }}>
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar plano'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
