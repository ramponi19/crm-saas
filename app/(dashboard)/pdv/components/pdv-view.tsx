'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ScanBarcode, Plus, Minus, ChevronDown, UserPlus, CheckCircle2, QrCode, Copy, Check, Send,
  Package, Banknote, Zap, CreditCard, Link2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn, formatCurrency } from '@/lib/utils'
import { Modal, Input, Button, notify } from '@/components/ui'

interface ItemEstoque {
  id: number; produto_id: number; produto_nome: string; marca_nome: string
  imei: string | null; numero_serie: string | null; cor: string | null
  armazenamento: string | null; bateria: string | null; condicao: string | null
  estado: string | null; preco_custo: number | null; preco_venda: number | null; status: string
}
interface ClienteSimples { id: number; nome: string; telefone: string | null; cpf_cnpj: string | null }
interface Taxa { id: number; forma_pagamento: string; bandeira: string | null; parcelas: number | null; percentual_taxa: number | null }
interface VendaRecente { id: number; valor_venda: number; lucro: number | null; forma_pagamento: string | null; data_venda: string; status: string | null; cliente_nome: string; produto_nome: string }
interface CobrancaPix { qr_code: string | null; qr_code_base64: string | null; linha_digitavel: string | null; link_pagamento: string | null }
interface Props { itensDisponiveis: ItemEstoque[]; clientes: ClienteSimples[]; taxas: Taxa[]; vendasRecentes: VendaRecente[] }
interface ItemCarrinho { item: ItemEstoque; desconto: number }

