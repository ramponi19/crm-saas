'use client'

import { useState, useMemo } from 'react'
import { TrendingUp, Users, Download, Search, Receipt, Wallet } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, StatCard, Table, Badge, Tabs, Button, Input, Select, EmptyState, type Column } from '@/components/ui'
import { RelatorioPerdas } from './relatorio-perdas'

interface Venda {
  id: number
  data_venda: string | null
  cliente_nome: string | null
  produto_nome: string | null
  vendedor_nome: string | null
  canal_venda: string | null
  valor_venda: number
  desconto_valor: number | null
  lucro: number | null
  forma_pagamento: string | null
  status: string | null
  /** Aparelho aceito em troca nesta venda ainda não chegou na loja. */
  troca_pendente?: boolean
}

interface Lancamento {
  id: number
  data_venc: string
  descricao: string | null
  categoria: string | null
  tipo: string
  valor: number
  status: string
}

interface Props {
  vendas: Venda[]
  lancamentos: Lancamento[]
  vendedores: string[]
}

const CANAL_LABEL: Record<string, string> = {
  loja_fisica: 'Loja física', whatsapp: 'WhatsApp',
  instagram: 'Instagram', site: 'Site', link: 'Link',
  // Venda gerada por orçamento de downgrade aprovado no link público.
  downgrade: 'Downgrade',
}

const TABS = [
  { id: 'vendas',    label: 'Vendas',   Icon: TrendingUp },
  { id: 'caixa',     label: 'Livro-caixa', Icon: Wallet   },
  { id: 'clientes',  label: 'Clientes', Icon: Users      },
  { id: 'exportar',  label: 'Exportar', Icon: Download   },
]

// Escapa um campo CSV: envolve em aspas quando contém vírgula, aspas ou quebra.
function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCSV(filename: string, header: string[], rows: (string | number | null)[][]) {
  const content = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
  // BOM para o Excel reconhecer UTF-8 (acentos)
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportCSV(rows: Venda[]) {
  if (rows.length === 0) { toast.info('Nenhuma venda para exportar'); return }
  downloadCSV(
    'vendas',
    // Coluna de troca também no CSV: quem fecha o mês na planilha precisa poder
    // separar lá o que a tela separa aqui.
    ['Data', 'Cliente', 'Produto', 'Vendedor', 'Canal', 'Valor', 'Desconto', 'Lucro', 'Troca pendente'],
    rows.map(v => [
      v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '',
      v.cliente_nome ?? '', v.produto_nome ?? '', v.vendedor_nome ?? '',
      CANAL_LABEL[v.canal_venda ?? ''] ?? v.canal_venda ?? '',
      v.valor_venda, v.desconto_valor ?? 0, v.lucro ?? 0,
      v.troca_pendente ? 'sim' : 'nao',
    ])
  )
}

function exportFinanceiro(rows: Lancamento[]) {
  if (rows.length === 0) { toast.info('Nenhum lançamento para exportar'); return }
  downloadCSV(
    'financeiro',
    ['Vencimento', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status'],
    rows.map(l => [
      l.data_venc ? new Date(l.data_venc).toLocaleDateString('pt-BR') : '',
      l.descricao ?? '', l.categoria ?? '', l.tipo, l.valor, l.status,
    ])
  )
}

async function exportClientes() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('nome, telefone, email, cidade, estado, created_at')
    .order('nome')
  if (error || !data) { toast.error('Erro ao exportar clientes'); return }
  if (data.length === 0) { toast.info('Nenhum cliente para exportar'); return }
  downloadCSV(
    'clientes',
    ['Nome', 'Telefone', 'E-mail', 'Cidade', 'Estado', 'Cadastro'],
    (data as Array<{ nome: string | null; telefone: string | null; email: string | null; cidade: string | null; estado: string | null; created_at: string | null }>).map(c => [
      c.nome ?? '', c.telefone ?? '', c.email ?? '', c.cidade ?? '', c.estado ?? '',
      c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '',
    ])
  )
}

async function exportEstoque() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('inventario_unidades')
    .select('imei, numero_serie, estado, status, preco_custo, preco_venda, produtos!produto_id(nome)')
    .eq('ativo', true)
    .order('id', { ascending: false })
  if (error || !data) { toast.error('Erro ao exportar estoque'); return }
  if (data.length === 0) { toast.info('Nenhuma unidade para exportar'); return }
  downloadCSV(
    'estoque',
    ['Produto', 'IMEI', 'Nº Série', 'Estado', 'Status', 'Custo', 'Venda'],
    (data as Array<{ imei: string | null; numero_serie: string | null; estado: string | null; status: string | null; preco_custo: number | null; preco_venda: number | null; produtos: { nome: string | null } | { nome: string | null }[] | null }>).map(u => {
      const prod = Array.isArray(u.produtos) ? u.produtos[0] : u.produtos
      return [
        prod?.nome ?? '', u.imei ?? '', u.numero_serie ?? '', u.estado ?? '',
        u.status ?? '', u.preco_custo ?? 0, u.preco_venda ?? 0,
      ]
    })
  )
}

