'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { ScanBarcode, Plus, Minus, ChevronDown, UserPlus, CheckCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface ItemEstoque {
  id: number; produto_id: number; produto_nome: string; marca_nome: string
  imei: string | null; numero_serie: string | null; cor: string | null
  armazenamento: string | null; bateria: string | null; condicao: string | null
  estado: string | null; preco_custo: number | null; preco_venda: number | null; status: string
}
interface ClienteSimples { id: number; nome: string; telefone: string | null; cpf_cnpj: string | null }
interface Taxa { id: number; forma_pagamento: string; bandeira: string | null; parcelas: number | null; percentual_taxa: number | null }
interface VendaRecente { id: number; valor_venda: number; lucro: number | null; forma_pagamento: string | null; data_venda: string; status: string | null; cliente_nome: string; produto_nome: string }
interface Props { itensDisponiveis: ItemEstoque[]; clientes: ClienteSimples[]; taxas: Taxa[]; vendasRecentes: VendaRecente[] }
interface ItemCarrinho { item: ItemEstoque; desconto: number }

const FORMAS_PAG = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'pix',      label: 'PIX'      },
  { key: 'debito',   label: 'Débito'   },
  { key: 'credito',  label: 'Crédito'  },
  { key: 'link',     label: 'Link'     },
]