const FORMAS_PAG: { key: string; label: string; icon: typeof Banknote }[] = [
  { key: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { key: 'pix', label: 'PIX', icon: Zap },
  { key: 'debito', label: 'Débito', icon: CreditCard },
  { key: 'credito', label: 'Crédito', icon: CreditCard },
  { key: 'link', label: 'Link', icon: Link2 },
]

const getInitials = (nome: string) => nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
const fmt = (v: number) => formatCurrency(v)

export default function PDVView({ itensDisponiveis, clientes, taxas }: Props) {
  const supabase = createClient()
  const router = useRouter()

  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteSimples | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [showClientes, setShowClientes] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState('dinheiro')
  const [parcelas, setParcelas] = useState(1)
  const [bandeira, setBandeira] = useState<'visa_master' | 'outros'>('visa_master')
  const [desconto, setDesconto] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  const [pixCobranca, setPixCobranca] = useState<CobrancaPix | null>(null)
  const [pixCopiado, setPixCopiado] = useState(false)
  const [enviandoWpp, setEnviandoWpp] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowClientes(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowClientes(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const itensFiltrados = useMemo(() => {
    if (!busca) return itensDisponiveis
    const q = busca.toLowerCase()
    return itensDisponiveis.filter((i) =>
      i.produto_nome.toLowerCase().includes(q) || i.marca_nome.toLowerCase().includes(q) ||
      (i.imei ?? '').includes(q) || (i.cor ?? '').toLowerCase().includes(q) ||
      (i.armazenamento ?? '').toLowerCase().includes(q),
    )
  }, [itensDisponiveis, busca])

  const clientesFiltrados = useMemo(() => {
    const base = buscaCliente
      ? clientes.filter((c) => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || (c.telefone ?? '').includes(buscaCliente))
      : clientes
    return base.slice(0, 8)
  }, [clientes, buscaCliente])

  function adicionarItem(item: ItemEstoque) {
    if (carrinho.some((c) => c.item.id === item.id)) { notify.warn('Item já está no carrinho'); return }
    setCarrinho((prev) => [...prev, { item, desconto: 0 }])
  }
  function removerItem(id: number) { setCarrinho((prev) => prev.filter((c) => c.item.id !== id)) }

  const descontoNum = parseFloat(desconto.replace(',', '.')) || 0

  const totais = useMemo(() => {
    const subtotal = carrinho.reduce((a, c) => a + (c.item.preco_venda ?? 0), 0)
    const total = Math.max(0, subtotal - descontoNum)
    const custo = carrinho.reduce((a, c) => a + (c.item.preco_custo ?? 0), 0)
    let totalComTaxa = total
    if (formaPagamento === 'credito' || formaPagamento === 'link') {
      const fpBanco = formaPagamento === 'credito' ? 'maquininha' : 'link'
      const taxa = taxas.find((t) =>
        t.forma_pagamento === fpBanco && t.parcelas === parcelas &&
        (fpBanco === 'link' || t.bandeira === bandeira),
      )
      if (taxa?.percentual_taxa) totalComTaxa = total * (1 + Number(taxa.percentual_taxa) / 100)
    }
    const taxaPct = totalComTaxa > total ? ((totalComTaxa - total) / total * 100) : 0
    return { subtotal, total, totalComTaxa, custo, lucro: total - custo, taxaPct }
  }, [carrinho, descontoNum, formaPagamento, parcelas, bandeira, taxas])

  const parcelasOpts = useMemo(() => {
    const fp = formaPagamento === 'credito' ? 'maquininha' : 'link'
    return taxas
      .filter((t) => t.forma_pagamento === fp && (fp === 'link' || t.bandeira === bandeira))
      .sort((a, b) => (a.parcelas ?? 0) - (b.parcelas ?? 0))
      .map((t) => t.parcelas!)
      .filter(Boolean)
  }, [taxas, formaPagamento, bandeira])

  async function finalizarVenda() {
    if (carrinho.length === 0) { notify.warn('Carrinho vazio'); return }
    const subtotalBruto = carrinho.reduce((s, c) => s + (c.item.preco_venda ?? 0), 0)
    if (descontoNum < 0) { notify.warn('Desconto não pode ser negativo'); return }
    if (descontoNum > subtotalBruto) { notify.warn('Desconto maior que o valor total'); return }
    setFinalizando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      const { data: vinculo } = await supabase
        .from('empresa_usuarios').select('empresa_id')
        .eq('usuario_id', user.id).eq('ativo', true).single()

      if (!vinculo) throw new Error('Empresa não encontrada')
      const empresaId = vinculo.empresa_id

      const totalBruto = carrinho.reduce((s, c) => s + (c.item.preco_venda ?? 0), 0)
      let primeiraVendaId: number | null = null
      for (const c of carrinho) {
        const precoCheio = c.item.preco_venda ?? 0
        const descontoItem = totalBruto > 0 ? descontoNum * (precoCheio / totalBruto) : 0
        const valorItem = precoCheio - descontoItem

        const { data: claimed } = await supabase
          .from('inventario_unidades')
          .update({ status: 'vendido', cliente_id: clienteSelecionado?.id ?? null })
          .eq('id', c.item.id)
          .eq('status', 'disponivel')
          .select('id')
          .single()
        if (!claimed) throw new Error(`"${c.item.produto_nome}" não está mais disponível`)

        const taxaMultiplier = totais.total > 0 ? totais.totalComTaxa / totais.total : 1
        const valorItemComTaxa = valorItem * taxaMultiplier

        const { data: venda, error } = await supabase
          .from('vendas')
          .insert({
            empresa_id: empresaId,
            cliente_id: clienteSelecionado?.id ?? null,
            vendedor_id: user.id,
            usuario_id: user.id,
            valor_venda: valorItem,
            valor_custo: c.item.preco_custo ?? 0,
            lucro: valorItem - (c.item.preco_custo ?? 0),
            forma_pagamento: formaPagamento,
            parcelas: ['credito', 'link'].includes(formaPagamento) ? parcelas : null,
            canal_venda: 'loja_fisica',
            desconto_valor: descontoItem,
            produto_id: c.item.produto_id,
            numero_serie: c.item.imei ?? c.item.numero_serie,
            status: 'concluida',
            data_venda: new Date().toISOString(),
          })
          .select().single()
        if (error) throw new Error(error.message)
        if (primeiraVendaId === null) primeiraVendaId = venda.id
        await supabase.from('vendas_pagamentos').insert({
          empresa_id: empresaId,
          venda_id: venda.id, forma_pagamento: formaPagamento,
          valor_pago: valorItem,
          bandeira_cartao: formaPagamento === 'credito' ? bandeira : null,
          parcelas: ['credito', 'link'].includes(formaPagamento) ? parcelas : null,
          valor_com_juros: totais.totalComTaxa !== totais.total ? valorItemComTaxa : null,
        })
      }
      if (formaPagamento === 'pix' && totais.total > 0) {
        try {
          const res = await fetch('/api/payments/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'pix',
              valor: totais.total,
              vendaId: primeiraVendaId,
              descricao: `Venda PDV`,
              pagador: clienteSelecionado ? { nome: clienteSelecionado.nome, telefone: clienteSelecionado.telefone ?? undefined } : undefined,
            }),
          })
          const json = await res.json()
          if (res.ok && json.cobranca) setPixCobranca(json.cobranca)
        } catch { /* não bloqueia a venda */ }
      }

      notify.ok('Venda finalizada')
      setCarrinho([]); setDesconto(''); setParcelas(1)
      if (formaPagamento !== 'pix') setClienteSelecionado(null)
      router.refresh()
    } catch (e) {
      notify.bad('Erro ao finalizar', e instanceof Error ? e.message : String(e))
    } finally {
      setFinalizando(false)
    }
  }

  async function copiarPix() {
    const txt = pixCobranca?.linha_digitavel ?? pixCobranca?.qr_code ?? ''
    if (!txt) return
    await navigator.clipboard.writeText(txt)
    setPixCopiado(true)
    setTimeout(() => setPixCopiado(false), 2000)
  }

  async function enviarWhatsApp() {
    if (!clienteSelecionado?.telefone || !pixCobranca) return
    setEnviandoWpp(true)
    const chave = pixCobranca.linha_digitavel ?? pixCobranca.qr_code ?? pixCobranca.link_pagamento ?? ''
    const msg = `Olá ${clienteSelecionado.nome}! Segue o Pix para pagamento da sua compra no valor de *${fmt(totais.total)}*:\n\n${chave}`
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: clienteSelecionado.telefone, message: msg }),
      })
      if (!res.ok) throw new Error()
      notify.ok('WhatsApp enviado')
    } catch { notify.bad('Erro ao enviar WhatsApp') }
    finally { setEnviandoWpp(false) }
  }

  const isCartaoOuLink = formaPagamento === 'credito' || formaPagamento === 'link'

  return (
    <>
      <Modal
        open={!!pixCobranca}
        onClose={() => { setPixCobranca(null); setClienteSelecionado(null) }}
        size="sm"
        title={<span className="flex items-center gap-2"><QrCode size={17} strokeWidth={1.7} className="text-ok" /> Pix gerado</span>}
      >
        <div className="space-y-4">
          <div className="rounded-card border border-ok/20 bg-ok-soft p-4 text-center">
            <p className="text-[11px] text-ink-3">Valor a pagar</p>
            <p className="num text-[26px] font-bold tracking-[-0.035em] text-ink">{fmt(totais.total)}</p>
          </div>
          {pixCobranca?.qr_code_base64 && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${pixCobranca.qr_code_base64}`} alt="QR Code Pix" className="h-44 w-44 rounded-[10px]" />
            </div>
          )}
          {(pixCobranca?.linha_digitavel ?? pixCobranca?.qr_code) && (
            <div className="flex items-end gap-2">
              <Input wrapperClassName="flex-1" readOnly value={pixCobranca?.linha_digitavel ?? pixCobranca?.qr_code ?? ''} className="num text-[11px]" />
              <Button variant="outline" onClick={copiarPix} icon={pixCopiado ? <Check size={14} strokeWidth={1.7} className="text-ok" /> : <Copy size={14} strokeWidth={1.7} />}>
                {pixCopiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          )}
          {clienteSelecionado?.telefone && (
            <Button variant="outline" className="w-full" loading={enviandoWpp} onClick={enviarWhatsApp} icon={<Send size={14} strokeWidth={1.7} />}>
              Enviar via WhatsApp para {clienteSelecionado.nome}
            </Button>
          )}
        </div>
      </Modal>

      <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
        <div className="mx-auto grid max-w-[1320px] items-start gap-5" style={{ gridTemplateColumns: '1.55fr 1fr' }}>

          {/* ── ESQUERDA: catálogo ── */}
          <div>
            <div className="mb-4">
              <Input
                icon={<ScanBarcode size={17} strokeWidth={1.7} />}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Escaneie o código de barras ou busque um produto…"
                className="h-11 text-[14px]"
              />
            </div>

            {itensFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-ink-3">
                <ScanBarcode size={38} strokeWidth={1.5} className="mb-3 opacity-40" />
                <p className="text-[13px]">Nenhum produto disponível no estoque</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3.5">
                {itensFiltrados.map((item) => {
                  const noCarrinho = carrinho.some((c) => c.item.id === item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={noCarrinho}
                      onClick={() => !noCarrinho && adicionarItem(item)}
                      className={cn(
                        'rounded-card border bg-card p-4 text-left transition-all',
                        noCarrinho ? 'cursor-default border-line opacity-60' : 'border-line hover:border-accent hover:shadow-[0_4px_12px_-6px_rgba(46,92,230,0.25)]',
                      )}
                    >
                      <div className="mb-3 grid h-11 w-11 place-items-center rounded-control bg-ink/[0.04] text-ink-3">
                        <Package size={20} strokeWidth={1.7} />
                      </div>
                      <div className="min-h-[36px] text-[13px] font-semibold leading-[1.3] text-ink">
                        {item.produto_nome}
                        {item.armazenamento && <span className="text-ink-3"> · {item.armazenamento}</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-3">
                        {item.cor ?? item.marca_nome}{item.bateria ? ` · bateria ${item.bateria}%` : ''}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="num text-[16px] font-bold text-ink">{fmt(item.preco_venda ?? 0)}</span>
                        <span className={cn('grid h-8 w-8 place-items-center rounded-control', noCarrinho ? 'bg-ok-soft text-ok' : 'bg-ink text-white')}>
                          {noCarrinho ? <CheckCircle2 size={17} strokeWidth={1.7} /> : <Plus size={18} strokeWidth={1.7} />}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── DIREITA: carrinho ── */}
          <div className="sticky top-5 rounded-card border border-line bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Carrinho</h3>
              <span className="num text-[11px] text-ink-3">{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</span>
            </div>

            {/* Seletor de cliente */}
            <div className="relative mb-4" ref={dropRef}>
              <button
                type="button"
                onClick={() => setShowClientes(!showClientes)}
                className="flex w-full items-center gap-3 rounded-control border border-line bg-card p-2.5 text-left transition-colors hover:bg-bg"
              >
                <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink text-[12px] font-bold text-white">
                  {clienteSelecionado ? getInitials(clienteSelecionado.nome) : '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{clienteSelecionado?.nome ?? 'Selecionar cliente'}</span>
                  <span className="block text-[11px] text-ink-3">{clienteSelecionado?.telefone ?? 'Toque para buscar'}</span>
                </span>
                <ChevronDown size={17} strokeWidth={1.7} className={cn('text-ink-3 transition-transform', showClientes && 'rotate-180')} />
              </button>

              {showClientes && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[300px] overflow-y-auto rounded-card border border-line bg-card p-1.5 shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)] scrollbar-thin">
                  <div className="p-1 pb-2">
                    <Input value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} placeholder="Buscar cliente pelo nome…" autoFocus />
                  </div>
                  <button
                    type="button"
                    onClick={() => { notify.info('Cadastro rápido em breve'); setShowClientes(false) }}
                    className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-ink transition-colors hover:bg-ink/[0.04]"
                  >
                    <UserPlus size={17} strokeWidth={1.7} />
                    <span className="text-[12.5px] font-semibold">Cadastrar novo cliente</span>
                  </button>
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setClienteSelecionado(c); setBuscaCliente(''); setShowClientes(false) }}
                      className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-ink/[0.04]"
                    >
                      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-control bg-ink text-[11px] font-bold text-white">
                        {getInitials(c.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-ink">{c.nome}</span>
                        {c.telefone && <span className="block text-[10.5px] text-ink-3">{c.telefone}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Itens */}
            <div className="mb-4 flex min-h-[48px] flex-col gap-3">
              {carrinho.length === 0 ? (
                <div className="py-4 text-center text-[13px] text-ink-3">Carrinho vazio — toque num produto para adicionar.</div>
              ) : carrinho.map(({ item }) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink/[0.04] text-ink-3">
                    <Package size={17} strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{item.produto_nome}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <button type="button" onClick={() => removerItem(item.id)} className="grid h-[22px] w-[22px] place-items-center rounded-[6px] border border-line text-ink transition-colors hover:bg-ink/[0.04]">
                        <Minus size={13} strokeWidth={1.7} />
                      </button>
                      <span className="num text-[12.5px] font-bold text-ink">1</span>
                      <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] border border-line text-ink-3 opacity-40">
                        <Plus size={13} strokeWidth={1.7} />
                      </span>
                    </div>
                  </div>
                  <div className="num text-[13px] font-bold text-ink">{fmt(item.preco_venda ?? 0)}</div>
                </div>
              ))}
            </div>

            {/* Subtotal + desconto + total */}
            <div className="mb-4 rounded-card border border-line bg-raised p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[13px] text-ink-2">Subtotal</span>
                <span className="num text-[13px] font-semibold text-ink">{fmt(totais.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink-2">Desconto</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] text-ink-2">− R$</span>
                  <input
                    value={desconto}
                    onChange={(e) => setDesconto(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0"
                    className="num w-[66px] rounded-[6px] border border-line bg-card px-2 py-1 text-right text-[13px] font-bold text-ink outline-none focus:border-bad focus:ring-2 focus:ring-bad/20"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-line-soft pt-3">
                <span className="text-[14px] font-semibold text-ink">Total</span>
                <span className="num text-[28px] font-bold leading-none tracking-[-0.035em] text-ink">{fmt(totais.total)}</span>
              </div>
            </div>

            {/* Forma de pagamento */}
            <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Forma de pagamento</div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {FORMAS_PAG.map((pg) => {
                const ativo = formaPagamento === pg.key
                const Icon = pg.icon
                return (
                  <button
                    key={pg.key}
                    type="button"
                    onClick={() => { setFormaPagamento(pg.key); setParcelas(1) }}
                    className={cn(
                      'flex items-center gap-2.5 rounded-control border px-3 py-2.5 transition-all',
                      ativo ? 'border-ink/30 bg-ink/[0.05] text-ink' : 'border-line text-ink-2 hover:bg-ink/[0.03]',
                    )}
                  >
                    <Icon size={17} strokeWidth={1.7} />
                    <span className="text-[13px] font-semibold">{pg.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Parcelas */}
            {isCartaoOuLink && (
              <div className="mb-4">
                {formaPagamento === 'credito' && (
                  <div className="mb-3 flex gap-2">
                    {(['visa_master', 'outros'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBandeira(b)}
                        className={cn('flex-1 rounded-control border py-1.5 text-[11px] font-medium transition-all',
                          bandeira === b ? 'border-ink/30 bg-ink/[0.05] text-ink' : 'border-line text-ink-2 hover:bg-ink/[0.03]')}
                      >
                        {b === 'visa_master' ? 'Visa / Master' : 'Outros'}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Parcelas</div>
                <div className="grid grid-cols-6 gap-1.5">
                  {(parcelasOpts.length > 0 ? parcelasOpts : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setParcelas(p)}
                      className={cn('num rounded-control border py-2 text-center text-[13px] font-bold transition-all',
                        parcelas === p ? 'border-ink/30 bg-ink/[0.05] text-ink' : 'border-line text-ink-2 hover:bg-ink/[0.03]')}
                    >
                      {p}x
                    </button>
                  ))}
                </div>
                {totais.total > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-control border border-line bg-raised p-3">
                    <div>
                      <div className="text-[11px] text-ink-3">{parcelas}x de</div>
                      <div className="num text-[16px] font-bold text-ink">{fmt(totais.totalComTaxa / parcelas)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-ink-3">com juros · {totais.taxaPct.toFixed(2)}%</div>
                      <div className="num text-[16px] font-bold text-ink">{fmt(totais.totalComTaxa)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button
              size="lg"
              className="w-full"
              loading={finalizando}
              disabled={carrinho.length === 0}
              onClick={finalizarVenda}
              icon={!finalizando ? <CheckCircle2 size={19} strokeWidth={1.7} /> : undefined}
            >
              {finalizando ? 'Finalizando…' : `Finalizar venda · ${fmt(totais.totalComTaxa || totais.total)}`}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
