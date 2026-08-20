'use client'

import { useMemo, useState } from 'react'
import { Table, Badge, Button, Input, Select, Card, Modal, Textarea, EmptyState, notify, type Column } from '@/components/ui'
import { formatarData } from '@/lib/datas'
import { TAXAS_PADRAO, calcularComissaoPorPercentual, cashbackCabe, type TaxasComissao } from '@/lib/comissao-imob'
import { Handshake, Percent, Plus, Search, SlidersHorizontal } from 'lucide-react'

/**
 * Comissões e cashback — o Financeiro que a imobiliária acompanha.
 *
 * A tela segue a do CRM que o dono usa: cartões de total, pendente, pago e
 * cashback; filtros por corretor, status e tipo; e a tabela
 * "Cliente · Corretor · Tipo · Valor Negócio · % · Comissão · Cashback · Status ·
 * Data · Ações". O que ela tem a mais é o rateio (captador, vendedor, casa), que é
 * o nosso modelo, e as taxas configuráveis que geram os números.
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
  created_at: string
  percentual: number | null
  comissao_total: number | null
  comissao_captador: number | null
  comissao_vendedor: number | null
  cashback: number | null
  cashback_percentual: number | null
  comissao_status: string | null
  comissao_paga_em: string | null
  comissao_aprovada_em: string | null
  /** 'funil' = nasceu de um negócio no lead; 'manual' = lançada à mão aqui. */
  origem: string
  imovel: string | null
  cliente: string | null
  corretor: string | null
  corretor_id: string | null
  captador: string | null
}

export interface MembroEquipe { id: string; nome: string }

const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

const TONE_TIPO: Record<string, 'acc' | 'ok'> = { venda: 'acc', locacao: 'ok' }

/**
 * Os quatro estados do molde, com a palavra dele.
 *
 * "Aprovado" separa duas decisões que acontecem em dias diferentes: reconhecer que
 * a comissão é devida e pagá-la. Sem esse meio, dizer "conferi, está certo" só era
 * possível marcando como pago — e a tabela passava a afirmar que o dinheiro saiu.
 */
const STATUS_COMISSAO: { v: string; l: string; tom: 'warn' | 'acc' | 'ok' | 'neutro' }[] = [
  { v: 'pendente', l: 'Pendente', tom: 'warn' },
  { v: 'aprovada', l: 'Aprovado', tom: 'acc' },
  { v: 'paga', l: 'Pago', tom: 'ok' },
  { v: 'cancelada', l: 'Cancelado', tom: 'neutro' },
]
const rotuloStatus = (s: string | null) => STATUS_COMISSAO.find((x) => x.v === s)?.l ?? 'Pendente'
const tomStatus = (s: string | null) => STATUS_COMISSAO.find((x) => x.v === s)?.tom ?? 'warn'

const TIPOS = [{ v: 'venda', l: 'Venda' }, { v: 'locacao', l: 'Locação' }]

