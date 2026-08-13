'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserMinus, Pencil, Save, ChevronLeft, ChevronRight, Check, TrendingUp, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-cliente'
import { janelaDoPeriodo } from '@/lib/ranking'
import { formatCurrency } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { Button, IconButton, Input, Select, Modal, Table, Card, StatCard, Badge, Tabs, EmptyState, ConfirmDialog, notify, type Column } from '@/components/ui'

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
interface VendaResumo { vendedor_id: string | null; valor_venda: number | null; status: string | null; grupo_pdv?: string | null }
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
  /**
   * Painel "Uso da equipe". Só o /admin passa esta prop — sem ela a aba nem
   * existe, então o vendedor não vê horário de colega mesmo abrindo /equipe.
   * Vem pronto de cima porque a consulta é do servidor e exige papel de admin.
   */
  uso?: React.ReactNode
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS_BASE = [
  { value: 'usuarios',  label: 'Usuários'  },
  { value: 'metas',     label: 'Metas'     },
  { value: 'comissoes', label: 'Comissões' },
]

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'
const ROLES: { value: string; label: string; tone: Tone }[] = [
  { value: 'admin',    label: 'Administrador', tone: 'neutro' },
  { value: 'vendedor', label: 'Vendedor',      tone: 'ok'     },
  { value: 'tecnico',  label: 'Técnico',       tone: 'acc'    },
  { value: 'owner',    label: 'Proprietário',  tone: 'warn'   },
]

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

function Avatar({ nome }: { nome: string }) {
  return (
    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
      {initials(nome)}
    </span>
  )
}

function MonthPicker({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <IconButton aria-label="Mês anterior" variant="outline" size="sm" onClick={() => setMes(prevMonth(mes))}>
        <ChevronLeft size={16} strokeWidth={1.7} />
      </IconButton>
      <span className="w-24 text-center text-[13px] font-semibold text-ink">{fmtMes(mes)}</span>
      <IconButton aria-label="Próximo mês" variant="outline" size="sm" onClick={() => setMes(nextMonth(mes))}>
        <ChevronRight size={16} strokeWidth={1.7} />
      </IconButton>
    </div>
  )
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
    if (!form.nome.trim() || !form.role) { notify.warn('Preencha nome e perfil'); return }
    if (isNew && (!form.email.includes('@') || form.senha.length < 8)) {
      notify.warn('E-mail inválido ou senha curta (mín. 8 chars)'); return
    }
    setSaving(true)
    try {
      if (isNew) {
        const { ok, json, sessaoExpirada } = await apiFetch<{ error?: string; readmitido?: boolean }>('/api/equipe/criar-usuario', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: form.nome, email: form.email, senha: form.senha, role: form.role }),
        })
        // Sessão expirada já avisou e está redirecionando: não empilha um segundo
        // toast dizendo "erro ao criar", que sugeriria problema no cadastro.
        if (sessaoExpirada) return
        if (!ok) { notify.bad(json.error ?? 'Erro ao criar'); return }
        notify.ok(json.readmitido ? 'Usuário readmitido na equipe!' : 'Usuário criado!')
      } else {
        const { ok, json, sessaoExpirada } = await apiFetch<{ error?: string }>('/api/equipe/atualizar-usuario', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: usuario!.id, nome: form.nome, role: form.role }),
        })
        if (sessaoExpirada) return
        if (!ok) { notify.bad(json.error ?? 'Erro ao salvar'); return }
        notify.ok('Salvo!')
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      disableOverlayClose={saving}
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
            {initials(form.nome || 'US')}
          </span>
          <span className="truncate">{isNew ? 'Novo usuário' : form.nome || 'Editar usuário'}</span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} loading={saving}>{isNew ? 'Criar usuário' : 'Salvar'}</Button>
        </>
      }
    >
      <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid gap-3">
        <Input label="Nome completo" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: João Silva" />
        {isNew && (
          <>
            <Input label="E-mail" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="joao@loja.com" />
            <Input label="Senha provisória" type="password" value={form.senha} onChange={e => set('senha', e.target.value)} placeholder="Mín. 8 caracteres" />
          </>
        )}
        <Select label="Perfil de acesso" value={form.role} onChange={e => set('role', e.target.value)}>
          {ROLES.filter(r => r.value !== 'owner').map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
        {!isNew && (
          <div className="rounded-control border border-line bg-raised px-3 py-2 text-[12px] text-ink-3">
            E-mail: <strong className="text-ink-2">{usuario?.email ?? '—'}</strong> · não pode ser alterado aqui
          </div>
        )}
      </form>
    </Modal>
  )
}

