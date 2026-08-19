'use client'

import { useMemo, useState } from 'react'
import { Table, Badge, Button, Input, Card, EmptyState, notify, type Column } from '@/components/ui'
import { formatarData } from '@/lib/datas'
import { TAXAS_PADRAO, type TaxasComissao } from '@/lib/comissao-imob'
import { Handshake, Percent } from 'lucide-react'

/**
 * Comissão por negócio — a aba que a imobiliária pede e o varejo não usa.
 *
 * Aditiva ao Financeiro que já existe: o livro-caixa e o DRE continuam valendo,
 * porque imobiliária também paga aluguel e salário. O que ela tem a mais é o que
 * cada negócio rende para quem captou, para quem vendeu e para a casa.
 *
 * Os valores vêm CONGELADOS do negócio, não recalculados aqui. Se a loja mudar a
 * taxa, os negócios fechados não mudam — e por isso a tela mostra o percentual de
 * cada linha, em vez de um percentual único no cabeçalho que mentiria para as
 * linhas antigas.
 */

export interface NegocioComissao {
  id: number
  tipo: string
  valor: number
  status: string
  assinado_em: string | null
  percentual: number | null
  comissao_total: number | null
  comissao_captador: number | null
  comissao_vendedor: number | null
  cashback: number | null
  comissao_status: string | null
  comissao_paga_em: string | null
  imovel: string | null
  cliente: string | null
  corretor: string | null
  captador: string | null
}

const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

const TONE_TIPO: Record<string, 'acc' | 'ok'> = { venda: 'acc', locacao: 'ok' }