export function ComissoesImob({
  negocios, taxas, equipe = [], podeQuitar,
}: {
  negocios: NegocioComissao[]
  taxas: TaxasComissao
  equipe?: MembroEquipe[]
  /** Aprovar, pagar, cancelar e lançar são atos de caixa: só dono e admin (a rota confere de novo). */
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
  const [mexendo, setMexendo] = useState<number | null>(null)
  const [verTaxas, setVerTaxas] = useState(false)
  const [nova, setNova] = useState(false)

  // Filtros da tela dele: busca, corretor, status e tipo.
  const [busca, setBusca] = useState('')
  const [fCorretor, setFCorretor] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fTipo, setFTipo] = useState('')

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((n) => {
      if (fCorretor && n.corretor_id !== fCorretor) return false
      if (fStatus && (n.comissao_status ?? 'pendente') !== fStatus) return false
      if (fTipo && n.tipo !== fTipo) return false
      if (!q) return true
      return (n.cliente ?? '').toLowerCase().includes(q) || (n.imovel ?? '').toLowerCase().includes(q)
    })
  }, [lista, busca, fCorretor, fStatus, fTipo])

  /**
   * Os totais seguem o RECORTE da tela.
   *
   * Filtrar a tabela e deixar os cartões somando tudo é o erro clássico de tela de
   * dinheiro: o dono filtra um corretor, lê o total geral e cobra o valor errado.
   */
  const totais = useMemo(() => {
    const vivas = visiveis.filter((n) => n.comissao_status !== 'cancelada')
    const soma = (arr: NegocioComissao[], f: (n: NegocioComissao) => number | null) =>
      arr.reduce((s, n) => s + (Number(f(n)) || 0), 0)
    return {
      total: soma(vivas, (n) => n.comissao_total),
      registros: vivas.length,
      pendente: soma(vivas.filter((n) => (n.comissao_status ?? 'pendente') !== 'paga'), (n) => n.comissao_total),
      pago: soma(vivas.filter((n) => n.comissao_status === 'paga'), (n) => n.comissao_total),
      cashback: soma(vivas, (n) => n.cashback),
      // O que sobra para a casa: total menos as partes dos corretores e o cashback.
      casa: vivas.reduce((s, n) => s + Math.max(0,
        (Number(n.comissao_total) || 0) - (Number(n.comissao_captador) || 0)
        - (Number(n.comissao_vendedor) || 0) - (Number(n.cashback) || 0)), 0),
    }
  }, [visiveis])

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

  async function mudarStatus(id: number, comissao_status: string) {
    setMexendo(id)
    const res = await fetch('/api/imob/negocios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, comissao_status }),
    })
    const j = await res.json().catch(() => ({}))
    setMexendo(null)
    if (!res.ok) { notify.bad('Não foi possível atualizar', j?.error); return }
    const hoje = new Date()
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    setLista((l) => l.map((n) => (n.id === id ? {
      ...n,
      comissao_status,
      comissao_paga_em: comissao_status === 'paga' ? iso : null,
      comissao_aprovada_em: comissao_status === 'aprovada' ? iso : n.comissao_aprovada_em,
    } : n)))
    notify.ok(`Comissão ${rotuloStatus(comissao_status).toLowerCase()}`)
  }

  const colunas: Column<NegocioComissao>[] = [
    {
      key: 'cliente', header: 'Cliente',
      render: (n) => (
        <span className="block">
          <span className="block truncate text-[13px] font-medium text-ink">{n.cliente ?? 'sem cliente'}</span>
          <span className="block truncate text-[11.5px] text-ink-3">
            {n.imovel ?? 'sem imóvel'}
            {/* Comissão lançada à mão não tem funil por trás: dizer isso evita
                que o dono procure um negócio que nunca existiu na tela de leads. */}
            {n.origem === 'manual' && ' · lançada à mão'}
          </span>
        </span>
      ),
    },
    {
      key: 'corretor', header: 'Corretor',
      render: (n) => (
        <span className="block">
          <span className="block truncate text-[13px] text-ink">{n.corretor ?? '—'}</span>
          <span className="block truncate text-[11.5px] text-ink-3">
            {n.captador ? `captação: ${n.captador}` : 'sem captador'}
          </span>
        </span>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (n) => <Badge tone={TONE_TIPO[n.tipo] ?? 'neutro'}>{n.tipo === 'locacao' ? 'Locação' : 'Venda'}</Badge> },
    { key: 'valor', header: 'Valor Negócio', align: 'right', className: 'num', render: (n) => brl(n.valor) },
    // O percentual é POR LINHA porque cada negócio guarda a taxa do dia em que fechou.
    { key: 'percentual', header: '%', align: 'right', className: 'num', render: (n) => (n.percentual != null ? `${n.percentual}%` : '—') },
    {
      key: 'comissao_total', header: 'Comissão', align: 'right', className: 'num',
      render: (n) => (
        <span className="block">
          <span className="block font-semibold text-ink">{brl(n.comissao_total)}</span>
          {/* O rateio é o nosso a mais: quem recebe o quê, sem abrir outra tela. */}
          <span className="block text-[11px] text-ink-3">
            corretor {brl(n.comissao_vendedor)}
            {(n.comissao_captador ?? 0) > 0 && <> · capt. {brl(n.comissao_captador)}</>}
          </span>
        </span>
      ),
    },
    {
      key: 'cashback', header: 'Cashback', align: 'right', className: 'num',
      render: (n) => ((n.cashback ?? 0) > 0
        ? <span className="block">
            <span className="block text-warn">{brl(n.cashback)}</span>
            {n.cashback_percentual != null && <span className="block text-[11px] text-ink-3">{n.cashback_percentual}%</span>}
          </span>
        : <span className="text-ink-3">—</span>),
    },
    {
      key: 'comissao_status', header: 'Status',
      render: (n) => {
        const s = n.comissao_status ?? 'pendente'
        const quando = s === 'paga' ? n.comissao_paga_em : s === 'aprovada' ? n.comissao_aprovada_em : null
        return (
          <span className="block">
            <Badge tone={tomStatus(s)}>{rotuloStatus(s)}</Badge>
            {quando && <span className="num mt-0.5 block text-[11px] text-ink-3">{formatarData(quando, { day: '2-digit', month: '2-digit', year: '2-digit' }, '')}</span>}
          </span>
        )
      },
    },
    {
      key: 'assinado_em', header: 'Data', align: 'right', className: 'num',
      /** Data do negócio; sem assinatura registrada, a do lançamento. */
      render: (n) => formatarData(n.assinado_em ?? n.created_at, { day: '2-digit', month: '2-digit', year: '2-digit' }, '—'),
    },
    {
      key: 'id', header: 'Ações', align: 'right',
      render: (n) => {
        const s = n.comissao_status ?? 'pendente'
        if (!podeQuitar || s === 'cancelada' || n.status === 'cancelado') return null
        return (
          <span className="inline-flex gap-1.5">
            {s === 'pendente' && (
              <Button size="sm" variant="outline" loading={mexendo === n.id} onClick={() => mudarStatus(n.id, 'aprovada')}>Aprovar</Button>
            )}
            {s !== 'paga' && (
              <Button size="sm" loading={mexendo === n.id} onClick={() => mudarStatus(n.id, 'paga')}>Pagar</Button>
            )}
            {s !== 'paga' && (
              <Button size="sm" variant="ghost" loading={mexendo === n.id} onClick={() => mudarStatus(n.id, 'cancelada')}>Cancelar</Button>
            )}
          </span>
        )
      },
    },
  ]

  const temFiltro = !!(busca || fCorretor || fStatus || fTipo)

  return (
    <div className="space-y-4">
      {/* Cartões do molde: total, pendente, pago e cashback — mais o que fica com a casa. */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Resumo titulo="Total Comissões" valor={brl(totais.total)} tom="ink" rodape={`${totais.registros} ${totais.registros === 1 ? 'registro' : 'registros'}`} />
        <Resumo titulo="Pendente" valor={brl(totais.pendente)} tom="warn" />
        <Resumo titulo="Pago" valor={brl(totais.pago)} tom="ok" />
        <Resumo titulo="Total Cashback" valor={brl(totais.cashback)} tom="ink" />
        <Resumo titulo="Fica com a casa" valor={brl(totais.casa)} tom="ink" />
      </div>

      {/* Filtros + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[220px] flex-1">
          <Input
            icon={<Search size={15} strokeWidth={1.7} />}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou imóvel…"
          />
        </span>
        <Select aria-label="Corretor" value={fCorretor} onChange={(e) => setFCorretor(e.target.value)} className="min-w-[170px]">
          <option value="">Todos os corretores</option>
          {equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </Select>
        <Select aria-label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="min-w-[150px]">
          <option value="">Todos os status</option>
          {STATUS_COMISSAO.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </Select>
        <Select aria-label="Tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="min-w-[140px]">
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </Select>
        <Button variant="outline" icon={<SlidersHorizontal size={14} strokeWidth={1.8} />} onClick={() => setVerTaxas((v) => !v)}>
          Taxas
        </Button>
        {podeQuitar && (
          <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNova(true)}>Nova Comissão</Button>
        )}
      </div>

      {/* Onde os números nascem — recolhido, porque se mexe nele uma vez por ano. */}
      {verTaxas && (
        <Card title={<span className="inline-flex items-center gap-2"><Percent size={15} strokeWidth={1.8} className="text-accent" />Taxas de comissão</span>}>
          <p className="mb-3 text-[12.5px] leading-snug text-ink-2">
            Estas taxas geram a comissão de cada negócio novo fechado no funil. Negócio já
            fechado guarda a taxa do dia em que fechou — mudar aqui não reescreve o que foi
            combinado. Na comissão lançada à mão, o percentual é o que você digitar.
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
      )}

      <Table<NegocioComissao>
        rows={visiveis}
        columns={colunas}
        rowKey={(n) => n.id}
        empty={
          <EmptyState
            icon={<Handshake size={20} strokeWidth={1.7} />}
            title={temFiltro ? 'Nenhuma comissão neste recorte' : 'Nenhuma comissão registrada'}
            description={temFiltro
              ? 'Troque o corretor, o status ou o tipo — ou limpe a busca.'
              : 'A comissão aparece aqui quando um negócio é registrado no lead, ou quando você lança uma à mão.'}
          />
        }
      />

      {nova && (
        <NovaComissaoModal
          equipe={equipe}
          taxas={taxas}
          onClose={() => setNova(false)}
          onCriada={(n) => { setLista((l) => [n, ...l]); setNova(false) }}
        />
      )}
    </div>
  )
}

function Resumo({ titulo, valor, tom, rodape }: { titulo: string; valor: string; tom: 'warn' | 'ok' | 'ink'; rodape?: string }) {
  const cor = tom === 'warn' ? 'text-warn' : tom === 'ok' ? 'text-ok' : 'text-ink'
  return (
    <div className="rounded-card border border-line bg-card p-3">
      <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">{titulo}</div>
      <div className={`num mt-1 text-[19px] font-bold tracking-[-0.02em] ${cor}`}>{valor}</div>
      {rodape && <div className="num mt-0.5 text-[11px] text-ink-3">{rodape}</div>}
    </div>
  )
}

/**
 * Lançamento manual — os mesmos campos do CRM do dono, com a conta à vista.
 *
 * O que acrescentei: o valor da comissão, do cashback e do rateio aparecem ENQUANTO
 * se digita. No dele só se descobre o número depois de salvar, e comissão errada
 * salva é conversa desconfortável com o corretor.
 */
function NovaComissaoModal({ equipe, taxas, onClose, onCriada }: {
  equipe: MembroEquipe[]
  taxas: TaxasComissao
  onClose: () => void
  onCriada: (n: NegocioComissao) => void
}) {
  const [corretorId, setCorretorId] = useState('')
  const [captadorId, setCaptadorId] = useState('')
  const [cliente, setCliente] = useState('')
  const [imovelCodigo, setImovelCodigo] = useState('')
  const [tipo, setTipo] = useState<'venda' | 'locacao'>('venda')
  const [valor, setValor] = useState('')
  const [pct, setPct] = useState(String(taxas.percentual_venda))
  const [pctCashback, setPctCashback] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)

  const valorNum = Number(valor) || 0
  const pctNum = Number(pct) || 0
  const cashbackNum = Math.round(valorNum * ((Number(pctCashback) || 0) / 100) * 100) / 100
  const conta = calcularComissaoPorPercentual(pctNum, valorNum, taxas, cashbackNum, {
    captador: !!captadorId, vendedor: true,
  })
  const cabe = cashbackCabe(conta, cashbackNum)

  async function salvar() {
    setSalvando(true)
    const res = await fetch('/api/imob/negocios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origem: 'manual',
        corretor_id: corretorId || null,
        captador_id: captadorId || null,
        cliente_nome: cliente,
        imovel_codigo: imovelCodigo,
        tipo,
        valor: valorNum,
        percentual: pctNum,
        cashback_percentual: Number(pctCashback) || 0,
        observacoes,
      }),
    })
    const j = (await res.json().catch(() => ({}))) as { error?: string; id?: number; aviso?: string | null }
    setSalvando(false)
    if (!res.ok) { notify.bad('Não foi possível lançar', j?.error); return }
    if (j.aviso) notify.warn('Comissão lançada', j.aviso)
    else notify.ok('Comissão lançada')

    const agora = new Date().toISOString()
    onCriada({
      id: j.id!, tipo, valor: valorNum, status: 'finalizado', assinado_em: null, created_at: agora,
      percentual: conta.percentual, comissao_total: conta.total,
      comissao_captador: conta.captador, comissao_vendedor: conta.vendedor,
      cashback: cashbackNum, cashback_percentual: Number(pctCashback) || null,
      comissao_status: 'pendente', comissao_paga_em: null, comissao_aprovada_em: null,
      origem: 'manual',
      imovel: imovelCodigo.trim() || null,
      cliente: cliente.trim(),
      corretor: equipe.find((m) => m.id === corretorId)?.nome ?? null,
      corretor_id: corretorId || null,
      captador: equipe.find((m) => m.id === captadorId)?.nome ?? null,
    })
  }

  const podeSalvar = !!corretorId && !!cliente.trim() && valorNum > 0 && pctNum > 0

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="block">
          <span className="block text-[15px] font-bold text-ink">Nova Comissão</span>
          <span className="block text-[11.5px] font-normal text-ink-3">
            Para negócio que não passou pelo funil — venda antiga, contrato importado, acerto por fora
          </span>
        </span>
      }
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={salvar} loading={salvando} disabled={!podeSalvar}>Lançar comissão</Button>
      </>}
    >
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Corretor *" value={corretorId} onChange={(e) => setCorretorId(e.target.value)}>
            <option value="">Selecione…</option>
            {equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Select>
          {/*
            Captador é NOSSO campo a mais, e opcional de propósito: deixar em branco
            faz a parte da captação ficar com a casa, em vez de reservar dinheiro
            para uma pessoa que não existe naquele negócio.
          */}
          <Select label="Captador" value={captadorId} onChange={(e) => setCaptadorId(e.target.value)}>
            <option value="">Ninguém — fica com a casa</option>
            {equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nome do Cliente *" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Quem fechou o negócio" />
          <Input label="Código do Imóvel" value={imovelCodigo} onChange={(e) => setImovelCodigo(e.target.value)} placeholder="AP-1042" hint="Se o imóvel não está cadastrado, digite o código dele." />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Tipo de Negócio *" value={tipo} onChange={(e) => {
            const t = e.target.value as 'venda' | 'locacao'
            setTipo(t)
            // A taxa da loja entra como sugestão ao trocar o tipo; segue editável.
            setPct(String(t === 'locacao' ? taxas.percentual_locacao : taxas.percentual_venda))
          }}>
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Input label="Valor do Negócio (R$) *" type="number" className="num" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="350000" />
          <Input label="% Comissão *" type="number" className="num" value={pct} onChange={(e) => setPct(e.target.value)} />
          <Input label="% Cashback" type="number" className="num" value={pctCashback} onChange={(e) => setPctCashback(e.target.value)} placeholder="0" />
        </div>

        <Textarea label="Observações" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="O que explica este lançamento" />

        {/* A conta à vista, antes de salvar. */}
        <div className="rounded-control border border-line bg-bg p-3">
          <div className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
            <Linha rotulo="Comissão" valor={brl(conta.total)} forte />
            <Linha rotulo="Corretor" valor={brl(conta.vendedor)} />
            <Linha rotulo="Captação" valor={brl(conta.captador)} />
            <Linha rotulo="Fica com a casa" valor={brl(conta.casa)} />
          </div>
          {cashbackNum > 0 && (
            <p className={`mt-2 text-[11.5px] ${cabe ? 'text-ink-3' : 'text-warn'}`}>
              Cashback ao cliente: <strong className="num">{brl(cashbackNum)}</strong>
              {cabe
                ? ' — sai da parte da casa.'
                : ' — é maior que a parte da casa neste negócio; a casa fica em zero.'}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-ink-3">
            Entra como <strong>Pendente</strong>. Aprovar e pagar são dois cliques depois, na tabela.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <span className="block">
      <span className="block text-[11px] uppercase tracking-[0.04em] text-ink-3">{rotulo}</span>
      <span className={`num block ${forte ? 'text-[15px] font-bold text-ink' : 'text-[13px] text-ink-2'}`}>{valor}</span>
    </span>
  )
}
