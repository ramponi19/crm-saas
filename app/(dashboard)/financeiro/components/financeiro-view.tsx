'use client'
import { useState, useMemo } from 'react'
import { Plus, Copy, Check, ExternalLink, Trash2, Receipt } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { TablesInsert } from '@/types/database'
import { Topbar } from '@/components/layout/topbar'
import { Card, StatCard, Table, Tabs, Badge, Button, IconButton, Input, Select, Textarea, Modal, EmptyState, type Column } from '@/components/ui'

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
  created_at: string | null
}
interface Categoria {
  id: number
  nome: string
  tipo: string
  cor: string | null
}
interface Cobranca {
  id: number
  tipo: string | null
  valor: number | null
  status: string | null
  descricao: string | null
  created_at: string | null
  link_pagamento: string | null
  qr_code: string | null
  linha_digitavel: string | null
  vencimento: string | null
  provider: string | null
  os_id: number | null
  venda_id: number | null
  cliente_id: number | null
  clientes?: { nome: string } | { nome: string }[] | null
}
interface Props { lancamentos: Lancamento[]; categorias: Categoria[]; cobrancas: Cobranca[]; empresaId: number }

const TABS = [
  { key: 'fluxo',      label: 'Fluxo de Caixa'  },
  { key: 'pagar',      label: 'Contas a Pagar'   },
  { key: 'receber',    label: 'Contas a Receber' },
  { key: 'cobrancas',  label: 'Cobranças'        },
  { key: 'dre',        label: 'DRE'              },
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

const fmtBRL = (v: number | null) => v != null ? formatCurrency(v) : '—'
// "A pagar/receber" = ainda em aberto (pendente ou atrasado); nunca conta cancelado.
const emAberto = (s: string | null) => s === 'pendente' || s === 'atrasado'
const naoCancelado = (s: string | null) => s !== 'cancelado'

export default function FinanceiroView({ lancamentos: initial, categorias, cobrancas: initialCobrancas, empresaId }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState('fluxo')
  const [lancamentos, setLancamentos] = useState(initial)
  const [cobrancas, setCobrancas] = useState(initialCobrancas)
  const [copiado, setCopiado] = useState<number | null>(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const stats = useMemo(() => {
    const receitas = lancamentos.filter(l => l.tipo === 'receita' && naoCancelado(l.status))
    const despesas = lancamentos.filter(l => l.tipo === 'despesa' && naoCancelado(l.status))
    const aReceber = receitas.filter(l => emAberto(l.status)).reduce((s, l) => s + (l.valor ?? 0), 0)
    const aPagar   = despesas.filter(l => emAberto(l.status)).reduce((s, l) => s + (l.valor ?? 0), 0)
    const totalDespesas = despesas.reduce((s, l) => s + (l.valor ?? 0), 0)
    const resultado = receitas.reduce((s, l) => s + (l.valor ?? 0), 0) - totalDespesas
    return { aReceber, aPagar, despesas: totalDespesas, resultado }
  }, [lancamentos])

  const listaReceber = lancamentos.filter(l => l.tipo === 'receita' && emAberto(l.status))
  const listaPagar   = lancamentos.filter(l => l.tipo === 'despesa' && emAberto(l.status))
  const todos        = lancamentos

  // DRE — Demonstração do Resultado: receita bruta, despesas agrupadas por
  // categoria e resultado líquido com margem.
  const dre = useMemo(() => {
    const receitaBruta = lancamentos
      .filter(l => l.tipo === 'receita' && naoCancelado(l.status))
      .reduce((s, l) => s + (l.valor ?? 0), 0)

    const porCategoria = new Map<string, number>()
    for (const l of lancamentos) {
      if (l.tipo !== 'despesa' || !naoCancelado(l.status)) continue
      const cat = l.categoria?.trim() || 'Sem categoria'
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + (l.valor ?? 0))
    }
    const despesas = [...porCategoria.entries()]
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)

    const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0)
    const resultado = receitaBruta - totalDespesas
    const margem = receitaBruta > 0 ? (resultado / receitaBruta) * 100 : 0

    return { receitaBruta, despesas, totalDespesas, resultado, margem }
  }, [lancamentos])

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
      const { data, error } = await supabase.from('lancamentos_financeiros').insert({ ...payload, empresa_id: empresaId } as TablesInsert<'lancamentos_financeiros'>).select().single()
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

  async function marcarPago(id: number) {
    const { error } = await supabase.from('cobrancas').update({ status: 'pago' }).eq('id', id)
    if (error) return
    setCobrancas(prev => prev.map(c => c.id === id ? { ...c, status: 'pago' } : c))
  }

  async function copiarChave(c: Cobranca) {
    const chave = c.linha_digitavel ?? c.qr_code ?? c.link_pagamento ?? ''
    if (!chave) return
    await navigator.clipboard.writeText(chave)
    setCopiado(c.id)
    setTimeout(() => setCopiado(null), 2000)
  }

  function getNomeCliente(c: Cobranca): string {
    if (!c.clientes) return '—'
    if (Array.isArray(c.clientes)) return c.clientes[0]?.nome ?? '—'
    return c.clientes.nome
  }

  const cobrancasStats = useMemo(() => {
    const pendentes = cobrancas.filter(c => c.status === 'pendente')
    const pagas     = cobrancas.filter(c => c.status === 'pago')
    const totalPendente = pendentes.reduce((s, c) => s + (c.valor ?? 0), 0)
    const totalPago     = pagas.reduce((s, c) => s + (c.valor ?? 0), 0)
    return { pendentes: pendentes.length, pagas: pagas.length, totalPendente, totalPago }
  }, [cobrancas])

  const cobCols: Column<Cobranca>[] = [
    {
      key: 'data', header: 'Data', className: 'num w-[96px]',
      render: (c) => <span className="text-ink-2">{new Date(c.created_at ?? '').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>,
    },
    {
      key: 'descricao', header: 'Descrição',
      render: (c) => (
        <div>
          <div className="font-medium text-ink">{c.descricao ?? '—'}</div>
          <div className="text-[11px] text-ink-3">{c.os_id ? `OS #${c.os_id}` : c.venda_id ? `Venda #${c.venda_id}` : '—'}</div>
        </div>
      ),
    },
    { key: 'cliente', header: 'Cliente', hideOnMobile: true, render: (c) => <span className="text-ink-2">{getNomeCliente(c)}</span> },
    { key: 'tipo', header: 'Tipo', hideOnMobile: true, render: (c) => <Badge tone="neutro">{c.tipo ?? 'pix'}</Badge> },
    { key: 'valor', header: 'Valor', align: 'right', className: 'num', render: (c) => <span className="font-semibold text-ink">{c.valor != null ? formatCurrency(c.valor) : '—'}</span> },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (c) => {
        const tone = c.status === 'pago' ? 'ok' : c.status === 'expirado' ? 'neutro' : 'warn'
        const label = c.status === 'pago' ? 'Pago' : c.status === 'expirado' ? 'Expirado' : 'Pendente'
        return <Badge tone={tone}>{label}</Badge>
      },
    },
    {
      key: 'acoes', header: 'Ações', align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          {(c.linha_digitavel ?? c.qr_code ?? c.link_pagamento) && (
            <IconButton aria-label="Copiar chave Pix" size="sm" onClick={() => copiarChave(c)}>
              {copiado === c.id ? <Check size={15} strokeWidth={1.7} className="text-ok" /> : <Copy size={15} strokeWidth={1.7} />}
            </IconButton>
          )}
          {c.link_pagamento && (
            <a href={c.link_pagamento} target="_blank" rel="noopener noreferrer" title="Abrir link"
              className="grid h-8 w-8 place-items-center rounded-control text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink">
              <ExternalLink size={15} strokeWidth={1.7} />
            </a>
          )}
          {c.status !== 'pago' && (
            <button onClick={() => marcarPago(c.id)}
              className="whitespace-nowrap px-2 text-[12px] font-semibold text-ok hover:underline">
              Marcar pago
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Financeiro" />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[1240px] space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            <StatCard bare label="À receber" value={fmtBRL(stats.aReceber)} delta={`${listaReceber.length} lançamentos`} deltaTone="ok" />
            <StatCard bare label="À pagar" value={fmtBRL(stats.aPagar)} delta={`${listaPagar.length} contas em aberto`} deltaTone="warn" />
            <StatCard bare label="Despesas (total)" value={fmtBRL(stats.despesas)} delta="custo operacional" deltaTone="neutral" />
            <StatCard bare label="Resultado líquido" value={fmtBRL(stats.resultado)} delta="receitas − despesas" deltaTone={stats.resultado >= 0 ? 'ok' : 'bad'} />
          </div>

          {/* Tabs */}
          <Tabs items={TABS.map(t => ({ value: t.key, label: t.label }))} value={tab} onValueChange={setTab} />

          {/* Conteúdo da tab */}
          {tab === 'fluxo' && (
            <Card flush>
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Livro-caixa</h3>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    Entradas <span className="num font-semibold text-ok">+{fmtBRL(listaReceber.reduce((s,l)=>s+(l.valor??0),0))}</span>
                    {' · '}Saídas <span className="num font-semibold text-bad">−{fmtBRL(listaPagar.reduce((s,l)=>s+(l.valor??0),0))}</span>
                  </p>
                </div>
                <Button size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => abrirNovo('receita')}>Novo lançamento</Button>
              </div>
              <LancamentosTable lancamentos={todos} onEditar={abrirEditar} />
            </Card>
          )}
          {tab === 'pagar' && (
            <Card flush title="Contas a pagar" actions={<Button size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => abrirNovo('despesa')}>Nova conta</Button>}>
              <LancamentosTable lancamentos={listaPagar} onEditar={abrirEditar} />
            </Card>
          )}
          {tab === 'receber' && (
            <Card flush title="Contas a receber" actions={<Button size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => abrirNovo('receita')}>Novo título</Button>}>
              <LancamentosTable lancamentos={listaReceber} onEditar={abrirEditar} />
            </Card>
          )}
          {tab === 'cobrancas' && (
            <div className="space-y-4">
              {/* Stats das cobranças */}
              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
                <StatCard bare label="Aguardando pagamento" value={fmtBRL(cobrancasStats.totalPendente)} delta={`${cobrancasStats.pendentes} cobranças`} deltaTone="warn" />
                <StatCard bare label="Recebido via cobrança" value={fmtBRL(cobrancasStats.totalPago)} delta={`${cobrancasStats.pagas} confirmadas`} deltaTone="ok" />
              </div>

              {/* Tabela de cobranças */}
              <Card flush>
                <div className="border-b border-line-soft px-4 py-3">
                  <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Conciliação de Cobranças</h3>
                  <p className="mt-0.5 text-[12px] text-ink-3">Cobranças Pix geradas via OS e PDV</p>
                </div>
                <Table
                  columns={cobCols}
                  rows={cobrancas}
                  rowKey={(c) => c.id}
                  empty={<EmptyState icon={<Receipt size={22} strokeWidth={1.7} />} title="Nenhuma cobrança gerada ainda" description="As cobranças Pix criadas na OS e no PDV aparecerão aqui." />}
                />
              </Card>
            </div>
          )}

          {tab === 'dre' && (
            <Card flush>
              <div className="border-b border-line-soft px-4 py-3">
                <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Demonstração do Resultado</h3>
                <p className="mt-0.5 text-[12px] text-ink-3">Receitas, despesas por categoria e resultado líquido</p>
              </div>
              {lancamentos.length === 0 ? (
                <EmptyState icon={<Receipt size={22} strokeWidth={1.7} />} title="Nenhum lançamento registrado" description="Registre entradas e saídas para gerar o DRE." />
              ) : (
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between border-b border-line-soft py-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">Receita bruta</span>
                    <span className="num text-[13.5px] font-semibold text-ok">+{fmtBRL(dre.receitaBruta)}</span>
                  </div>

                  <div className="pb-1 pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">(−) Despesas por categoria</span>
                  </div>
                  {dre.despesas.length === 0 ? (
                    <div className="py-2 text-[13px] text-ink-2">Nenhuma despesa registrada.</div>
                  ) : (
                    dre.despesas.map(d => (
                      <div key={d.categoria} className="flex items-center justify-between border-b border-line-soft py-2">
                        <span className="text-[13px] text-ink-2">{d.categoria}</span>
                        <span className="num text-[13px] text-bad">−{fmtBRL(d.valor)}</span>
                      </div>
                    ))
                  )}
                  <div className="flex items-center justify-between border-b border-line-soft py-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">Total de despesas</span>
                    <span className="num text-[13.5px] font-semibold text-bad">−{fmtBRL(dre.totalDespesas)}</span>
                  </div>

                  <div className="mt-1 flex items-center justify-between pt-4">
                    <div>
                      <span className="text-[15px] font-bold text-ink">Resultado líquido</span>
                      <span className="block text-[11px] text-ink-3">margem {dre.margem.toFixed(1)}%</span>
                    </div>
                    <span className={cn('num text-[18px] font-bold', dre.resultado >= 0 ? 'text-ok' : 'text-bad')}>
                      {dre.resultado >= 0 ? '+' : '−'}{fmtBRL(Math.abs(dre.resultado))}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          )}

        </div>
      </div>

      {/* Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        size="lg"
        disableOverlayClose={saving}
        title={editId ? 'Editar lançamento' : 'Novo lançamento'}
        footer={
          <>
            {editId && (
              <Button variant="ghost" className="mr-auto text-bad hover:bg-bad-soft" icon={<Trash2 size={15} strokeWidth={1.7} />} onClick={excluir} disabled={saving}>
                Remover
              </Button>
            )}
            <Button variant="ghost" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} loading={saving}>Salvar</Button>
          </>
        }
      >
        <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Tipo */}
          <div className="col-span-2 grid grid-cols-2 gap-2">
            {(['receita','despesa'] as const).map(t => (
              <button type="button" key={t} onClick={() => set('tipo', t)}
                className={cn(
                  'h-9 rounded-control border text-[13px] font-semibold transition-colors',
                  form.tipo === t
                    ? t === 'receita'
                      ? 'border-ok/30 bg-ok-soft text-ok'
                      : 'border-bad/30 bg-bad-soft text-bad'
                    : 'border-line bg-card text-ink-2 hover:bg-bg'
                )}>
                {t === 'receita' ? 'Receita' : 'Despesa'}
              </button>
            ))}
          </div>

          <Input wrapperClassName="col-span-2" label="Descrição" required value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Ex: Pagamento fornecedor, Venda à vista..." />

          <Input label="Valor (R$)" required type="number" step="0.01" min="0" value={form.valor} onChange={e => set('valor', e.target.value)} placeholder="0,00" />
          <Input label="Vencimento" required type="date" value={form.data_venc} onChange={e => set('data_venc', e.target.value)} />

          <Input label="Categoria" list="fin-categorias" value={form.categoria} onChange={e => set('categoria', e.target.value)} placeholder="Ex: Fornecedor, Aluguel, Marketing…" />
          <datalist id="fin-categorias">
            {[...new Set([...catsFiltradas.map(c => c.nome), 'Vendas', 'Fornecedor', 'Aluguel', 'Salários', 'Marketing', 'Impostos', 'Serviços', 'Outros'])].map(c => <option key={c} value={c} />)}
          </datalist>
          <Select label="Forma de pagamento" value={form.forma_pgto} onChange={e => set('forma_pgto', e.target.value)}>
            <option value="">— Selecionar —</option>
            {FORMAS.map(f => <option key={f} value={f}>{FORMAS_LABEL[f]}</option>)}
          </Select>

          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="atrasado">Atrasado</option>
            <option value="cancelado">Cancelado</option>
          </Select>
          <Input label="Data de pagamento" type="date" value={form.data_pgto} onChange={e => set('data_pgto', e.target.value)} />

          <Textarea wrapperClassName="col-span-2" label="Observações" rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Notas adicionais..." />

          {erro && <p className="col-span-2 text-[12px] font-medium text-bad">{erro}</p>}
        </form>
      </Modal>
    </div>
  )
}

function LancamentosTable({ lancamentos, onEditar }: { lancamentos: Lancamento[]; onEditar: (l: Lancamento) => void }) {
  const cols: Column<Lancamento>[] = [
    {
      key: 'data', header: 'Data', className: 'num w-[88px]',
      render: (l) => <span className="text-ink-2">{new Date(l.data_venc ? l.data_venc + 'T00:00:00' : l.created_at ?? '').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span>,
    },
    { key: 'descricao', header: 'Descrição', render: (l) => <span className="font-medium text-ink">{l.descricao ?? '—'}</span> },
    { key: 'categoria', header: 'Categoria', hideOnMobile: true, render: (l) => <span className="text-ink-2">{l.categoria ?? '—'}</span> },
    { key: 'tipo', header: 'Tipo', render: (l) => <Badge tone={l.tipo === 'receita' ? 'ok' : 'bad'}>{l.tipo === 'receita' ? 'Receita' : 'Despesa'}</Badge> },
    {
      key: 'valor', header: 'Valor', align: 'right', className: 'num',
      render: (l) => {
        const isReceita = l.tipo === 'receita'
        return <span className={cn('font-semibold', isReceita ? 'text-ok' : 'text-bad')}>{isReceita ? '+' : '−'} {l.valor != null ? formatCurrency(l.valor) : '—'}</span>
      },
    },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (l) => {
        const tone = l.status === 'pago' ? 'ok' : l.status === 'atrasado' ? 'bad' : 'warn'
        const label = l.status === 'pago' ? 'Pago' : l.status === 'atrasado' ? 'Atrasado' : 'Pendente'
        return <Badge tone={tone}>{label}</Badge>
      },
    },
  ]
  return (
    <Table
      columns={cols}
      rows={lancamentos}
      rowKey={(l) => l.id}
      onRowClick={onEditar}
      empty={<EmptyState icon={<Receipt size={22} strokeWidth={1.7} />} title="Nenhum lançamento" description="Registre uma entrada ou saída para começar." />}
    />
  )
}