const AVATAR_COLORS = ['#D7282F','#7FB0E8','#34D399','#F4B740','#C6A86A','#a855f7','#ec4899']
const getAvatarColor = (str: string) => AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length]
const getInitials    = (nome: string) => nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase()
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function PDVView({ itensDisponiveis, clientes, taxas }: Props) {
  const supabase = createClient()
  const router   = useRouter()

  const [busca,              setBusca]              = useState('')
  const [carrinho,           setCarrinho]           = useState<ItemCarrinho[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteSimples | null>(null)
  const [buscaCliente,       setBuscaCliente]       = useState('')
  const [showClientes,       setShowClientes]       = useState(false)
  const [formaPagamento,     setFormaPagamento]     = useState('dinheiro')
  const [parcelas,           setParcelas]           = useState(1)
  const [bandeira,           setBandeira]           = useState<'visa_master'|'outros'>('visa_master')
  const [desconto,           setDesconto]           = useState('')
  const [finalizando,        setFinalizando]        = useState(false)
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
    return itensDisponiveis.filter(i =>
      i.produto_nome.toLowerCase().includes(q) || i.marca_nome.toLowerCase().includes(q) ||
      (i.imei ?? '').includes(q) || (i.cor ?? '').toLowerCase().includes(q) ||
      (i.armazenamento ?? '').toLowerCase().includes(q)
    )
  }, [itensDisponiveis, busca])

  const clientesFiltrados = useMemo(() => {
    const base = buscaCliente
      ? clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || (c.telefone ?? '').includes(buscaCliente))
      : clientes
    return base.slice(0, 8)
  }, [clientes, buscaCliente])

  function adicionarItem(item: ItemEstoque) {
    if (carrinho.some(c => c.item.id === item.id)) { toast.error('Item já está no carrinho'); return }
    setCarrinho(prev => [...prev, { item, desconto: 0 }])
  }
  function removerItem(id: number) { setCarrinho(prev => prev.filter(c => c.item.id !== id)) }

  const descontoNum = parseFloat(desconto.replace(',', '.')) || 0

  const totais = useMemo(() => {
    const subtotal = carrinho.reduce((a, c) => a + (c.item.preco_venda ?? 0), 0)
    const total    = Math.max(0, subtotal - descontoNum)
    const custo    = carrinho.reduce((a, c) => a + (c.item.preco_custo ?? 0), 0)
    let   totalComTaxa = total
    if (formaPagamento === 'credito' || formaPagamento === 'link') {
      const fpBanco = formaPagamento === 'credito' ? 'maquininha' : 'link'
      const taxa = taxas.find(t =>
        t.forma_pagamento === fpBanco && t.parcelas === parcelas &&
        (fpBanco === 'link' || t.bandeira === bandeira)
      )
      if (taxa?.percentual_taxa) totalComTaxa = total * (1 + Number(taxa.percentual_taxa) / 100)
    }
    const taxaPct = totalComTaxa > total ? ((totalComTaxa - total) / total * 100) : 0
    return { subtotal, total, totalComTaxa, custo, lucro: total - custo, taxaPct }
  }, [carrinho, descontoNum, formaPagamento, parcelas, bandeira, taxas])

  const parcelasOpts = useMemo(() => {
    const fp = formaPagamento === 'credito' ? 'maquininha' : 'link'
    return taxas
      .filter(t => t.forma_pagamento === fp && (fp === 'link' || t.bandeira === bandeira))
      .sort((a, b) => (a.parcelas ?? 0) - (b.parcelas ?? 0))
      .map(t => t.parcelas!)
      .filter(Boolean)
  }, [taxas, formaPagamento, bandeira])

  async function finalizarVenda() {
    if (carrinho.length === 0) { toast.error('Carrinho vazio'); return }
    const subtotalBruto = carrinho.reduce((s, c) => s + (c.item.preco_venda ?? 0), 0)
    if (descontoNum < 0) { toast.error('Desconto não pode ser negativo'); return }
    if (descontoNum > subtotalBruto) { toast.error('Desconto maior que o valor total'); return }
    setFinalizando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      const { data: vinculo } = await supabase
        .from('empresa_usuarios')
        .select('empresa_id')
        .eq('usuario_id', user.id)
        .eq('ativo', true)
        .single()

      if (!vinculo) throw new Error('Empresa não encontrada')
      const empresaId = vinculo.empresa_id

      const totalBruto = carrinho.reduce((s, c) => s + (c.item.preco_venda ?? 0), 0)
      for (const c of carrinho) {
        const precoCheio = c.item.preco_venda ?? 0
        // desconto proporcional pelo peso do item no total bruto
        const descontoItem = totalBruto > 0 ? descontoNum * (precoCheio / totalBruto) : 0
        const valorItem = precoCheio - descontoItem
        const { data: venda, error } = await supabase
          .from('vendas')
          .insert({
            empresa_id: empresaId,
            cliente_id: clienteSelecionado?.id ?? null,
            valor_venda: valorItem,
            valor_custo: c.item.preco_custo ?? 0,
            lucro: valorItem - (c.item.preco_custo ?? 0),
            forma_pagamento: formaPagamento,
            parcelas: ['credito','link'].includes(formaPagamento) ? parcelas : null,
            canal_venda: 'loja_fisica',
            desconto_valor: descontoItem,
            produto_id: c.item.produto_id,
            numero_serie: c.item.imei ?? c.item.numero_serie,
            status: 'concluida',
            data_venda: new Date().toISOString(),
          })
          .select().single()
        if (error) throw new Error(error.message)
        await supabase.from('vendas_pagamentos').insert({
          venda_id: venda.id, forma_pagamento: formaPagamento,
          valor_pago: valorItem,
          bandeira_cartao: formaPagamento === 'credito' ? bandeira : null,
          parcelas: ['credito','link'].includes(formaPagamento) ? parcelas : null,
          valor_com_juros: totais.totalComTaxa !== totais.total ? totais.totalComTaxa : null,
        })
        await supabase.from('inventario_unidades')
          .update({ status: 'vendido', cliente_id: clienteSelecionado?.id ?? null })
          .eq('id', c.item.id)
      }
      toast.success('Venda finalizada!')
      setCarrinho([]); setClienteSelecionado(null); setDesconto(''); setParcelas(1)
      router.refresh()
    } catch (e: any) {
      toast.error('Erro: ' + e.message)
    } finally {
      setFinalizando(false)
    }
  }

  const clienteIni = clienteSelecionado ? getInitials(clienteSelecionado.nome) : '?'
  const clienteBg  = clienteSelecionado ? getAvatarColor(clienteSelecionado.nome) : '#3A4A63'

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
      <div className="max-w-[1320px] mx-auto animate-fade-up"
        style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── ESQUERDA: Catálogo ── */}
        <div>
          <div className="relative mb-4">
            <ScanBarcode size={19} className="absolute left-[14px] top-1/2 -translate-y-1/2 text-[#46586E]" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Escaneie o código de barras ou busque um produto…"
              className="w-full bg-white border border-[#16212E]/[0.10] rounded-[12px] py-[13px] pl-[44px] pr-4 text-[14px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-[rgba(215,40,47,0.5)] transition-colors"
            />
          </div>

          {itensFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#9AA7B6]">
              <ScanBarcode size={40} className="mb-3 opacity-30" />
              <p className="text-[13px]">Nenhum produto disponível no estoque</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[14px]">
              {itensFiltrados.map(item => {
                const noCarrinho = carrinho.some(c => c.item.id === item.id)
                return (
                  <div key={item.id} onClick={() => !noCarrinho && adicionarItem(item)}
                    className={cn(
                      'bg-white border border-[#16212E]/[0.08] rounded-[16px] p-[18px] transition-all duration-200',
                      noCarrinho ? 'opacity-60 cursor-default border-[rgba(215,40,47,0.3)]'
                                 : 'cursor-pointer hover:-translate-y-[3px] hover:border-[rgba(215,40,47,0.3)]'
                    )}>
                    <div className="w-[46px] h-[46px] rounded-[12px] bg-white/[0.05] flex items-center justify-center mb-[14px] text-[22px]">📱</div>
                    <div className="text-[13.5px] font-semibold text-[#1F2A39] leading-[1.3] min-h-[36px]">
                      {item.produto_nome}
                      {item.armazenamento && <span className="text-[#6B7C92]"> · {item.armazenamento}</span>}
                    </div>
                    <div className="text-[11px] text-[#6B7C92] mt-[2px]">
                      {item.cor ?? item.marca_nome}{item.bateria ? ` · 🔋 ${item.bateria}%` : ''}
                    </div>
                    <div className="flex items-center justify-between mt-[12px]">
                      <span className="text-[16px] font-bold text-[#16212E]">{fmt(item.preco_venda ?? 0)}</span>
                      <div className={cn('w-[32px] h-[32px] rounded-[9px] flex items-center justify-center',
                        noCarrinho ? 'bg-[rgba(52,211,153,0.15)]'
                                   : 'bg-gradient-to-b from-[#E03037] to-[#C01F26] shadow-[0_4px_12px_rgba(215,40,47,0.3)]')}>
                        {noCarrinho ? <CheckCircle size={17} className="text-[#34D399]" /> : <Plus size={18} className="text-white" />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── DIREITA: Carrinho ── */}
        <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-6 sticky top-[20px]">

          <div className="flex items-center justify-between mb-[18px]">
            <h3 className="font-serif font-medium text-[21px] text-[#16212E]">Carrinho</h3>
            <span className="font-mono text-[11px] text-[#6B7C92]">{carrinho.length} ITENS</span>
          </div>

          {/* Seletor de cliente */}
          <div className="relative mb-4" ref={dropRef}>
            <div onClick={() => setShowClientes(!showClientes)}
              className="flex items-center gap-[11px] p-[11px_13px] rounded-[13px] bg-white/[0.03] border border-[#16212E]/[0.08] cursor-pointer hover:bg-[#16212E]/[0.06] transition-colors">
              <div className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center font-bold text-[12px] flex-none"
                style={{ background: `linear-gradient(135deg,${clienteBg}88,${clienteBg}44)`, color: clienteBg, border: `1px solid ${clienteBg}44` }}>
                {clienteIni}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#1F2A39]">{clienteSelecionado?.nome ?? 'Selecionar cliente'}</div>
                <div className="text-[11px] text-[#6B7C92]">{clienteSelecionado?.telefone ?? 'Toque para buscar'}</div>
              </div>
              <ChevronDown size={18} className={cn('text-[#6B7C92] transition-transform', showClientes && 'rotate-180')} />
            </div>

            {showClientes && (
              <div className="absolute top-full left-0 right-0 mt-[6px] bg-white border border-[#16212E]/[0.10] rounded-[13px] shadow-[0_16px_40px_rgba(0,0,0,0.5)] p-[6px] z-20 max-h-[300px] overflow-y-auto">
                <div className="p-1 pb-2">
                  <input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                    placeholder="Buscar cliente pelo nome…" autoFocus
                    className="w-full bg-white/[0.05] border border-[#16212E]/[0.10] rounded-[8px] px-3 py-2 text-[12.5px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-[rgba(215,40,47,0.5)]" />
                </div>
                <div onClick={() => { toast.info('Cadastro rápido em breve'); setShowClientes(false) }}
                  className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[9px] cursor-pointer text-[#C01F26] hover:bg-[rgba(215,40,47,0.08)] transition-colors">
                  <UserPlus size={18} />
                  <span className="text-[12.5px] font-semibold">Cadastrar novo cliente</span>
                </div>
                {clientesFiltrados.map(c => (
                  <div key={c.id} onClick={() => { setClienteSelecionado(c); setBuscaCliente(''); setShowClientes(false) }}
                    className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[9px] cursor-pointer hover:bg-[#16212E]/[0.05] transition-colors">
                    <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center font-bold text-[11px] flex-none"
                      style={{ background: `linear-gradient(135deg,${getAvatarColor(c.nome)}88,${getAvatarColor(c.nome)}44)`, color: getAvatarColor(c.nome) }}>
                      {getInitials(c.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#1F2A39]">{c.nome}</div>
                      {c.telefone && <div className="text-[10.5px] text-[#6B7C92]">{c.telefone}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Itens do carrinho */}
          <div className="flex flex-col gap-[12px] mb-4 min-h-[48px]">
            {carrinho.length === 0 ? (
              <div className="text-center py-[18px] text-[#788698] text-[13px]">Carrinho vazio — toque num produto para adicionar.</div>
            ) : carrinho.map(({ item }) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-[38px] h-[38px] rounded-[10px] bg-white/[0.05] flex items-center justify-center flex-none text-[18px]">📱</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#1F2A39] truncate">{item.produto_nome}</div>
                  <div className="flex items-center gap-2 mt-[5px]">
                    <button onClick={() => removerItem(item.id)}
                      className="w-[22px] h-[22px] rounded-[6px] border border-[#16212E]/[0.10] bg-white/[0.04] text-[#C01F26] flex items-center justify-center hover:bg-[#16212E]/[0.04] transition-colors">
                      <Minus size={13} />
                    </button>
                    <span className="font-mono text-[12.5px] font-bold text-[#1F2A39]">1</span>
                    <button className="w-[22px] h-[22px] rounded-[6px] border border-[#16212E]/[0.10] bg-white/[0.04] text-[#16212E] flex items-center justify-center opacity-40 cursor-default">
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <div className="text-[13.5px] font-bold text-[#16212E]">{fmt(item.preco_venda ?? 0)}</div>
              </div>
            ))}
          </div>

          {/* Subtotal + Desconto + Total */}
          <div className="bg-white/[0.03] border border-[#16212E]/[0.08] rounded-[13px] p-[13px] mb-4">
            <div className="flex justify-between items-center mb-[10px]">
              <span className="text-[13px] text-[#788698]">Subtotal</span>
              <span className="text-[13px] font-semibold text-[#1F2A39]">{fmt(totais.subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-[#788698]">Desconto</span>
              <div className="flex items-center gap-[5px]">
                <span className="text-[#C01F26] text-[13px]">− R$</span>
                <input value={desconto} onChange={e => setDesconto(e.target.value.replace(/[^0-9.,]/g,''))}
                  className="w-[66px] bg-white/[0.05] border border-[#16212E]/[0.10] rounded-[8px] px-2 py-[5px] text-[#C01F26] text-[13px] font-bold text-right outline-none focus:border-[rgba(240,101,107,0.5)]"
                  placeholder="0" />
              </div>
            </div>
            <div className="flex justify-between items-baseline mt-[16px]">
              <span className="text-[14px] font-semibold text-[#1F2A39]">Total</span>
              <span className="font-serif text-[30px] text-white leading-none">{fmt(totais.total)}</span>
            </div>
          </div>

          {/* Forma de pagamento */}
          <div className="font-mono text-[9.5px] tracking-[0.14em] text-[#9AA7B6] mb-[10px]">FORMA DE PAGAMENTO</div>
          <div className="grid grid-cols-2 gap-[9px] mb-4">
            {FORMAS_PAG.map(pg => {
              const ativo = formaPagamento === pg.key
              const emoji = pg.key === 'dinheiro' ? '💵' : pg.key === 'pix' ? '⚡' : pg.key === 'debito' ? '💳' : pg.key === 'link' ? '🔗' : '💳'
              return (
                <div key={pg.key} onClick={() => { setFormaPagamento(pg.key); setParcelas(1) }}
                  className={cn('flex items-center gap-[9px] px-[13px] py-[11px] rounded-[11px] cursor-pointer border transition-all duration-150',
                    ativo ? 'bg-[rgba(215,40,47,0.12)] border-[rgba(215,40,47,0.4)]'
                           : 'bg-transparent border-[#16212E]/[0.10] hover:bg-[#16212E]/[0.04]')}>
                  <span className="text-[18px]">{emoji}</span>
                  <span className={cn('text-[13px] font-semibold', ativo ? 'text-[#C01F26]' : 'text-[#788698]')}>{pg.label}</span>
                </div>
              )
            })}
          </div>

          {/* Parcelas */}
          {(formaPagamento === 'credito' || formaPagamento === 'link') && (
            <div className="mb-4">
              {formaPagamento === 'credito' && (
                <div className="flex gap-2 mb-3">
                  {(['visa_master','outros'] as const).map(b => (
                    <button key={b} onClick={() => setBandeira(b)}
                      className={cn('flex-1 py-[7px] rounded-[9px] font-mono text-[10.5px] border transition-all',
                        bandeira === b ? 'bg-white/[0.08] border-white/[0.2] text-[#16212E]'
                                       : 'bg-transparent border-[#16212E]/[0.08] text-[#6B7C92] hover:border-white/[0.12]')}>
                      {b === 'visa_master' ? 'Visa / Master' : 'Outros'}
                    </button>
                  ))}
                </div>
              )}
              <div className="font-mono text-[9.5px] tracking-[0.14em] text-[#9AA7B6] mb-[9px]">PARCELAS</div>
              <div className="grid grid-cols-6 gap-[6px]">
                {(parcelasOpts.length > 0 ? parcelasOpts : [1,2,3,4,5,6,7,8,9,10,11,12]).map(p => (
                  <div key={p} onClick={() => setParcelas(p)}
                    className={cn('text-center py-[9px] rounded-[9px] text-[13px] font-bold cursor-pointer border transition-all',
                      parcelas === p ? 'bg-[rgba(215,40,47,0.15)] border-[rgba(215,40,47,0.4)] text-[#C01F26]'
                                     : 'bg-white/[0.03] border-[#16212E]/[0.08] text-[#788698] hover:bg-[#16212E]/[0.06]')}>
                    {p}x
                  </div>
                ))}
              </div>
              {totais.total > 0 && (
                <div className="flex justify-between items-center mt-3 p-[11px_13px] rounded-[11px] bg-[rgba(215,40,47,0.08)] border border-[rgba(215,40,47,0.2)]">
                  <div>
                    <div className="text-[11px] text-[#788698]">{parcelas}x de</div>
                    <div className="text-[16px] font-bold text-[#16212E]">{fmt(totais.totalComTaxa / parcelas)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#788698]">com juros · {totais.taxaPct.toFixed(2)}%</div>
                    <div className="text-[16px] font-bold text-[#C01F26]">{fmt(totais.totalComTaxa)}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botão finalizar */}
          <button onClick={finalizarVenda} disabled={carrinho.length === 0 || finalizando}
            className="w-full flex items-center justify-center gap-[10px] py-[15px] rounded-[13px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-bold text-[15px] shadow-[0_10px_26px_rgba(215,40,47,0.4)] hover:-translate-y-[2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none">
            {finalizando
              ? <><RefreshCw size={19} className="animate-spin" /> Finalizando...</>
              : <><CheckCircle size={21} /> Finalizar venda · {fmt(totais.totalComTaxa || totais.total)}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
