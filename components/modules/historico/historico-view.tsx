'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Receipt, Check, ArrowLeftRight, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { imprimirContratoVenda, type ContratoLoja } from '@/lib/contrato-venda'
import { Card, StatCard, Table, Tabs, Badge, Button, EmptyState, Modal, Select, notify, type Column } from '@/components/ui'

interface Venda {
  id: number
  data_venda: string | null
  cliente_nome: string | null
  produto_nome: string | null
  vendedor_nome: string | null
  canal_venda: string | null
  forma_pagamento: string | null
  valor_venda: number
  lucro: number | null
  status: string | null
  parcelas: number | null
  cliente_id: number | null
  numero_serie: string | null
  desconto_valor: number | null
}

interface Props { vendas: Venda[]; isAdmin?: boolean; vendedores?: { id: string; nome: string }[]; loja: ContratoLoja }

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutro' }> = {
  concluida: { label: 'Concluída', tone: 'ok' },
  encomenda: { label: 'Encomenda', tone: 'warn' },
  pendente_entrega: { label: 'Pendente entrega', tone: 'warn' },
  pendente: { label: 'Pendente', tone: 'warn' },
  cancelada: { label: 'Cancelada', tone: 'bad' },
  devolvido: { label: 'Devolvido', tone: 'neutro' },
}

const CANAL_LABEL: Record<string, string> = {
  loja_fisica: 'Loja física', whatsapp: 'WhatsApp', instagram: 'Instagram', site: 'Site', link: 'Link',
}

const CHIPS = [
  { value: 'all', label: 'Todas' },
  { value: 'encomenda', label: 'Encomendas' },
  { value: 'pendente_entrega', label: 'Pendente entrega' },
  { value: 'concluida', label: 'Concluídas' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'cancelada', label: 'Canceladas' },
  { value: 'devolvido', label: 'Devolvidos' },
]

