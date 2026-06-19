'use client'

import { useState, useMemo, useRef } from 'react'
import { Search, ShoppingCart, X, Plus, Minus, Check, ChevronRight, Clock, TrendingUp, DollarSign, Package, User, CreditCard, Banknote, Smartphone, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface ItemEstoque {
  id: number
  produto_id: number
  produto_nome: string
  marca_nome: string
  imei: string | null
  numero_serie: string | null
  cor: string | null
  armazenamento: string | null
  bateria: string | null
  condicao: string | null
  estado: string | null
  preco_custo: number | null
  preco_venda: number | null
  status: string
}

interface ClienteSimples {
  id: number
  nome: string
  telefone: string | null
  cpf_cnpj: string | null
}

interface Taxa {
  id: number
  forma_pagamento: string
  bandeira: string | null
  parcelas: number | null
  percentual_taxa: number | null
}

interface VendaRecente {
  id: number
  valor_venda: number
  lucro: number | null
  forma_pagamento: string | null
  data_venda: string
  status: string | null
  cliente_nome: string
  produto_nome: string
}

interface Props {
  itensDisponiveis: ItemEstoque[]
  clientes: ClienteSimples[]
  taxas: Taxa[]
  vendasRecentes: VendaRecente[]
}

interface ItemCarrinho {
  item: ItemEstoque
  desconto: number
}

const FORMAS_PAGAMENTO = [
  { key: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { key: 'pix', label: 'PIX', icon: Smartphone },
  { key: 'debito', label: 'Débito', icon: CreditCard },
  { key: 'credito', label: 'Crédito', icon: CreditCard },
]

export default function PDVView({ itensDisponiveis, clientes, taxas, vendasRecentes }: Props) {
  const supabase = createClient()
  const router = useRouter()

  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteSimples | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [showClientes, setShowClientes] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState<string>('dinheiro')
  const [parcelas, setParcelas] = useState(1)
  const [bandeira, setBandeira] = useState('')
  const [desconto, setDesconto] = useState(0)
  const [descontoMotivo, setDescontoMotivo] = useState('')
  const [canal, setCanal] = useState('loja')
  const [finalizando, setFinalizando] = useState(false)
  const [tab, setTab] = useState<'pdv' | 'historico'>('pdv')

  const itensFiltrados = useMemo(() => {
    if (!busca) return itensDisponiveis
    const q = busca.toLowerCase()
    return itensDisponiveis.filter(i =>
      i.produto_nome.toLowerCase().includes(q) ||
      i.marca_nome.toLowerCase().includes(q) ||
      (i.imei ?? '').includes(q) ||
      (i.cor ?? '').toLowerCase().includes(q) ||
      (i.armazenamento ?? '').toLowerCase().includes(q)
    )
  }, [itensDisponiveis, busca])

  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente) return clientes.slice(0, 8)
    const q = buscaCliente.toLowerCase()
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.telefone ?? '').includes(q) ||
      (c.cpf_cnpj ?? '').includes(q)
    ).slice(0, 8)
  }, [clientes, buscaCliente])

  function adicionarItem(item: ItemEstoque) {
    if (carrinho.some(c => c.item.id === item.id)) {
      toast.error('Item já está no carrinho')
      return
    }
    setCarrinho(prev => [...prev, { item, desconto: 0 }])
    toast.success(`${item.produto_nome} adicionado`)
  }

  function removerItem(id: number) {
    setCarrinho(prev => prev.filter(c => c.item.id !== id))
  }

  function setDescontoItem(id: number, val: number) {
    setCarrinho(prev => prev.map(c => c.item.id === id ? { ...c, desconto: val } : c))
  }

  const totais = useMemo(() => {
    const subtotal = carrinho.reduce((acc, c) => acc + (c.item.preco_venda ?? 0), 0)
    const descontoItens = carrinho.reduce((acc, c) => acc + c.desconto, 0)
    const descontoGeral = desconto
    const totalDescontos = descontoItens + descontoGeral
    const valorFinal = Math.max(0, subtotal - totalDescontos)
    const custo = carrinho.reduce((acc, c) => acc + (c.item.preco_custo ?? 0), 0)
    const lucro = valorFinal - custo

    // Taxa
    let valorComTaxa = valorFinal
    if (formaPagamento === 'credito') {
      const taxa = taxas.find(t =>
        t.forma_pagamento === 'credito' &&
        t.parcelas === parcelas &&
        (bandeira ? t.bandeira === bandeira : true)
      )
      if (taxa?.percentual_taxa) {
        valorComTaxa = valorFinal * (1 + Number(taxa.percentual_taxa) / 100)
      }
    }

    return { subtotal, descontoItens, descontoGeral, totalDescontos, valorFinal, valorComTaxa, custo, lucro }
  }, [carrinho, desconto, formaPagamento, parcelas, bandeira, taxas])

  async function finalizarVenda() {
    if (carrinho.length === 0) { toast.error('Carrinho vazio'); return }
    setFinalizando(true)

    try {
      for (const c of carrinho) {
        const valorItem = (c.item.preco_venda ?? 0) - c.desconto
        const custoItem = c.item.preco_custo ?? 0

        // Inserir venda
        const { data: venda, error: vendaErr } = await supabase
          .from('vendas')
          .insert({
            cliente_id: clienteSelecionado?.id ?? null,
            valor_venda: valorItem,
            valor_custo: custoItem,
            lucro: valorItem - custoItem,
            forma_pagamento: formaPagamento,
            parcelas: formaPagamento === 'credito' ? parcelas : null,
            canal_venda: canal,
            desconto_valor: c.desconto + (carrinho.length === 1 ? desconto : 0),
            desconto_motivo: descontoMotivo || null,
            produto_id: c.item.produto_id,
            numero_serie: c.item.imei ?? c.item.numero_serie,
            status: 'concluida',
            data_venda: new Date().toISOString(),
          })
          .select()
          .single()

        if (vendaErr) throw new Error(vendaErr.message)

        // Inserir pagamento
        await supabase.from('vendas_pagamentos').insert({
          venda_id: venda.id,
          forma_pagamento: formaPagamento,
          valor_pago: valorItem,
          bandeira_cartao: bandeira || null,
          parcelas: formaPagamento === 'credito' ? parcelas : null,
          valor_com_juros: totais.valorComTaxa !== totais.valorFinal ? totais.valorComTaxa : null,
        })

        // Atualizar status do estoque
        await supabase
          .from('inventario_unidades')
          .update({ status: 'vendido', cliente_id: clienteSelecionado?.id ?? null })
          .eq('id', c.item.id)
      }

      toast.success('Venda finalizada com sucesso!')
      setCarrinho([])
      setClienteSelecionado(null)
      setDesconto(0)
      setDescontoMotivo('')
      router.refresh()
    } catch (e: any) {
      toast.error('Erro ao finalizar: ' + e.message)
    } finally {
      setFinalizando(false)
    }
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtData = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="flex h-full bg-[#0A111E] overflow-hidden">

      {/* ESQUERDA — Catálogo + Histórico */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-white/[0.06]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-1 bg-[#0D1824] border border-white/[0.06] rounded-[10px] p-1">
            {[
              { key: 'pdv', label: 'PDV' },
              { key: 'historico', label: 'Histórico' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as typeof tab)}
                className={cn(
                  'px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all',
                  tab === t.key ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]' : 'text-[#5C6E84] hover:text-[#8A9BB0]'
                )}
              >{t.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#5C6E84]">
            <Package size={15} />
            <span>{itensDisponiveis.length} itens disponíveis</span>
          </div>
        </div>

        {tab === 'pdv' ? (
          <>
            {/* Busca */}
            <div className="px-6 py-4 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3F516A]" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto, modelo, IMEI..."
                  className="w-full bg-[#0D1824] border border-white/[0.06] rounded-[10px] pl-9 pr-4 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
                />
              </div>
            </div>

            {/* Grid de produtos */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {itensFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#3F516A]">
                  <Package size={40} className="mb-3 opacity-40" />
                  <p className="text-sm">Nenhum item disponível</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {itensFiltrados.map(item => (
                    <button
                      key={item.id}
                      onClick={() => adicionarItem(item)}
                      disabled={carrinho.some(c => c.item.id === item.id)}
                      className={cn(
                        'text-left bg-[#0D1824] border rounded-[14px] p-4 transition-all group',
                        carrinho.some(c => c.item.id === item.id)
                          ? 'border-[rgba(215,40,47,0.3)] opacity-60 cursor-default'
                          : 'border-white/[0.06] hover:border-white/[0.15] hover:bg-[#111D2C] cursor-pointer'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-[10px] font-mono text-[#5C6E84]">{item.marca_nome}</div>
                        {carrinho.some(c => c.item.id === item.id) && (
                          <div className="w-5 h-5 rounded-full bg-[#D7282F] flex items-center justify-center">
                            <Check size={11} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="font-semibold text-sm text-[#E9EEF4] mb-2 leading-tight">{item.produto_nome}</div>
                      <div className="text-xs text-[#5C6E84] mb-3">
                        {[item.cor, item.armazenamento].filter(Boolean).join(' · ') || '—'}
                      </div>
                      {item.imei && (
                        <div className="font-mono text-[10px] text-[#3F516A] mb-2 truncate">{item.imei}</div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-[#F4F6F9]">{fmt(item.preco_venda ?? 0)}</span>
                        {item.bateria && (
                          <span className={cn('text-[10px] font-mono', Number(item.bateria) < 80 ? 'text-[#F59E0B]' : 'text-[#22C55E]')}>
                            🔋 {item.bateria}%
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          // Histórico
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              {vendasRecentes.length === 0 ? (
                <p className="text-center text-[#3F516A] text-sm py-12">Nenhuma venda registrada</p>
              ) : vendasRecentes.map(v => (
                <div key={v.id} className="bg-[#0D1824] border border-white/[0.06] rounded-[12px] px-4 py-3 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-[10px] bg-[rgba(34,197,94,0.1)] flex items-center justify-center shrink-0">
                    <Check size={16} className="text-[#22C55E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#E9EEF4] truncate">{v.produto_nome}</div>
                    <div className="text-xs text-[#5C6E84]">{v.cliente_nome} · {fmtData(v.data_venda)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#F4F6F9]">{fmt(v.valor_venda)}</div>
                    {v.lucro !== null && (
                      <div className={cn('text-xs', v.lucro >= 0 ? 'text-[#22C55E]' : 'text-[#F0353D]')}>
                        {v.lucro >= 0 ? '+' : ''}{fmt(v.lucro)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DIREITA — Carrinho */}
      <div className="w-[380px] shrink-0 flex flex-col bg-[#0A111E]">

        {/* Header carrinho */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/[0.06] shrink-0">
          <ShoppingCart size={18} className="text-[#5C6E84]" />
          <span className="font-bold text-[#F4F6F9] text-sm">Carrinho</span>
          {carrinho.length > 0 && (
            <span className="ml-auto font-mono text-xs text-[#F0353D] bg-[rgba(215,40,47,0.14)] px-2 py-0.5 rounded-full">
              {carrinho.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Items */}
          {carrinho.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#3F516A]">
              <ShoppingCart size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs mt-1">Selecione itens à esquerda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {carrinho.map(({ item, desconto: desc }) => (
                <div key={item.id} className="bg-[#0D1824] border border-white/[0.06] rounded-[12px] p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#E9EEF4] truncate">{item.produto_nome}</div>
                      <div className="text-xs text-[#5C6E84]">{[item.cor, item.armazenamento].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button onClick={() => removerItem(item.id)} className="text-[#3F516A] hover:text-[#F0353D] ml-2 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-[#F4F6F9]">{fmt((item.preco_venda ?? 0) - desc)}</span>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-[#3F516A]">desc R$</label>
                      <input
                        type="number"
                        value={desc || ''}
                        onChange={e => setDescontoItem(item.id, Number(e.target.value) || 0)}
                        className="w-20 bg-[#0A111E] border border-white/[0.08] rounded-[7px] px-2 py-1 text-xs text-[#D4DEEA] outline-none text-right"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cliente */}
          <div>
            <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Cliente</label>
            <div className="relative">
              {clienteSelecionado ? (
                <div className="flex items-center gap-2 bg-[#0D1824] border border-white/[0.08] rounded-[10px] px-3 py-2.5">
                  <User size={14} className="text-[#6B8CFF] shrink-0" />
                  <span className="text-sm text-[#D4DEEA] flex-1">{clienteSelecionado.nome}</span>
                  <button onClick={() => setClienteSelecionado(null)} className="text-[#3F516A] hover:text-[#F0353D]">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    value={buscaCliente}
                    onChange={e => { setBuscaCliente(e.target.value); setShowClientes(true) }}
                    onFocus={() => setShowClientes(true)}
                    placeholder="Buscar cliente..."
                    className="w-full bg-[#0D1824] border border-white/[0.08] rounded-[10px] px-3 py-2.5 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-white/[0.15]"
                  />
                  {showClientes && clientesFiltrados.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#111D2C] border border-white/[0.1] rounded-[10px] overflow-hidden z-10 shadow-xl">
                      {clientesFiltrados.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={() => { setClienteSelecionado(c); setBuscaCliente(''); setShowClientes(false) }}
                          className="w-full text-left px-3 py-2.5 hover:bg-white/[0.05] border-b border-white/[0.04] last:border-0"
                        >
                          <div className="text-sm text-[#D4DEEA]">{c.nome}</div>
                          {c.telefone && <div className="text-xs text-[#5C6E84]">{c.telefone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-1.5">
              {FORMAS_PAGAMENTO.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFormaPagamento(f.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-[9px] text-sm transition-all border',
                    formaPagamento === f.key
                      ? 'border-[rgba(215,40,47,0.4)] bg-[rgba(215,40,47,0.1)] text-[#F0353D]'
                      : 'border-white/[0.06] text-[#5C6E84] hover:text-[#8A9BB0]'
                  )}
                >
                  <f.icon size={14} />
                  {f.label}
                </button>
              ))}
            </div>

            {formaPagamento === 'credito' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="block text-[10px] text-[#5C6E84] mb-1">Bandeira</label>
                  <select
                    value={bandeira}
                    onChange={e => setBandeira(e.target.value)}
                    className="w-full bg-[#0D1824] border border-white/[0.08] rounded-[9px] px-2 py-2 text-xs text-[#D4DEEA] outline-none"
                  >
                    <option value="">Qualquer</option>
                    {['Visa', 'Master', 'Elo', 'Amex'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[#5C6E84] mb-1">Parcelas</label>
                  <select
                    value={parcelas}
                    onChange={e => setParcelas(Number(e.target.value))}
                    className="w-full bg-[#0D1824] border border-white/[0.08] rounded-[9px] px-2 py-2 text-xs text-[#D4DEEA] outline-none"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(p => (
                      <option key={p} value={p}>{p}x</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Canal e Desconto geral */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Canal</label>
              <select
                value={canal}
                onChange={e => setCanal(e.target.value)}
                className="w-full bg-[#0D1824] border border-white/[0.08] rounded-[9px] px-2 py-2.5 text-xs text-[#D4DEEA] outline-none"
              >
                {['loja', 'instagram', 'whatsapp', 'mercadolivre', 'online'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#5C6E84] uppercase tracking-[0.1em] mb-1.5">Desc. geral R$</label>
              <input
                type="number"
                value={desconto || ''}
                onChange={e => setDesconto(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-[#0D1824] border border-white/[0.08] rounded-[9px] px-2 py-2.5 text-xs text-[#D4DEEA] placeholder:text-[#3F516A] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Totais + Botão */}
        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 space-y-2">
          {totais.totalDescontos > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-[#5C6E84]">Desconto total</span>
              <span className="text-[#F0353D]">- {fmt(totais.totalDescontos)}</span>
            </div>
          )}
          {totais.valorComTaxa !== totais.valorFinal && (
            <div className="flex justify-between text-xs">
              <span className="text-[#5C6E84]">Com juros</span>
              <span className="text-[#F59E0B]">{fmt(totais.valorComTaxa)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#8A9BB0]">Total</span>
            <span className="text-xl font-bold text-[#F4F6F9]">{fmt(totais.valorFinal)}</span>
          </div>
          {carrinho.length > 0 && totais.lucro > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-[#3F516A]">Lucro estimado</span>
              <span className="text-[#22C55E]">{fmt(totais.lucro)}</span>
            </div>
          )}
          <button
            onClick={finalizarVenda}
            disabled={carrinho.length === 0 || finalizando}
            className="w-full py-3 rounded-[12px] bg-[#D7282F] hover:bg-[#C0232A] text-white font-bold text-sm transition-all mt-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {finalizando ? (
              <><RefreshCw size={16} className="animate-spin" /> Finalizando...</>
            ) : (
              <><Check size={16} /> Finalizar Venda</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