export function ComissoesImob({
  negocios, taxas, podeQuitar,
}: {
  negocios: NegocioComissao[]
  taxas: TaxasComissao
  /** Quitar é ato de caixa: só dono e admin veem o botão (e a rota confere de novo). */
  podeQuitar: boolean
}) {
  const [lista, setLista] = useState(negocios)
  const [form, setForm] = useState({
    percentual_venda: String(taxas.percentual_venda),
    percentual_locacao: String(taxas.percentual_locacao),
    parte_captador: String(taxas.parte_captador),
    parte_vendedor: String(taxas.parte_vendedor),
  })
  const [salvando, setSalvando] = useState(false)
  const [quitando, setQuitando] = useState<number | null>(null)

  const totais = useMemo(() => {
    const abertas = lista.filter((n) => n.comissao_status !== 'paga' && n.status !== 'cancelado')
    const pagas = lista.filter((n) => n.comissao_status === 'paga')
    const soma = (arr: NegocioComissao[], f: (n: NegocioComissao) => number | null) =>
      arr.reduce((s, n) => s + (Number(f(n)) || 0), 0)
    return {
      aberto: soma(abertas, (n) => n.comissao_total),
      pago: soma(pagas, (n) => n.comissao_total),
      cashback: soma(lista, (n) => n.cashback),
      // O que sobra para a casa: total menos as partes dos corretores e o cashback.
      casa: lista
        .filter((n) => n.status !== 'cancelado')
        .reduce((s, n) => s + Math.max(0,
          (Number(n.comissao_total) || 0) - (Number(n.comissao_captador) || 0)
          - (Number(n.comissao_vendedor) || 0) - (Number(n.cashback) || 0)), 0),
    }
  }, [lista])

  async function salvarTaxas() {
    setSalvando(true)
    const res = await fetch('/api/imob/comissao-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        percentual_venda: Number(form.percentual_venda),
        percentual_locacao: Number(form.percentual_locacao),
        parte_captador: Number(form.parte_captador),
        parte_vendedor: Number(form.parte_vendedor),
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSalvando(false)
    if (!res.ok) { notify.bad('Não foi possível salvar', j?.error); return }
    notify.ok('Taxas salvas', 'Valem para os próximos negócios; os fechados mantêm a taxa deles.')
  }

  async function quitar(id: number) {
    setQuitando(id)
    const res = await fetch('/api/imob/negocios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, comissao_status: 'paga' }),
    })
    const j = await res.json().catch(() => ({}))
    setQuitando(null)
    if (!res.ok) { notify.bad('Não foi possível quitar', j?.error); return }
    const hoje = new Date()
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    setLista((l) => l.map((n) => (n.id === id ? { ...n, comissao_status: 'paga', comissao_paga_em: iso } : n)))
    notify.ok('Comissão quitada')
  }

  const colunas: Column<NegocioComissao>[] = [
    {
      key: 'imovel', header: 'Negócio',
      render: (n) => (
        <span className="block">
          <span className="block truncate text-[13px] font-medium text-ink">{n.imovel ?? '—'}</span>
          <span className="block truncate text-[11.5px] text-ink-3">{n.cliente ?? 'sem cliente'}</span>
        </span>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (n) => <Badge tone={TONE_TIPO[n.tipo] ?? 'neutro'}>{n.tipo === 'locacao' ? 'Locação' : 'Venda'}</Badge> },
    { key: 'valor', header: 'Valor do negócio', align: 'right', className: 'num', render: (n) => brl(n.valor) },
    // O percentual é POR LINHA porque cada negócio guarda a taxa do dia em que fechou.
    { key: 'percentual', header: '%', align: 'right', className: 'num', render: (n) => (n.percentual != null ? `${n.percentual}%` : '—') },
    { key: 'comissao_total', header: 'Comissão', align: 'right', className: 'num', render: (n) => <span className="font-semibold text-ink">{brl(n.comissao_total)}</span> },
    { key: 'comissao_captador', header: 'Captador', align: 'right', className: 'num', render: (n) => (
      <span className="block">
        <span className="block">{brl(n.comissao_captador)}</span>
        <span className="block truncate text-[11px] text-ink-3">{n.captador ?? 'não informado'}</span>
      </span>
    ) },
    { key: 'comissao_vendedor', header: 'Vendedor', align: 'right', className: 'num', render: (n) => (
      <span className="block">
        <span className="block">{brl(n.comissao_vendedor)}</span>
        <span className="block truncate text-[11px] text-ink-3">{n.corretor ?? '—'}</span>
      </span>
    ) },
    { key: 'cashback', header: 'Cashback', align: 'right', className: 'num', render: (n) => ((n.cashback ?? 0) > 0 ? <span className="text-warn">{brl(n.cashback)}</span> : <span className="text-ink-3">—</span>) },
    {
      key: 'comissao_status', header: 'Status',
      render: (n) => (
        n.comissao_status === 'paga'
          ? <span className="block"><Badge tone="ok">paga</Badge><span className="num mt-0.5 block text-[11px] text-ink-3">{formatarData(n.comissao_paga_em, { day: '2-digit', month: '2-digit', year: '2-digit' }, '')}</span></span>
          : <Badge tone="warn">prevista</Badge>
      ),
    },
    {
      key: 'id', header: '', align: 'right',
      render: (n) => (
        podeQuitar && n.comissao_status !== 'paga' && n.status !== 'cancelado'
          ? <Button size="sm" variant="outline" loading={quitando === n.id} onClick={() => quitar(n.id)}>Quitar</Button>
          : null
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Onde os números nascem — e o aviso de que a definição precisa de confirmação */}
      <Card
        title={<span className="inline-flex items-center gap-2"><Percent size={15} strokeWidth={1.8} className="text-accent" />Taxas de comissão</span>}
      >
        <p className="mb-3 text-[12.5px] leading-snug text-ink-2">
          Estas taxas geram a comissão de cada negócio novo. Negócio já fechado guarda a
          taxa do dia em que fechou — mudar aqui não reescreve o que foi combinado.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Venda (% do valor)" className="num" value={form.percentual_venda}
            onChange={(e) => setForm({ ...form, percentual_venda: e.target.value })} />
          <Input label="Locação (% do aluguel)" className="num" value={form.percentual_locacao}
            onChange={(e) => setForm({ ...form, percentual_locacao: e.target.value })}
            hint="100 = um mês de aluguel." />
          <Input label="Parte do captador (%)" className="num" value={form.parte_captador}
            onChange={(e) => setForm({ ...form, parte_captador: e.target.value })} />
          <Input label="Parte do vendedor (%)" className="num" value={form.parte_vendedor}
            onChange={(e) => setForm({ ...form, parte_vendedor: e.target.value })}
            hint="O que sobra fica com a imobiliária." />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-3">
            Padrão de mercado: {TAXAS_PADRAO.percentual_venda}% na venda, um mês na locação,
            {' '}{TAXAS_PADRAO.parte_captador}% e {TAXAS_PADRAO.parte_vendedor}% para captador e vendedor.
          </p>
          <Button size="sm" loading={salvando} onClick={salvarTaxas}>Salvar taxas</Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Resumo titulo="Comissão prevista" valor={brl(totais.aberto)} tom="warn" />
        <Resumo titulo="Comissão paga" valor={brl(totais.pago)} tom="ok" />
        <Resumo titulo="Fica com a casa" valor={brl(totais.casa)} tom="ink" />
        <Resumo titulo="Cashback ao cliente" valor={brl(totais.cashback)} tom="ink" />
      </div>

      <Table<NegocioComissao>
        rows={lista}
        columns={colunas}
        rowKey={(n) => n.id}
        empty={
          <EmptyState
            icon={<Handshake size={20} strokeWidth={1.7} />}
            title="Nenhum negócio fechado ainda"
            description="A comissão aparece aqui quando um negócio é registrado no lead."
          />
        }
      />
    </div>
  )
}

function Resumo({ titulo, valor, tom }: { titulo: string; valor: string; tom: 'warn' | 'ok' | 'ink' }) {
  const cor = tom === 'warn' ? 'text-warn' : tom === 'ok' ? 'text-ok' : 'text-ink'
  return (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">{titulo}</div>
      <div className={`num mt-1 text-[19px] font-bold tracking-[-0.02em] ${cor}`}>{valor}</div>
    </div>
  )
}
