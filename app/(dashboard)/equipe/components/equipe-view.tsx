'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Save, ChevronLeft, ChevronRight, Check, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Usuario {
  id: string; nome: string; email: string | null; role: string | null
  modulos_acesso: string[] | null; ultimo_acesso: string | null; created_at: string | null
}
interface Meta {
  id?: number; usuario_id: string | null; mes_ano: string
  meta_vendas_valor: number | null; meta_vendas_qtd: number | null
  percentual_comissao_padrao: number | null; empresa_id?: number
}
interface VendaResumo { vendedor_id: string | null; valor_venda: number | null; status: string | null }
interface ComissaoPaga {
  id: number; usuario_id: string | null; valor_comissao: number | null
  data_pagamento: string | null; created_at: string | null
}

interface Props {
  usuarios: Usuario[]
  metasIniciais: Meta[]
  vendasMes: VendaResumo[]
  comissoesPagas: ComissaoPaga[]
  mesAtual: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'usuarios',  label: 'Usuários'  },
  { key: 'metas',     label: 'Metas'     },
  { key: 'comissoes', label: 'Comissões' },
]

const ROLES = [
  { value: 'admin',    label: 'Administrador', color: '#D7282F', bg: 'rgba(215,40,47,0.12)'  },
  { value: 'vendedor', label: 'Vendedor',       color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  { value: 'tecnico',  label: 'Técnico',         color: '#3B7DE8', bg: 'rgba(59,125,232,0.12)' },
  { value: 'owner',    label: 'Proprietário',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
]

const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-sm text-[#1F2A39] placeholder:text-[#9AA7B6] bg-white border border-[#16212E]/[0.10] focus:border-[#16212E]/20 outline-none transition-colors'
const labelCls = 'block text-[9.5px] font-mono tracking-[0.15em] text-[#9AA7B6] uppercase mb-1.5'

function avatarColor(name: string) {
  const colors = ['#D7282F','#3B7DE8','#22C55E','#F59E0B','#8B5CF6','#EC4899','#06B6D4']
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}
function initials(nome: string) {
  return nome.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
function fmtAcesso(d: string | null) {
  if (!d) return '—'
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (diff < 2) return 'Agora'; if (diff < 60) return `${diff} min`
  if (diff < 1440) return `${Math.floor(diff/60)}h`; if (diff < 2880) return 'Ontem'
  return new Date(d).toLocaleDateString('pt-BR')
}
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y-1}-12` : `${y}-${String(mo-1).padStart(2,'0')}`
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y+1}-01` : `${y}-${String(mo+1).padStart(2,'0')}`
}
function fmtMes(m: string) {
  const [y, mo] = m.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[Number(mo)-1]} ${y}`
}

// ─── Modal de Usuário ─────────────────────────────────────────────────────────

function UsuarioModal({ usuario, onClose, onSaved }: {
  usuario: Usuario | null; onClose: () => void; onSaved: () => void
}) {
  const isNew = !usuario
  const [form, setForm] = useState({ nome: usuario?.nome ?? '', email: usuario?.email ?? '', senha: '', role: usuario?.role ?? 'vendedor' })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function salvar() {
    if (!form.nome.trim() || !form.role) { toast.error('Preencha nome e perfil'); return }
    if (isNew && (!form.email.includes('@') || form.senha.length < 8)) {
      toast.error('E-mail inválido ou senha curta (mín. 8 chars)'); return
    }
    setSaving(true)
    try {
      if (isNew) {
        const r = await fetch('/api/equipe/criar-usuario', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: form.nome, email: form.email, senha: form.senha, role: form.role }),
        })
        const j = await r.json()
        if (!r.ok) { toast.error(j.error ?? 'Erro ao criar'); return }
        toast.success('Usuário criado!')
      } else {
        const r = await fetch('/api/equipe/atualizar-usuario', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: usuario!.id, nome: form.nome, role: form.role }),
        })
        const j = await r.json()
        if (!r.ok) { toast.error(j.error ?? 'Erro ao salvar'); return }
        toast.success('Salvo!')
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const roleInfo = ROLES.find(r => r.value === form.role)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-[18px] border border-[#16212E]/[0.10] shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#16212E]/[0.07]">
          <h2 className="text-base font-semibold text-[#1F2A39]">{isNew ? 'Novo usuário' : 'Editar usuário'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#9AA7B6] transition-colors"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div>
            <label className={labelCls}>Nome completo</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} placeholder="Ex: João Silva" />
          </div>
          {isNew && (
            <>
              <div>
                <label className={labelCls}>E-mail</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="joao@loja.com" />
              </div>
              <div>
                <label className={labelCls}>Senha provisória</label>
                <input type="password" value={form.senha} onChange={e => set('senha', e.target.value)} className={inputCls} placeholder="Mín. 8 caracteres" />
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>Perfil de acesso</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ROLES.filter(r => r.value !== 'owner').map(r => (
                <button key={r.value} onClick={() => set('role', r.value)}
                  className={cn('px-3 py-2 rounded-[10px] text-[13px] font-semibold border transition-all text-left', form.role === r.value ? 'border-transparent' : 'border-[#16212E]/[0.09] text-[#788698] bg-transparent')}
                  style={form.role === r.value ? { background: r.bg, color: r.color, border: `1px solid ${r.color}33` } : {}}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {!isNew && (
            <div className="text-[11.5px] text-[#9AA7B6] bg-[#F4F6F9] rounded-[8px] px-3 py-2">
              E-mail: <strong className="text-[#56657A]">{usuario?.email ?? '—'}</strong> · não pode ser alterado aqui
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#16212E]/[0.07]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#9AA7B6] hover:text-[#56657A] font-medium transition-colors">Cancelar</button>
          <button onClick={salvar} disabled={saving}
            className="px-5 py-2 bg-[#D7282F] hover:bg-[#C01F26] disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors">
            {saving ? 'Salvando...' : isNew ? 'Criar usuário' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Aba Metas ────────────────────────────────────────────────────────────────

function MetasTab({ usuarios }: { usuarios: Usuario[] }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [metas, setMetas] = useState<Record<string, Meta & { _dirty?: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const supabase = createClient()

  const vendedores = usuarios.filter(u => ['vendedor', 'admin', 'owner'].includes(u.role ?? ''))

  const load = useCallback(async () => {
    const { data } = await supabase.from('metas_comissoes').select('*').eq('mes_ano', mes)
    const map: Record<string, Meta> = {}
    ;(data ?? []).forEach(m => { if (m.usuario_id) map[m.usuario_id] = m as Meta })
    setMetas(map)
  }, [mes])

  useEffect(() => { load() }, [load])

  function setField(uid: string, field: keyof Meta, val: string) {
    setMetas(prev => ({ ...prev, [uid]: { ...prev[uid], usuario_id: uid, mes_ano: mes, [field]: val === '' ? null : Number(val) } }))
  }

  async function salvarMeta(uid: string) {
    setSaving(uid)
    const { data: eu } = await supabase.from('empresa_usuarios').select('empresa_id').eq('usuario_id', uid).single()
    // fallback: get empresa_id from any empresa_usuario of current session
    const { data: euMe } = await supabase.from('empresa_usuarios').select('empresa_id').single()
    const empresa_id = euMe?.empresa_id
    if (!empresa_id) { toast.error('Empresa não encontrada'); setSaving(null); return }

    const meta = metas[uid] ?? {}
    const existing = metas[uid] as Meta | undefined

    if (existing?.id) {
      const { error } = await supabase.from('metas_comissoes').update({
        meta_vendas_valor: meta.meta_vendas_valor ?? null,
        meta_vendas_qtd: meta.meta_vendas_qtd ?? null,
        percentual_comissao_padrao: meta.percentual_comissao_padrao ?? null,
      }).eq('id', existing.id)
      if (error) { toast.error('Erro ao salvar'); setSaving(null); return }
    } else {
      const { error } = await supabase.from('metas_comissoes').insert({
        usuario_id: uid, mes_ano: mes,
        meta_vendas_valor: meta.meta_vendas_valor ?? null,
        meta_vendas_qtd: meta.meta_vendas_qtd ?? null,
        percentual_comissao_padrao: meta.percentual_comissao_padrao ?? null,
        empresa_id,
      })
      if (error) { toast.error('Erro ao salvar'); setSaving(null); return }
    }
    toast.success('Meta salva!'); await load(); setSaving(null)
  }

  return (
    <div className="space-y-4">
      {/* Seletor de mês */}
      <div className="flex items-center gap-3">
        <button onClick={() => setMes(prevMonth(mes))} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#788698] transition-colors"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-[#1F2A39] w-24 text-center">{fmtMes(mes)}</span>
        <button onClick={() => setMes(nextMonth(mes))} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#788698] transition-colors"><ChevronRight size={16} /></button>
      </div>

      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#16212E]/[0.08]">
              {['Vendedor', 'Meta de faturamento (R$)', 'Meta de vendas (qtd)', 'Comissão (%)', ''].map(h => (
                <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#788698] uppercase px-5 py-3.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendedores.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-[#9AA7B6] text-sm">Nenhum vendedor cadastrado</td></tr>
            ) : vendedores.map(u => {
              const color = avatarColor(u.nome)
              const m = metas[u.id] ?? {}
              return (
                <tr key={u.id} className="border-b border-[#16212E]/[0.06] last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg,${color}cc,${color}88)` }}>{initials(u.nome)}</div>
                      <div>
                        <div className="text-sm font-semibold text-[#16212E]">{u.nome}</div>
                        <div className="text-[11px] text-[#788698]">{ROLES.find(r => r.value === u.role)?.label ?? u.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <input type="number" min="0" step="100"
                      value={m.meta_vendas_valor ?? ''} onChange={e => setField(u.id, 'meta_vendas_valor', e.target.value)}
                      className="w-36 rounded-[8px] px-3 py-2 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] outline-none focus:border-[#16212E]/20 transition-colors"
                      placeholder="Ex: 30000" />
                  </td>
                  <td className="px-5 py-4">
                    <input type="number" min="0" step="1"
                      value={m.meta_vendas_qtd ?? ''} onChange={e => setField(u.id, 'meta_vendas_qtd', e.target.value)}
                      className="w-24 rounded-[8px] px-3 py-2 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] outline-none focus:border-[#16212E]/20 transition-colors"
                      placeholder="Ex: 20" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <input type="number" min="0" max="100" step="0.5"
                        value={m.percentual_comissao_padrao ?? ''} onChange={e => setField(u.id, 'percentual_comissao_padrao', e.target.value)}
                        className="w-20 rounded-[8px] px-3 py-2 text-sm text-[#1F2A39] bg-[#F4F6F9] border border-[#16212E]/[0.08] outline-none focus:border-[#16212E]/20 transition-colors"
                        placeholder="Ex: 5" />
                      <span className="text-sm text-[#9AA7B6]">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => salvarMeta(u.id)} disabled={saving === u.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D7282F] hover:bg-[#C01F26] disabled:opacity-50 text-white text-xs font-semibold rounded-[8px] transition-colors">
                      {saving === u.id ? '...' : <><Save size={12} /> Salvar</>}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Aba Comissões ────────────────────────────────────────────────────────────

function ComissoesTab({ usuarios }: { usuarios: Usuario[] }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [vendas, setVendas] = useState<VendaResumo[]>([])
  const [metas, setMetas] = useState<Array<Meta & { empresa_id: number }>>([])
  const [pagas, setPagas] = useState<ComissaoPaga[]>([])
  const [quitando, setQuitando] = useState<string | null>(null)
  const supabase = createClient()

  const vendedores = usuarios.filter(u => ['vendedor', 'admin', 'owner'].includes(u.role ?? ''))

  const load = useCallback(async () => {
    const inicio = `${mes}-01`
    const fim = new Date(new Date(inicio).getFullYear(), new Date(inicio).getMonth() + 1, 1).toISOString()
    const [{ data: v }, { data: m }, { data: p }] = await Promise.all([
      supabase.from('vendas').select('vendedor_id, valor_venda, status').gte('data_venda', inicio).lt('data_venda', fim).eq('status', 'concluida'),
      supabase.from('metas_comissoes').select('*').eq('mes_ano', mes),
      supabase.from('comissoes').select('*').gte('created_at', inicio).lt('created_at', fim).eq('status', 'pago'),
    ])
    setVendas(v ?? []); setMetas(m ?? []); setPagas(p ?? [])
  }, [mes])

  useEffect(() => { load() }, [load])

  async function quitar(uid: string, valorComissao: number, percentual: number) {
    setQuitando(uid)
    const { data: euMe } = await supabase.from('empresa_usuarios').select('empresa_id').single()
    const empresa_id = euMe?.empresa_id
    if (!empresa_id) { toast.error('Empresa não encontrada'); setQuitando(null); return }
    const { error } = await supabase.from('comissoes').insert({
      usuario_id: uid, valor_comissao: valorComissao, percentual,
      status: 'pago', data_pagamento: new Date().toISOString().split('T')[0], empresa_id,
    })
    if (error) { toast.error('Erro ao quitar'); setQuitando(null); return }
    toast.success('Comissão quitada!'); await load(); setQuitando(null)
  }

  // Aggregations
  const vendasPorUser: Record<string, { qtd: number; total: number }> = {}
  vendas.forEach(v => {
    if (!v.vendedor_id) return
    if (!vendasPorUser[v.vendedor_id]) vendasPorUser[v.vendedor_id] = { qtd: 0, total: 0 }
    vendasPorUser[v.vendedor_id].qtd += 1
    vendasPorUser[v.vendedor_id].total += Number(v.valor_venda ?? 0)
  })

  const metaMap: Record<string, Meta> = {}
  metas.forEach(m => { if (m.usuario_id) metaMap[m.usuario_id] = m })

  const pagaMap: Record<string, number> = {}
  pagas.forEach(p => { if (p.usuario_id) pagaMap[p.usuario_id] = (pagaMap[p.usuario_id] ?? 0) + Number(p.valor_comissao ?? 0) })

  let totalAPagar = 0, totalPago = 0
  vendedores.forEach(u => {
    const pct = Number(metaMap[u.id]?.percentual_comissao_padrao ?? 0)
    const total = vendasPorUser[u.id]?.total ?? 0
    const calculado = (total * pct) / 100
    const pago = pagaMap[u.id] ?? 0
    totalPago += pago; totalAPagar += Math.max(0, calculado - pago)
  })

  return (
    <div className="space-y-4">
      {/* Seletor de mês */}
      <div className="flex items-center gap-3">
        <button onClick={() => setMes(prevMonth(mes))} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#788698] transition-colors"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-[#1F2A39] w-24 text-center">{fmtMes(mes)}</span>
        <button onClick={() => setMes(nextMonth(mes))} className="p-1.5 rounded-lg hover:bg-[#16212E]/[0.06] text-[#788698] transition-colors"><ChevronRight size={16} /></button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[14px] p-4">
          <div className="text-[9.5px] font-mono tracking-[0.15em] text-[#9AA7B6] uppercase">A pagar</div>
          <div className="text-2xl font-bold text-[#D7282F] mt-1">{formatCurrency(totalAPagar)}</div>
        </div>
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[14px] p-4">
          <div className="text-[9.5px] font-mono tracking-[0.15em] text-[#9AA7B6] uppercase">Já pago</div>
          <div className="text-2xl font-bold text-[#22C55E] mt-1">{formatCurrency(totalPago)}</div>
        </div>
      </div>

      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#16212E]/[0.08]">
              {['Vendedor','Vendas','Faturado','% Comissão','Comissão','Já pago','Situação',''].map(h => (
                <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#788698] uppercase px-4 py-3.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendedores.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-[#9AA7B6] text-sm">Nenhum vendedor cadastrado</td></tr>
            ) : vendedores.map(u => {
              const color = avatarColor(u.nome)
              const { qtd = 0, total = 0 } = vendasPorUser[u.id] ?? {}
              const pct = Number(metaMap[u.id]?.percentual_comissao_padrao ?? 0)
              const calculado = (total * pct) / 100
              const pago = pagaMap[u.id] ?? 0
              const pendente = Math.max(0, calculado - pago)
              const pctMeta = metaMap[u.id]?.meta_vendas_valor ? Math.min(Math.round((total / Number(metaMap[u.id].meta_vendas_valor)) * 100), 100) : null

              return (
                <tr key={u.id} className="border-b border-[#16212E]/[0.06] last:border-0 hover:bg-[#16212E]/[0.02] transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg,${color}cc,${color}88)` }}>{initials(u.nome)}</div>
                      <div>
                        <div className="text-sm font-semibold text-[#16212E]">{u.nome}</div>
                        {pctMeta !== null && (
                          <div className="text-[10px] text-[#788698]">meta {pctMeta}%</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-sm text-[#56657A] font-variant-numeric tabular-nums">{qtd}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#16212E]">{formatCurrency(total)}</td>
                  <td className="px-4 py-4 font-mono text-sm text-[#56657A]">{pct > 0 ? `${pct}%` : <span className="text-[#C8D0DA]">—</span>}</td>
                  <td className="px-4 py-4 text-sm font-bold text-[#16212E]">{pct > 0 ? formatCurrency(calculado) : <span className="text-[#C8D0DA]">—</span>}</td>
                  <td className="px-4 py-4 text-sm text-[#22C55E] font-semibold">{pago > 0 ? formatCurrency(pago) : '—'}</td>
                  <td className="px-4 py-4">
                    {calculado <= 0 ? (
                      <span className="text-[11px] text-[#C8D0DA]">Sem comissão</span>
                    ) : pendente <= 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(34,197,94,0.12)] text-[#18825A] text-[11px] font-semibold">
                        <Check size={11} /> Quitado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[rgba(244,183,64,0.14)] text-[#A07000] text-[11px] font-semibold">
                        {formatCurrency(pendente)} pendente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {pendente > 0 && pct > 0 && (
                      <button onClick={() => quitar(u.id, pendente, pct)} disabled={quitando === u.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16212E] hover:bg-[#1F2A39] disabled:opacity-50 text-white text-xs font-semibold rounded-[8px] transition-colors">
                        {quitando === u.id ? '...' : <><TrendingUp size={11} /> Quitar</>}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── View principal ───────────────────────────────────────────────────────────

export default function EquipeView({ usuarios }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState('usuarios')
  const [modal, setModal] = useState<{ open: boolean; usuario: Usuario | null }>({ open: false, usuario: null })

  function onSaved() { setModal({ open: false, usuario: null }); router.refresh() }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#788698] uppercase mb-0.5">Operação</p>
          <h1 className="text-xl font-bold text-[#16212E]">Equipe</h1>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 shrink-0">
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
        {tab === 'usuarios' && (
          <button onClick={() => setModal({ open: true, usuario: null })}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#D7282F] hover:bg-[#C01F26] text-white text-sm font-semibold rounded-[10px] transition-colors">
            <UserPlus size={15} /> Novo usuário
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {tab === 'usuarios' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#16212E]/[0.08]">
                  {['Usuário','Módulos de acesso','Perfil','Último acesso','Ação'].map(h => (
                    <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#788698] uppercase px-5 py-3.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-16 text-[#9AA7B6] text-sm">Nenhum usuário</td></tr>
                ) : usuarios.map(u => {
                  const color = avatarColor(u.nome)
                  const rb = ROLES.find(r => r.value === u.role) ?? { label: u.role ?? '—', color: '#5C6E84', bg: 'rgba(92,110,132,0.12)' }
                  return (
                    <tr key={u.id} className="border-b border-[#16212E]/[0.08] hover:bg-[#16212E]/[0.03] transition-colors last:border-0">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: `linear-gradient(135deg,${color}cc,${color}88)` }}>
                            {initials(u.nome)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[#16212E]">{u.nome}</div>
                            <div className="text-[11px] text-[#788698]">{u.email ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><span className="text-sm text-[#788698]">{(u.modulos_acesso ?? []).join(' · ') || 'Acesso total'}</span></td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{ color: rb.color, background: rb.bg }}>
                          {rb.label}
                        </span>
                      </td>
                      <td className="px-5 py-4"><span className="text-sm text-[#788698]">{fmtAcesso(u.ultimo_acesso)}</span></td>
                      <td className="px-5 py-4">
                        <button onClick={() => setModal({ open: true, usuario: u })}
                          className="px-3 py-1.5 text-xs font-semibold text-[#788698] hover:text-[#16212E] bg-[#16212E]/[0.04] hover:bg-[#16212E]/[0.08] rounded-[8px] transition-colors">
                          ✎ Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'metas' && <MetasTab usuarios={usuarios} />}
        {tab === 'comissoes' && <ComissoesTab usuarios={usuarios} />}
      </div>

      {modal.open && (
        <UsuarioModal
          usuario={modal.usuario}
          onClose={() => setModal({ open: false, usuario: null })}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