// ─── Aba Metas ────────────────────────────────────────────────────────────────

const supabase = createClient()

function MetasTab({ usuarios }: { usuarios: Usuario[] }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [metas, setMetas] = useState<Record<string, Meta & { _dirty?: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)

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
    // empresa_id da SESSÃO (não do alvo) — filtra pelo usuário logado p/ não quebrar
    // com 2+ vínculos e não pegar a empresa errada.
    const { data: { user } } = await supabase.auth.getUser()
    const { data: euMe } = await supabase.from('empresa_usuarios')
      .select('empresa_id').eq('usuario_id', user?.id ?? '').eq('ativo', true).maybeSingle()
    const empresa_id = euMe?.empresa_id
    if (!empresa_id) { notify.bad('Empresa não encontrada'); setSaving(null); return }

    const meta = metas[uid] ?? {}
    const existing = metas[uid] as Meta | undefined

    if (existing?.id) {
      const { error } = await supabase.from('metas_comissoes').update({
        meta_vendas_valor: meta.meta_vendas_valor ?? null,
        meta_vendas_qtd: meta.meta_vendas_qtd ?? null,
        percentual_comissao_padrao: meta.percentual_comissao_padrao ?? null,
      }).eq('id', existing.id)
      if (error) { notify.bad('Erro ao salvar'); setSaving(null); return }
    } else {
      const { error } = await supabase.from('metas_comissoes').insert({
        usuario_id: uid, mes_ano: mes,
        meta_vendas_valor: meta.meta_vendas_valor ?? null,
        meta_vendas_qtd: meta.meta_vendas_qtd ?? null,
        percentual_comissao_padrao: meta.percentual_comissao_padrao ?? null,
        empresa_id,
      })
      if (error) { notify.bad('Erro ao salvar'); setSaving(null); return }
    }
    notify.ok('Meta salva!'); await load(); setSaving(null)
  }

  const cols: Column<Usuario>[] = [
    {
      key: 'vendedor', header: 'Vendedor',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar nome={u.nome} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{u.nome}</div>
            <div className="text-[11px] text-ink-3">{ROLES.find(r => r.value === u.role)?.label ?? u.role}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'meta_valor', header: 'Meta de faturamento (R$)',
      render: (u) => (
        <Input type="number" min="0" step="100" wrapperClassName="w-40"
          value={(metas[u.id] ?? {}).meta_vendas_valor ?? ''}
          onChange={e => setField(u.id, 'meta_vendas_valor', e.target.value)} placeholder="Ex: 30000" />
      ),
    },
    {
      key: 'meta_qtd', header: 'Meta de vendas (qtd)',
      render: (u) => (
        <Input type="number" min="0" step="1" wrapperClassName="w-28"
          value={(metas[u.id] ?? {}).meta_vendas_qtd ?? ''}
          onChange={e => setField(u.id, 'meta_vendas_qtd', e.target.value)} placeholder="Ex: 20" />
      ),
    },
    {
      key: 'comissao', header: 'Comissão (%)',
      render: (u) => (
        <div className="flex items-center gap-1.5">
          <Input type="number" min="0" max="100" step="0.5" wrapperClassName="w-24"
            value={(metas[u.id] ?? {}).percentual_comissao_padrao ?? ''}
            onChange={e => setField(u.id, 'percentual_comissao_padrao', e.target.value)} placeholder="Ex: 5" />
          <span className="text-[13px] text-ink-3">%</span>
        </div>
      ),
    },
    {
      key: 'acao', header: '', align: 'right',
      render: (u) => (
        <Button size="sm" icon={<Save size={12} strokeWidth={1.7} />} loading={saving === u.id} onClick={() => salvarMeta(u.id)}>
          Salvar
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <MonthPicker mes={mes} setMes={setMes} />
      <Card flush>
        <Table
          columns={cols}
          rows={vendedores}
          rowKey={(u) => u.id}
          empty={<EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Nenhum vendedor cadastrado" />}
        />
      </Card>
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
  /** Fechamentos com aparelho de troca ainda não recebido — comissão retida. */
  const [gruposRetidos, setGruposRetidos] = useState<Set<string>>(new Set())

  const vendedores = usuarios.filter(u => ['vendedor', 'admin', 'owner'].includes(u.role ?? ''))

  const load = useCallback(async () => {
    // Janela pela função única. O cálculo que estava aqui produzia 3 HORAS em vez
    // de um mês (ver janelaDoPeriodo), então a aba Comissões mostrava faturamento
    // zero para todo mundo — e ninguém desconfiava, porque zero é um número
    // plausível.
    const { ini: inicio, fim } = janelaDoPeriodo(mes)
    const [{ data: v }, { data: m }, { data: p }, { data: pend }] = await Promise.all([
      supabase.from('vendas').select('vendedor_id, valor_venda, status, grupo_pdv').gte('data_venda', inicio).lt('data_venda', fim).eq('status', 'concluida'),
      supabase.from('metas_comissoes').select('*').eq('mes_ano', mes),
      supabase.from('comissoes').select('*').eq('mes_referencia', mes).eq('status', 'pago'),
      // Aparelhos aceitos em troca que ainda não chegaram na loja. Cada um segura
      // a comissão do fechamento inteiro que o trouxe — não só da primeira linha,
      // porque o PDV cria uma venda por item do carrinho.
      //
      // `ativo` no filtro é a saída para o caso do cliente nunca entregar: excluir
      // a unidade no estoque (que a desativa) libera a comissão. Sem esse filtro a
      // retenção não teria fim e o vendedor ficaria refém de uma troca que morreu.
      supabase.from('inventario_unidades').select('grupo_pdv')
        .eq('status', 'pendente').eq('ativo', true).not('grupo_pdv', 'is', null),
    ])
    setVendas(v ?? []); setMetas(m ?? []); setPagas(p ?? [])
    setGruposRetidos(new Set(((pend ?? []) as { grupo_pdv: string | null }[]).map((u) => u.grupo_pdv).filter((g): g is string => !!g)))
  }, [mes])

  useEffect(() => { load() }, [load])

  async function quitar(uid: string, valorComissao: number, percentual: number) {
    setQuitando(uid)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: euMe } = await supabase.from('empresa_usuarios')
      .select('empresa_id').eq('usuario_id', user?.id ?? '').eq('ativo', true).maybeSingle()
    const empresa_id = euMe?.empresa_id
    if (!empresa_id) { notify.bad('Empresa não encontrada'); setQuitando(null); return }
    // já quitado neste mês de referência? evita dupla quitação
    if (pagas.some(p => p.usuario_id === uid)) { notify.warn('Comissão já quitada neste mês'); setQuitando(null); return }
    const { error } = await supabase.from('comissoes').insert({
      usuario_id: uid, valor_comissao: valorComissao, percentual, mes_referencia: mes,
      status: 'pago', data_pagamento: new Date().toISOString().split('T')[0], empresa_id,
    })
    if (error) { notify.bad('Erro ao quitar', error.message); setQuitando(null); return }
    notify.ok('Comissão quitada!'); await load(); setQuitando(null)
  }

  // Aggregations.
  //
  // `total` é a base que gera comissão. Venda de um fechamento cujo aparelho de
  // troca ainda não chegou NÃO entra aqui: vai para `retido` e só migra quando
  // alguém confirmar a chegada no estoque. Sem isso a loja pagaria comissão por
  // um aparelho que pode nunca aparecer.
  const vendasPorUser: Record<string, { qtd: number; total: number; retido: number; qtdRetida: number }> = {}
  vendas.forEach(v => {
    if (!v.vendedor_id) return
    if (!vendasPorUser[v.vendedor_id]) vendasPorUser[v.vendedor_id] = { qtd: 0, total: 0, retido: 0, qtdRetida: 0 }
    const linha = vendasPorUser[v.vendedor_id]
    const valor = Number(v.valor_venda ?? 0)
    if (v.grupo_pdv && gruposRetidos.has(v.grupo_pdv)) {
      linha.retido += valor
      linha.qtdRetida += 1
      return
    }
    linha.qtd += 1
    linha.total += valor
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

  const cols: Column<Usuario>[] = [
    {
      key: 'vendedor', header: 'Vendedor',
      render: (u) => {
        const pctMeta = metaMap[u.id]?.meta_vendas_valor ? Math.min(Math.round(((vendasPorUser[u.id]?.total ?? 0) / Number(metaMap[u.id].meta_vendas_valor)) * 100), 100) : null
        return (
          <div className="flex items-center gap-3">
            <Avatar nome={u.nome} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">{u.nome}</div>
              {pctMeta !== null && <div className="text-[11px] text-ink-3">meta {pctMeta}%</div>}
            </div>
          </div>
        )
      },
    },
    { key: 'vendas', header: 'Vendas', align: 'right', className: 'num', render: (u) => <span className="text-ink-2">{vendasPorUser[u.id]?.qtd ?? 0}</span> },
    {
      key: 'faturado', header: 'Faturado', align: 'right', className: 'num',
      render: (u) => {
        const l = vendasPorUser[u.id]
        return (
          <div className="flex flex-col items-end">
            <span className="font-semibold text-ink">{formatCurrency(l?.total ?? 0)}</span>
            {/* O que está fora da conta precisa aparecer, senão o vendedor só vê
                um número menor do que esperava e ninguém sabe explicar. */}
            {(l?.retido ?? 0) > 0 && (
              <span className="text-[10.5px] text-warn">
                + {formatCurrency(l.retido)} retido ({l.qtdRetida} {l.qtdRetida === 1 ? 'venda' : 'vendas'})
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'pct', header: '% Comissão', align: 'right', className: 'num',
      render: (u) => { const pct = Number(metaMap[u.id]?.percentual_comissao_padrao ?? 0); return pct > 0 ? <span className="text-ink-2">{pct}%</span> : <span className="text-ink-3">—</span> },
    },
    {
      key: 'comissao', header: 'Comissão', align: 'right', className: 'num',
      render: (u) => {
        const pct = Number(metaMap[u.id]?.percentual_comissao_padrao ?? 0)
        const calculado = ((vendasPorUser[u.id]?.total ?? 0) * pct) / 100
        return pct > 0 ? <span className="font-bold text-ink">{formatCurrency(calculado)}</span> : <span className="text-ink-3">—</span>
      },
    },
    {
      key: 'pago', header: 'Já pago', align: 'right', className: 'num',
      render: (u) => { const pago = pagaMap[u.id] ?? 0; return pago > 0 ? <span className="font-semibold text-ok">{formatCurrency(pago)}</span> : <span className="text-ink-3">—</span> },
    },
    {
      key: 'situacao', header: 'Situação', align: 'right',
      render: (u) => {
        const pct = Number(metaMap[u.id]?.percentual_comissao_padrao ?? 0)
        const l = vendasPorUser[u.id]
        const calculado = ((l?.total ?? 0) * pct) / 100
        const retidoComissao = ((l?.retido ?? 0) * pct) / 100
        const pago = pagaMap[u.id] ?? 0
        const pendente = Math.max(0, calculado - pago)
        const aviso = retidoComissao > 0 && pct > 0
          ? <div className="mt-0.5 text-[10.5px] text-warn">{formatCurrency(retidoComissao)} aguardando aparelho chegar</div>
          : null
        if (calculado <= 0) return <div>{retidoComissao > 0 && pct > 0 ? <Badge tone="warn">Retida</Badge> : <span className="text-[11px] text-ink-3">Sem comissão</span>}{aviso}</div>
        if (pendente <= 0) return <div><Badge tone="ok"><Check size={11} strokeWidth={1.7} /> Quitado</Badge>{aviso}</div>
        return <div><Badge tone="warn">{formatCurrency(pendente)} pendente</Badge>{aviso}</div>
      },
    },
    {
      key: 'acao', header: '', align: 'right',
      render: (u) => {
        const pct = Number(metaMap[u.id]?.percentual_comissao_padrao ?? 0)
        const calculado = ((vendasPorUser[u.id]?.total ?? 0) * pct) / 100
        const pago = pagaMap[u.id] ?? 0
        const pendente = Math.max(0, calculado - pago)
        if (!(pendente > 0 && pct > 0)) return null
        return (
          <Button size="sm" icon={<TrendingUp size={11} strokeWidth={1.7} />} loading={quitando === u.id} onClick={() => quitar(u.id, pendente, pct)}>
            Quitar
          </Button>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <MonthPicker mes={mes} setMes={setMes} />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="A pagar" value={formatCurrency(totalAPagar)} />
        <StatCard label="Já pago" value={<span className="text-ok">{formatCurrency(totalPago)}</span>} />
      </div>

      <Card flush>
        <Table
          columns={cols}
          rows={vendedores}
          rowKey={(u) => u.id}
          empty={<EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Nenhum vendedor cadastrado" />}
        />
      </Card>
    </div>
  )
}

// ─── View principal ───────────────────────────────────────────────────────────

export default function EquipeView({ usuarios, uso }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState('usuarios')
  const TABS = uso ? [...TABS_BASE, { value: 'uso', label: 'Uso da equipe' }] : TABS_BASE
  const [modal, setModal] = useState<{ open: boolean; usuario: Usuario | null }>({ open: false, usuario: null })
  const [remover, setRemover] = useState<Usuario | null>(null)
  const [removendo, setRemovendo] = useState(false)
  // Quem sou eu: para não oferecer "remover" no próprio usuário.
  const [meuId, setMeuId] = useState<string | null>(null)
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null))
  }, [])

  function onSaved() { setModal({ open: false, usuario: null }); router.refresh() }

  async function confirmarRemocao() {
    if (!remover || removendo) return
    setRemovendo(true)
    try {
      const { ok, json, sessaoExpirada } = await apiFetch<{ error?: string }>('/api/equipe/remover-usuario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: remover.id }),
      })
      if (sessaoExpirada) return
      if (!ok) { notify.bad('Não foi possível remover', json.error); return }
      notify.ok(`${remover.nome} saiu da equipe`, 'O histórico de vendas dele continua no sistema')
      router.refresh()
    } finally {
      // Fecha em qualquer caso: modal aberto com o erro num toast atrás não diz
      // se a ação valeu.
      setRemovendo(false)
      setRemover(null)
    }
  }

  const cols: Column<Usuario>[] = [
    {
      key: 'usuario', header: 'Usuário',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar nome={u.nome} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{u.nome}</div>
            <div className="truncate text-[11px] text-ink-3">{u.email ?? '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'modulos', header: 'Módulos de acesso', hideOnMobile: true, render: (u) => <span className="text-ink-2">{(u.modulos_acesso ?? []).join(' · ') || 'Acesso total'}</span> },
    {
      key: 'perfil', header: 'Perfil',
      render: (u) => { const rb = ROLES.find(r => r.value === u.role); return <Badge tone={rb?.tone ?? 'neutro'}>{rb?.label ?? u.role ?? '—'}</Badge> },
    },
    { key: 'acesso', header: 'Último acesso', align: 'right', hideOnMobile: true, render: (u) => <span className="text-ink-2">{fmtAcesso(u.ultimo_acesso)}</span> },
    {
      key: 'acoes', header: '', align: 'right',
      // O proprietário não sai da equipe (é o dono da conta) e ninguém remove a
      // si mesmo — nos dois casos o botão nem aparece, em vez de aparecer e
      // recusar depois.
      render: (u) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" title="Editar"
            icon={<Pencil size={14} strokeWidth={1.7} />}
            onClick={() => setModal({ open: true, usuario: u })}>
            <span className="sr-only">Editar</span>
          </Button>
          {u.role !== 'owner' && u.id !== meuId && (
            <Button variant="ghost" size="sm" title="Remover da equipe"
              className="text-bad hover:bg-bad/10"
              icon={<UserMinus size={14} strokeWidth={1.7} />}
              onClick={() => setRemover(u)}>
              <span className="sr-only">Remover da equipe</span>
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Equipe" />

      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
        <Tabs items={TABS} value={tab} onValueChange={setTab} className="border-b-0" />
        {tab === 'usuarios' && (
          <Button icon={<UserPlus size={15} strokeWidth={1.7} />} onClick={() => setModal({ open: true, usuario: null })}>
            Novo usuário
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">
        {tab === 'usuarios' && (
          <Card flush>
            <Table
              columns={cols}
              rows={usuarios}
              rowKey={(u) => u.id}
              onRowClick={(u) => setModal({ open: true, usuario: u })}
              empty={<EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Nenhum usuário" description="Adicione o primeiro membro da equipe." />}
            />
          </Card>
        )}
        {tab === 'metas' && <MetasTab usuarios={usuarios} />}
        {tab === 'comissoes' && <ComissoesTab usuarios={usuarios} />}
        {tab === 'uso' && uso}
      </div>

      {modal.open && (
        <UsuarioModal
          usuario={modal.usuario}
          onClose={() => setModal({ open: false, usuario: null })}
          onSaved={onSaved}
        />
      )}

      <ConfirmDialog
        open={!!remover}
        loading={removendo}
        onClose={() => setRemover(null)}
        onConfirm={confirmarRemocao}
        title="Remover da equipe?"
        description={
          `${remover?.nome ?? 'Esta pessoa'} perde o acesso ao CRM imediatamente. `
          + 'O histórico de vendas, comissões e ranking dela CONTINUA no sistema — nada do passado é apagado, '
          + 'porque "quem vendeu" é dado que a loja precisa manter. Se ela tiver reservas de estoque abertas, '
          + 'as unidades voltam para o PDV. Para readmitir, é só criar o usuário de novo com o mesmo e-mail.'
        }
        confirmLabel="Remover do time"
        tone="danger"
      />
    </div>
  )
}