function BarChart({ vendas }: { vendas: Venda[] }) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const total = vendas
      .filter(v => v.data_venda?.startsWith(key) && v.status === 'concluida')
      .reduce((s, v) => s + v.valor_venda, 0)
    return { label, total }
  })
  const maxVal = Math.max(...days.map(d => d.total), 1)
  return (
    <div className="flex flex-col gap-3">
      {days.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="num w-[52px] shrink-0 text-[11.5px] text-ink-2">{d.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${d.total > 0 ? Math.max((d.total / maxVal) * 100, 4) : 0}%` }} />
          </div>
          <span className={cn('num w-[96px] shrink-0 text-right text-[11.5px]', d.total > 0 ? 'font-semibold text-ink' : 'text-ink-3')}>
            {d.total > 0 ? formatCurrency(d.total) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function RelatoriosView({ vendas, lancamentos, vendedores }: Props) {
  const [aba, setAba]           = useState('vendas')
  const [dataIni, setDataIni]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [dataFim, setDataFim]   = useState(() => new Date().toISOString().slice(0, 10))
  const [vendedor, setVendedor] = useState('Todos')

  const vendasFiltradas = useMemo(() => vendas.filter(v => {
    if (!v.data_venda) return false
    const d = v.data_venda.slice(0, 10)
    if (d < dataIni || d > dataFim) return false
    if (vendedor !== 'Todos' && v.vendedor_nome !== vendedor) return false
    return true
  }), [vendas, dataIni, dataFim, vendedor])

  const kpis = useMemo(() => {
    const conc     = vendasFiltradas.filter(v => v.status === 'concluida')
    const receita  = conc.reduce((s, v) => s + v.valor_venda, 0)
    const lucro    = conc.reduce((s, v) => s + (v.lucro ?? 0), 0)
    const qtd      = conc.length
    const ticket   = qtd > 0 ? receita / qtd : 0
    const descontos = conc.reduce((s, v) => s + (v.desconto_valor ?? 0), 0)
    return [
      { label: 'Total vendas', value: formatCurrency(receita) },
      { label: 'Lucro total',  value: formatCurrency(lucro) },
      { label: 'Ticket médio', value: formatCurrency(ticket) },
      { label: 'Descontos',    value: formatCurrency(descontos) },
      { label: 'Qtd. vendas',  value: String(qtd) },
    ]
  }, [vendasFiltradas])

  // Separação, não subtração: o "Total vendas" acima continua sendo o número real
  // do mês — esconder o pendente faria o faturamento mentir para menos. O que
  // falta é saber quanto dele ainda depende de um aparelho de troca entrar na
  // loja, e isso é aviso, não KPI de rotina: fica em faixa própria e só aparece
  // quando existe pendência.
  const troca = useMemo(() => {
    const conc = vendasFiltradas.filter(v => v.status === 'concluida')
    const pendentes = conc.filter(v => v.troca_pendente)
    const valorPendente = pendentes.reduce((s, v) => s + v.valor_venda, 0)
    const total = conc.reduce((s, v) => s + v.valor_venda, 0)
    return { qtd: pendentes.length, valorPendente, firme: total - valorPendente }
  }, [vendasFiltradas])

  const mesAtual  = new Date().toISOString().slice(0, 7)
  const lancMes   = lancamentos.filter(l => l.data_venc.startsWith(mesAtual))
  const entradas  = lancMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const saidas    = lancMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
  const saldo     = entradas - saidas

  const vendaCols: Column<Venda>[] = [
    { key: 'data', header: 'Data', className: 'num w-[100px]', render: v => <span className="text-ink-2">{v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—'}</span> },
    { key: 'cliente', header: 'Cliente', render: v => <span className="font-medium text-ink">{v.cliente_nome ?? '—'}</span> },
    { key: 'produto', header: 'Produto', hideOnMobile: true, render: v => <span className="text-ink-2">{v.produto_nome ?? v.forma_pagamento ?? '—'}</span> },
    { key: 'vendedor', header: 'Vendedor', hideOnMobile: true, render: v => <span className="text-ink-2">{v.vendedor_nome ?? '—'}</span> },
    { key: 'canal', header: 'Canal', hideOnMobile: true, render: v => <Badge tone="neutro">{CANAL_LABEL[v.canal_venda ?? ''] ?? v.canal_venda ?? '—'}</Badge> },
    {
      key: 'valor', header: 'Valor', align: 'right', className: 'num',
      render: v => (
        <div className="flex flex-col items-end">
          <span className="font-semibold text-ink">{formatCurrency(v.valor_venda)}</span>
          {/* Saber o valor pendente sem saber QUAL venda é não deixa ninguém agir. */}
          {v.troca_pendente && <span className="text-[10.5px] text-warn">troca não chegou</span>}
        </div>
      ),
    },
    { key: 'desc', header: 'Desc.', align: 'right', className: 'num', hideOnMobile: true, render: v => <span className="text-bad">{v.desconto_valor ? formatCurrency(v.desconto_valor) : '—'}</span> },
    { key: 'lucro', header: 'Lucro', align: 'right', className: 'num', render: v => <span className={cn('font-bold', (v.lucro ?? 0) > 0 ? 'text-ok' : 'text-bad')}>{v.lucro != null ? formatCurrency(v.lucro) : '—'}</span> },
  ]

  const lancCols: Column<Lancamento>[] = [
    { key: 'data', header: 'Data', className: 'num w-[100px]', render: l => <span className="text-ink-2">{new Date(l.data_venc + 'T00:00:00').toLocaleDateString('pt-BR')}</span> },
    { key: 'desc', header: 'Descrição', render: l => <span className="font-medium text-ink">{l.descricao ?? '—'}</span> },
    { key: 'cat', header: 'Categoria', hideOnMobile: true, render: l => <span className="text-ink-2">{l.categoria ?? '—'}</span> },
    { key: 'tipo', header: 'Tipo', render: l => { const r = l.tipo === 'receita'; return <Badge tone={r ? 'ok' : 'bad'}>{r ? 'Entrada' : 'Saída'}</Badge> } },
    { key: 'valor', header: 'Valor', align: 'right', className: 'num', render: l => { const r = l.tipo === 'receita'; return <span className={cn('font-semibold', r ? 'text-ok' : 'text-bad')}>{r ? '+' : '−'} {formatCurrency(l.valor)}</span> } },
    { key: 'status', header: 'Status', align: 'right', render: l => { const p = l.status === 'pago'; return <Badge tone={p ? 'ok' : 'warn'}>{p ? 'Pago' : 'Pendente'}</Badge> } },
  ]

  const tabItems = TABS.map(({ id, label, Icon }) => ({
    value: id,
    label: <span className="flex items-center gap-1.5"><Icon size={15} strokeWidth={1.7} /> {label}</span>,
  }))

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1240px] space-y-4">

        {/* Tabs */}
        <Tabs items={tabItems} value={aba} onValueChange={setAba} />

        {/* ── ABA VENDAS ── */}
        {aba === 'vendas' && (<>
          {/* Filtros */}
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Input label="Início" type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} wrapperClassName="w-[160px]" />
              <Input label="Fim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} wrapperClassName="w-[160px]" />
              <Select label="Vendedor" value={vendedor} onChange={e => setVendedor(e.target.value)} wrapperClassName="min-w-[180px] flex-1">
                <option>Todos</option>
                {vendedores.map(v => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
              <Button
                icon={<Search size={15} strokeWidth={1.7} />}
                onClick={() => toast.success(`${vendasFiltradas.length} ${vendasFiltradas.length === 1 ? 'venda' : 'vendas'} no período selecionado`)}
              >
                Gerar
              </Button>
              <Button variant="outline" icon={<Download size={15} strokeWidth={1.7} />} onClick={() => exportCSV(vendasFiltradas)}>CSV</Button>
            </div>
          </Card>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-5 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            {kpis.map(k => (
              <StatCard key={k.label} bare label={k.label} value={k.value} />
            ))}
          </div>

          {/* Quanto do total ainda depende de um aparelho de troca chegar. */}
          {troca.qtd > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-warn/30 bg-warn-soft px-4 py-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">Faturamento firme</div>
                <div className="num text-[18px] font-bold text-ink">{formatCurrency(troca.firme)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">Aguardando troca</div>
                <div className="num text-[18px] font-bold text-warn">{formatCurrency(troca.valorPendente)}</div>
              </div>
              <p className="min-w-[220px] flex-1 text-[12px] text-ink-2">
                {troca.qtd === 1 ? '1 venda depende' : `${troca.qtd} vendas dependem`} de um aparelho aceito em troca que ainda não chegou na loja.
                O total acima já inclui esse valor — confirme a chegada no Estoque para liberar comissão e ranking.
              </p>
            </div>
          )}

          {/* Gráfico */}
          <Card title="Vendas por dia" actions={<span className="num text-[11px] text-ink-3">Últimos 7 dias</span>}>
            <BarChart vendas={vendas} />
          </Card>

          {/* Tabela */}
          <Card flush>
            <Table
              columns={vendaCols}
              rows={vendasFiltradas}
              rowKey={v => v.id}
              empty={<EmptyState icon={<Receipt size={22} strokeWidth={1.7} />} title="Nenhuma venda no período" description="Ajuste o período ou o vendedor no filtro acima." />}
            />
          </Card>
        </>)}

        {/* ── ABA LIVRO-CAIXA ── */}
        {aba === 'caixa' && (
          <Card
            flush
            title={<>Livro-caixa · {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</>}
            actions={
              <span className="text-[12px] text-ink-2">
                Entradas <span className="num font-semibold text-ok">{formatCurrency(entradas)}</span>
                {' · '}Saídas <span className="num font-semibold text-bad">{formatCurrency(saidas)}</span>
                {' · '}Saldo{' '}
                <span className={cn('num font-semibold', saldo >= 0 ? 'text-ok' : 'text-bad')}>
                  {formatCurrency(saldo)}
                </span>
              </span>
            }
          >
            <Table
              columns={lancCols}
              rows={lancMes}
              rowKey={l => l.id}
              empty={<EmptyState icon={<Wallet size={22} strokeWidth={1.7} />} title="Sem lançamentos este mês" description="Os lançamentos financeiros do mês aparecerão aqui." />}
            />
          </Card>
        )}

        {/* ── ABA CLIENTES ── */}
        {aba === 'clientes' && (
          <Card>
            <EmptyState icon={<Users size={22} strokeWidth={1.7} />} title="Relatório de clientes em construção" description="Em breve você verá métricas detalhadas de clientes aqui." />
          </Card>
        )}

        {/* ── ABA EXPORTAR ── */}
        {aba === 'exportar' && (
          <Card title="Exportar dados">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Exportar Vendas',      sub: 'Todas as vendas do período filtrado',  action: () => exportCSV(vendasFiltradas) },
                { label: 'Exportar Clientes',    sub: 'Lista completa de clientes', action: exportClientes },
                { label: 'Exportar Estoque',     sub: 'Inventário atual',           action: exportEstoque },
                { label: 'Exportar Financeiro',  sub: 'Lançamentos financeiros',    action: () => exportFinanceiro(lancamentos) },
              ].map(e => (
                <button key={e.label} onClick={e.action}
                  className="flex items-start gap-3 rounded-card border border-line bg-card p-4 text-left transition-colors hover:bg-raised">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-accent-soft text-accent">
                    <Download size={17} strokeWidth={1.7} />
                  </span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-ink">{e.label}</div>
                    <div className="mt-0.5 text-[12px] text-ink-2">{e.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="mt-4"><RelatorioPerdas /></div>
      </div>
    </main>
  )
}