// Escapa célula CSV: aspas quando há vírgula, aspas ou quebra de linha.
const csvCell = (v: string | number) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCSV(rows: Venda[]) {
  const header = 'Data,Cliente,Produto,Vendedor,Canal,Pagamento,Valor,Lucro,Status'
  const lines = rows.map((v) => [
    v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '',
    v.cliente_nome ?? '', v.produto_nome ?? '', v.vendedor_nome ?? '',
    CANAL_LABEL[v.canal_venda ?? ''] ?? v.canal_venda ?? '',
    v.forma_pagamento ?? '', v.valor_venda, v.lucro ?? 0, v.status ?? '',
  ].map(csvCell).join(','))
  // BOM (﻿) p/ o Excel abrir os acentos corretamente.
  const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `historico_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

export function HistoricoView({ vendas, isAdmin = false, vendedores = [], loja }: Props) {
  const [filtro, setFiltro] = useState('all')
  const [finalizando, setFinalizando] = useState<number | null>(null)
  const [transf, setTransf] = useState<Venda | null>(null)
  const [novoVend, setNovoVend] = useState('')
  const [transfBusy, setTransfBusy] = useState(false)
  const [contratoBusy, setContratoBusy] = useState<number | null>(null)
  const router = useRouter()

  async function gerarContrato(v: Venda) {
    setContratoBusy(v.id)
    let comprador = {
      nome: v.cliente_nome ?? '', cpf_cnpj: null as string | null, nacionalidade: null as string | null,
      estado_civil: null as string | null, profissao: null as string | null, data_nascimento: null as string | null,
      telefone: null as string | null, endereco: null as string | null, numero: null as string | null,
      complemento: null as string | null, bairro: null as string | null, cidade: null as string | null,
      estado: null as string | null, cep: null as string | null,
    }
    if (v.cliente_id) {
      const { data: c } = await createClient().from('clientes')
        .select('nome, cpf_cnpj, nacionalidade, estado_civil, profissao, data_nascimento, telefone, endereco, numero, complemento, bairro, cidade, estado, cep')
        .eq('id', v.cliente_id).maybeSingle()
      if (c) comprador = { ...comprador, ...(c as typeof comprador) }
    }
    setContratoBusy(null)
    const ok = imprimirContratoVenda({
      loja,
      comprador,
      itens: [{ descricao: v.produto_nome ?? 'Produto', imei: v.numero_serie, valor: v.valor_venda }],
      total: v.valor_venda,
      desconto: v.desconto_valor ?? 0,
      forma_pagamento: v.forma_pagamento,
      parcelas: v.parcelas,
      vendedor: v.vendedor_nome,
      data: v.data_venda ?? undefined,
    })
    if (!ok) notify.warn('Permita pop-ups para gerar o contrato')
  }

  async function transferir() {
    if (!transf || !novoVend) return
    setTransfBusy(true)
    const { error } = await createClient().from('vendas').update({ vendedor_id: novoVend }).eq('id', transf.id)
    setTransfBusy(false)
    if (error) { notify.bad('Erro ao transferir'); return }
    notify.ok('Venda transferida'); setTransf(null); setNovoVend(''); router.refresh()
  }

  async function finalizarEncomenda(id: number) {
    setFinalizando(id)
    const supabase = createClient()
    // Se houver unidade reservada (veio da compra recebida), baixa do estoque.
    const { data: v } = await supabase.from('vendas').select('unidade_id').eq('id', id).maybeSingle()
    const { error } = await supabase.from('vendas').update({ status: 'concluida', data_venda: new Date().toISOString() }).eq('id', id)
    if (!error && v?.unidade_id) {
      await supabase.from('inventario_unidades').update({ status: 'vendido' }).eq('id', v.unidade_id)
    }
    setFinalizando(null)
    if (error) { notify.bad('Erro ao finalizar'); return }
    notify.ok('Venda concluída', v?.unidade_id ? 'Contabilizada + unidade baixada do estoque' : 'A venda agora conta no faturamento')
    router.refresh()
  }

  const stats = useMemo(() => {
    const conc = vendas.filter((v) => v.status === 'concluida')
    return {
      total: vendas.length,
      faturamento: conc.reduce((s, v) => s + v.valor_venda, 0),
      lucro: conc.reduce((s, v) => s + (v.lucro ?? 0), 0),
      canceladas: vendas.filter((v) => v.status === 'cancelada').length,
    }
  }, [vendas])

  const filtered = useMemo(
    () => (filtro === 'all' ? vendas : vendas.filter((v) => v.status === filtro)),
    [vendas, filtro],
  )

  const cols: Column<Venda>[] = [
    { key: 'data', header: 'Data', className: 'num w-[100px]', render: (v) => <span className="text-ink-2">{v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—'}</span> },
    { key: 'cliente', header: 'Cliente', render: (v) => <span className="font-medium text-ink">{v.cliente_nome ?? '—'}</span> },
    { key: 'produto', header: 'Produto', hideOnMobile: true, render: (v) => <span className="text-ink-2">{v.produto_nome ?? v.forma_pagamento ?? '—'}</span> },
    {
      key: 'vendedor', header: 'Vendedor', hideOnMobile: true,
      render: (v) => (
        <span className="flex items-center gap-1.5">
          <span className="text-ink-2">{v.vendedor_nome ?? '—'}</span>
          {isAdmin && (
            <button onClick={(e) => { e.stopPropagation(); setTransf(v); setNovoVend('') }} title="Transferir venda" className="text-ink-3 hover:text-accent"><ArrowLeftRight size={13} strokeWidth={1.8} /></button>
          )}
        </span>
      ),
    },
    {
      key: 'pgto', header: 'Pagamento', hideOnMobile: true,
      render: (v) => <span className="text-ink-2">{[v.forma_pagamento ?? '', v.parcelas && v.parcelas > 1 ? `${v.parcelas}x` : ''].filter(Boolean).join(' · ') || '—'}</span>,
    },
    {
      key: 'valor', header: 'Valor / Lucro', align: 'right', className: 'num',
      render: (v) => (
        <div>
          <div className="font-semibold text-ink">{formatCurrency(v.valor_venda)}</div>
          {v.lucro != null && <div className={(v.lucro ?? 0) >= 0 ? 'text-[11px] font-semibold text-ok' : 'text-[11px] font-semibold text-bad'}>{(v.lucro ?? 0) >= 0 ? '+' : ''}{formatCurrency(v.lucro)}</div>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (v) => {
        const s = STATUS[v.status ?? ''] ?? STATUS.pendente
        const contrato = v.status !== 'cancelada' && v.status !== 'devolvido' && (
          <button onClick={(e) => { e.stopPropagation(); gerarContrato(v) }} disabled={contratoBusy === v.id} title="Gerar contrato de venda" className="text-ink-3 hover:text-accent disabled:opacity-40"><FileText size={14} strokeWidth={1.8} /></button>
        )
        if (v.status === 'encomenda' || v.status === 'pendente_entrega') return (
          <div className="flex items-center justify-end gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            <Button size="sm" variant="outline" loading={finalizando === v.id} icon={<Check size={13} strokeWidth={2} />} onClick={(e) => { e.stopPropagation(); finalizarEncomenda(v.id) }}>{v.status === 'pendente_entrega' ? 'Entregar' : 'Finalizar'}</Button>
          </div>
        )
        return <div className="flex items-center justify-end gap-2">{contrato}<Badge tone={s.tone}>{s.label}</Badge></div>
      },
    },
  ]

  return (
    <>
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1240px] space-y-4">

        <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
          <StatCard bare label="Vendas no período" value={stats.total} />
          <StatCard bare label="Faturamento" value={formatCurrency(stats.faturamento)} />
          <StatCard bare label="Lucro bruto" value={formatCurrency(stats.lucro)} deltaTone="ok" />
          <StatCard bare label="Canceladas" value={stats.canceladas} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs items={CHIPS} value={filtro} onValueChange={setFiltro} className="border-b-0" />
          <Button variant="outline" size="sm" icon={<Download size={14} strokeWidth={1.7} />} onClick={() => exportCSV(filtered)}>Exportar</Button>
        </div>

        <Card flush>
          <Table
            columns={cols}
            rows={filtered}
            rowKey={(v) => v.id}
            empty={<EmptyState icon={<Receipt size={22} strokeWidth={1.7} />} title="Nenhuma venda encontrada" description="Ajuste o filtro ou registre uma venda no PDV." />}
          />
        </Card>

      </div>
    </main>

    {transf && (
      <Modal open onClose={() => setTransf(null)} title="Transferir venda" footer={<>
        <Button variant="ghost" onClick={() => setTransf(null)}>Cancelar</Button>
        <Button onClick={transferir} loading={transfBusy} disabled={!novoVend}>Transferir</Button>
      </>}>
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">Venda de <strong className="text-ink">{formatCurrency(transf.valor_venda)}</strong>{transf.cliente_nome ? ` — ${transf.cliente_nome}` : ''}. Atual: {transf.vendedor_nome ?? 'sem vendedor'}.</p>
          <Select label="Novo vendedor" value={novoVend} onChange={(e) => setNovoVend(e.target.value)}>
            <option value="">Selecionar…</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </Select>
        </div>
      </Modal>
    )}
    </>
  )
}
