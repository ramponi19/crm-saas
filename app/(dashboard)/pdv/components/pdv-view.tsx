'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ScanBarcode, Plus, Minus, ChevronDown, UserPlus, CheckCircle2, QrCode, Copy, Check, Send,
  Package, Banknote, Zap, CreditCard, Link2, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { useRouter } from 'next/navigation'
import { cn, formatCurrency } from '@/lib/utils'
import { Modal, Input, Button, ConfirmDialog, notify } from '@/components/ui'
import { EncomendaForm } from '@/components/modules/pdv/encomenda-form'
import { EncomendasAbertas, type EncomendaPDV } from '@/components/modules/pdv/encomendas-abertas'
import { diagnosticar } from '@/lib/encomendas'
import ClienteModal from '@/app/(dashboard)/clientes/components/cliente-modal'
import { imprimirContratoHTML } from '@/lib/contrato-tipos'
import { emitirContrato, type EmitirContratoInput, type DocumentoDisponivel } from '@/lib/contrato-emitir'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { camposDaCategoria } from '@/lib/estoque-campos'
import {
  referenciaDaTroca, avaliarTroca, textoDoAceite, TOLERANCIA_PADRAO,
  type PrecoRef, type AvaliacaoTroca,
} from '@/lib/troca-referencia'
import {
  resumirPagamentos, valorComJuros, formaResumida, parcelasResumidas, parcelasDisponiveis,
  FORMAS_PARCELAVEIS, type LinhaPagamento,
} from '@/lib/pdv-pagamentos'

interface ItemEstoque {
  id: number; produto_id: number | null; produto_nome: string; marca_nome: string
  imei: string | null; numero_serie: string | null; cor: string | null
  armazenamento: string | null; bateria: string | null; condicao: string | null
  estado: string | null; preco_custo: number | null; preco_venda: number | null; status: string
  /** Garantia do modelo; null cai no padrão da loja. */
  produto_garantia_dias?: number | null
  /** Fotos desta unidade (URLs separadas por vírgula) e foto do modelo. */
  fotos_urls?: string | null
  produto_foto?: string | null
  observacoes?: string | null
  /** Saldo do lote. 1 em item serializado. */
  quantidade?: number
  /** Tipo da categoria — decide se o item é vendido por peça ou por quantidade. */
  tipo_formulario?: string | null
}

/** Item vendido por quantidade (capinha, película) e não por peça identificada. */
const porQuantidade = (i: ItemEstoque) => camposDaCategoria(i.tipo_formulario).semSerie

/** Foto da unidade tem prioridade: é o aparelho real, não o do catálogo. */
const fotoDoItem = (i: { fotos_urls?: string | null; produto_foto?: string | null }) =>
  (i.fotos_urls ?? '').split(',').map((u) => u.trim()).find(Boolean) ?? i.produto_foto ?? null
interface ClienteSimples { id: number; nome: string; telefone: string | null; cpf_cnpj: string | null }
interface Taxa { id: number; forma_pagamento: string; bandeira: string | null; parcelas: number | null; percentual_taxa: number | null }
interface VendaRecente { id: number; valor_venda: number; lucro: number | null; forma_pagamento: string | null; data_venda: string; status: string | null; cliente_nome: string; produto_nome: string }
interface CobrancaPix { qr_code: string | null; qr_code_base64: string | null; linha_digitavel: string | null; link_pagamento: string | null }
// Unidade reservada para um lead (feita no modal do lead; vendida aqui).
interface ReservaPDV extends ItemEstoque { lead_nome: string; reservado_lead_id: number; reservado_por: string | null; reserva_expira_em: string | null }
interface Props { itensDisponiveis: ItemEstoque[]; reservas?: ReservaPDV[]; clientes: ClienteSimples[]; taxas: Taxa[]; vendasRecentes: VendaRecente[]; segmento?: string | null; isAdmin?: boolean; documentos?: DocumentoDisponivel[]; tabelaPrecos?: PrecoRef[]; toleranciaTroca?: number; encomendas?: EncomendaPDV[] }
interface ItemCarrinho { item: ItemEstoque; desconto: number; reserva?: boolean; qtd: number }
/**
 * Aparelho entregue na troca. `valor` fica string porque vem de <input>.
 *
 * `cotacaoId`/`cotacaoNumero` aparecem quando a linha foi preenchida por CÓDIGO
 * — o número que a cotação de Upgrade/Downgrade gerou. Guardar o id é o que
 * permite marcar a cotação como usada no fechamento e impedir que o mesmo
 * abatimento entre em duas vendas.
 */
interface TrocaItem {
  aparelho: string
  imei: string
  valor: string
  codigo?: string
  cotacaoId?: number | null
  cotacaoNumero?: number | null
  /** A cotação já tinha sido consumida em outra venda. Só avisa; não bloqueia. */
  cotacaoJaUsada?: boolean
}
/**
 * Contexto da venda fechada, guardado para emitir o documento escolhido.
 * Inclui `empresaId` porque ele é resolvido dentro do fechamento.
 */
type ContextoVenda = Omit<EmitirContratoInput, 'documentoId' | 'nomeDocumento'>

const FORMAS_PAG: { key: string; label: string; icon: typeof Banknote }[] = [
  { key: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { key: 'pix', label: 'PIX', icon: Zap },
  { key: 'debito', label: 'Débito', icon: CreditCard },
  { key: 'credito', label: 'Crédito', icon: CreditCard },
  { key: 'link', label: 'Link', icon: Link2 },
]

const getInitials = (nome: string) => nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
const fmt = (v: number) => formatCurrency(v)

export default function PDVView({ itensDisponiveis, reservas = [], clientes, taxas, segmento, isAdmin = false, documentos = [], tabelaPrecos = [], toleranciaTroca = TOLERANCIA_PADRAO, encomendas = [] }: Props) {
  // Comanda é comportamento (mesa/balcão), não segmento: bar, cafeteria e
  // qualquer atendimento por mesa usam o mesmo campo.
  const isFood = !!SEGMENTOS[normalizarSegmento(segmento)].capacidades.usaComanda
  const [comanda, setComanda] = useState('')
  // Relógio congelado no mount: `Date.now()` em render torna o componente impuro.
  const [agora] = useState(() => Date.now())
  /**
   * AS DUAS NATUREZAS DE VENDA DO BALCÃO.
   *
   * `pronta` é vender o que está na prateleira: escaneia, cobra, entrega.
   * `encomenda` é vender o que a loja ainda não tem — outro ritmo, outro
   * conjunto de campos (prazo, sinal, fornecedor) e, sobretudo, um depois: a
   * venda fica pendente até a peça chegar. Misturar as duas na mesma tela era o
   * que fazia a encomenda virar um botão discreto e as pendências sumirem.
   */
  const [aba, setAba] = useState<'pronta' | 'encomenda'>('pronta')
  /** Só para pintar o contador da aba de vermelho quando há algo estourado. */
  const encomendasAtrasadas = useMemo(
    () => encomendas.filter((e) => diagnosticar(e).situacao === 'atrasada').length,
    [encomendas],
  )
  const supabase = createClient()
  const router = useRouter()

  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteSimples | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [showClientes, setShowClientes] = useState(false)
  const [cadastroCliente, setCadastroCliente] = useState(false)
  /**
   * Clientes criados aqui dentro. A lista `clientes` vem do servidor e só é
   * renovada no refresh; sem isto o cliente recém-cadastrado sumiria da busca
   * se o vendedor reabrisse o seletor antes de a página recarregar.
   */
  const [clientesNovos, setClientesNovos] = useState<ClienteSimples[]>([])
  /**
   * Formas de pagamento da venda. Lista, não valor único: o caixa real combina
   * cartão + dinheiro, dois cartões + Pix. `vendas_pagamentos` sempre foi 1:N —
   * era só a tela que obrigava a escolher uma e mentir no resto.
   */
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([
    { id: 'p1', forma: 'dinheiro', valor: 0, parcelas: 1, bandeira: 'visa_master' },
  ])
  /** Forma única, derivada — o resto do fluxo (Pix, contrato) pergunta por ela. */
  const formaPagamento = formaResumida(pagamentos)
  const parcelas = parcelasResumidas(pagamentos) ?? 1
  const [desconto, setDesconto] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  // #3 upsell de acessórios (ofertas editáveis)
  const [acessorios, setAcessorios] = useState<{ descricao: string; valor: number }[]>([])
  // #1 aparelhos na troca (abatem no total + entram no estoque).
  // É lista porque o cliente com frequência entrega mais de um aparelho na
  // mesma compra — cada um vira uma unidade própria no estoque, com seu IMEI e
  // seu valor, e a soma abate do total.
  const [trocaAtiva, setTrocaAtiva] = useState(false)
  const [trocas, setTrocas] = useState<TrocaItem[]>([{ aparelho: '', imei: '', valor: '' }])
  /** Índice da linha cujo código está sendo buscado — para o "buscando…". */
  const [buscandoCodigo, setBuscandoCodigo] = useState<number | null>(null)

  /**
   * O CÓDIGO DA COTAÇÃO preenche a linha da troca.
   *
   * Pedido do dono: "quando for realizar a venda do aparelho digitar o codigo e
   * ja vir o valor de abatimento". O ganho não é digitar menos — é o valor do
   * usado chegar EXATAMENTE como foi cotado. Redigitado com o cliente na frente,
   * ele muda; e muda sempre para cima.
   *
   * A cotação já usada não bloqueia: existe caso legítimo (venda cancelada e
   * refeita). Ela avisa, e quem decide é o vendedor — mas o aviso é vermelho,
   * porque abater duas vezes é dinheiro saindo duas vezes.
   */
  async function aplicarCodigoTroca(i: number, codigo: string) {
    const limpo = codigo.replace(/\D/g, '')
    if (!limpo) return
    setBuscandoCodigo(i)
    const r = await fetch(`/api/troca/cotacoes/buscar?numero=${limpo}`)
    setBuscandoCodigo(null)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Código não encontrado', j.error); return }

    setTrocas((ts) => ts.map((x, k) => (k === i ? {
      ...x,
      aparelho: j.aparelho,
      imei: j.imei || x.imei,
      valor: String(j.valor),
      codigo: String(j.numero),
      cotacaoId: j.id,
      cotacaoNumero: j.numero,
      cotacaoJaUsada: !!j.ja_usada,
    } : x)))

    if (j.ja_usada) {
      notify.warn(`Cotação #${j.numero} JÁ FOI USADA`, 'Confira antes de fechar — o abatimento pode sair em dobro.')
    } else {
      notify.ok(`Cotação #${j.numero}`, `${j.aparelho} · ${fmt(j.valor)}`)
    }
  }
  // #2 entrega pendente (semi-novo que não sai na hora)
  const [entregaPendente, setEntregaPendente] = useState(false)
  // Termo de garantia a assinar. Marcado aqui, a venda entra na fila de Garantia
  // até alguém anexar o termo assinado — sem mexer no status da venda, que é o
  // que faz ela contar no faturamento.
  const [termoGarantia, setTermoGarantia] = useState(false)
  const [pixCobranca, setPixCobranca] = useState<CobrancaPix | null>(null)
  const [pixCopiado, setPixCopiado] = useState(false)
  const [enviandoWpp, setEnviandoWpp] = useState(false)
  // Contexto da última venda: guardado para emitir o documento que o vendedor
  // escolher no modal de sucesso (o carrinho já foi limpo a essa altura).
  const [contexto, setContexto] = useState<ContextoVenda | null>(null)
  /** ids dos documentos já emitidos para esta venda, para não repetir. */
  const [emitidos, setEmitidos] = useState<number[]>([])
  const [emitindo, setEmitindo] = useState<number | null>(null)
  // Total da última venda — separado do contrato, porque a venda acontece mesmo
  // quando a loja não tem modelo configurado e nenhum contrato é emitido.
  const [ultimoTotal, setUltimoTotal] = useState(0)
  /**
   * Quanto a VENDA valeu, além de quanto entrou de dinheiro.
   *
   * O modal de sucesso mostrava o valor cobrado sob o rótulo "Total da venda" — e
   * numa troca esses números são diferentes: o teste fechou uma venda de R$ 1.200
   * com R$ 400 em aparelho, e a tela anunciou "Total da venda R$ 800,00" enquanto o
   * relatório registrava R$ 1.200. O carrinho já explicava a diferença; a
   * confirmação a desfazia. Guardar os dois deixa cada rótulo dizer a verdade.
   */
  const [ultimoValorVenda, setUltimoValorVenda] = useState(0)
  const [sucessoOpen, setSucessoOpen] = useState(false)
  const [confirmarSemPreco, setConfirmarSemPreco] = useState(false)
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
    const todos = [...clientesNovos, ...clientes.filter((c) => !clientesNovos.some((n) => n.id === c.id))]
    const base = buscaCliente
      ? todos.filter((c) => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || (c.telefone ?? '').includes(buscaCliente))
      : todos
    return base.slice(0, 8)
  }, [clientes, clientesNovos, buscaCliente])

  function adicionarItem(item: ItemEstoque, reserva = false) {
    const lote = porQuantidade(item)
    if (!lote && carrinho.some((c) => c.item.id === item.id)) {
      notify.warn('Item já está no carrinho'); return
    }
    // Tudo decidido DENTRO do updater: dois cliques rápidos caem no mesmo ciclo
    // de render, e ler `carrinho` de fora faria os dois calcularem a mesma
    // quantidade — clicar 3× somava 2.
    setCarrinho((prev) => {
      const i = prev.findIndex((c) => c.item.id === item.id)
      if (i < 0) return [...prev, { item, desconto: 0, reserva, qtd: 1 }]
      if (!lote) return prev
      const max = Math.max(1, item.quantidade ?? 1)
      if (prev[i].qtd >= max) { avisarSemSaldo(item, max); return prev }
      return prev.map((c, j) => (j === i ? { ...c, qtd: c.qtd + 1 } : c))
    })
  }
  function removerItem(id: number) { setCarrinho((prev) => prev.filter((c) => c.item.id !== id)) }

  /** Soma/subtrai na linha (delta, nunca valor absoluto), presa ao saldo do lote. */
  function alterarQtd(id: number, delta: number) {
    setCarrinho((prev) => prev.map((c) => {
      if (c.item.id !== id) return c
      const max = Math.max(1, c.item.quantidade ?? 1)
      const alvo = c.qtd + delta
      if (alvo > max) { avisarSemSaldo(c.item, max); return c }
      return { ...c, qtd: Math.max(1, alvo) }
    }))
  }

  /** Aviso fora do updater: setState pode rodar duas vezes em modo estrito. */
  function avisarSemSaldo(item: ItemEstoque, max: number) {
    setTimeout(() => notify.warn(`Só há ${max} em estoque de "${item.produto_nome}"`), 0)
  }

  // Aba do catálogo: estoque disponível ou reservas de lead.
  const [abaCat, setAbaCat] = useState<'estoque' | 'reservas'>('estoque')
  const [cancelandoReserva, setCancelandoReserva] = useState<number | null>(null)

  async function cancelarReserva(id: number) {
    setCancelandoReserva(id)
    try {
      const r = await fetch('/api/reservas', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidadeId: id }),
      })
      const j = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Não foi possível cancelar')
      notify.ok('Reserva cancelada', 'A unidade voltou para o estoque disponível.')
      removerItem(id)
      router.refresh()
    } catch (e) {
      notify.bad('Erro ao cancelar reserva', e instanceof Error ? e.message : 'Tente novamente.')
    } finally { setCancelandoReserva(null) }
  }

  const horasReserva = (iso: string | null) => {
    if (!iso) return '—'
    const ms = new Date(iso).getTime() - agora
    if (ms <= 0) return 'expirada'
    const h = Math.floor(ms / 3600_000)
    return h >= 1 ? `${h}h restantes` : `${Math.max(1, Math.round(ms / 60_000))}min restantes`
  }

  const descontoNum = parseFloat(desconto.replace(',', '.')) || 0
  const acessoriosTotal = acessorios.reduce((a, x) => a + (Number(x.valor) || 0), 0)
  /** Trocas realmente preenchidas (valor > 0), com o valor já numérico. */
  const trocasValidas = trocaAtiva
    ? trocas
        .map((t) => ({ ...t, num: parseFloat(String(t.valor).replace(',', '.')) || 0 }))
        .filter((t) => t.num > 0)
    : []
  const trocaNum = trocasValidas.reduce((s, t) => s + t.num, 0)

  /**
   * Cada troca comparada com o preço de referência do modelo. A loja pagar MAIS
   * do que o aparelho vale é o risco que some: abate do que o cliente paga, a
   * venda continua com preço cheio, e o prejuízo só aparece na revenda.
   */
  const avaliacoesTroca = useMemo(
    () => trocas.map((t) => {
      const num = parseFloat(String(t.valor).replace(',', '.')) || 0
      const ref = referenciaDaTroca(t.aparelho, tabelaPrecos)
      return { aparelho: t.aparelho, referencia: ref, avaliacao: avaliarTroca(num, ref, toleranciaTroca) }
    }),
    [trocas, tabelaPrecos, toleranciaTroca],
  )
  /** Trocas que passaram da tolerância — exigem aceite antes de fechar. */
  const trocasAcima = trocaAtiva
    ? avaliacoesTroca.filter((a): a is typeof a & { avaliacao: AvaliacaoTroca } => !!a.avaliacao?.exigeAceite)
    : []
  const [confirmarTroca, setConfirmarTroca] = useState(false)
  const abatimento = descontoNum + trocaNum

  const totais = useMemo(() => {
    const subtotal = carrinho.reduce((a, c) => a + (c.item.preco_venda ?? 0) * c.qtd, 0) + acessoriosTotal
    // A venda VALE o preço cheio menos o desconto real. A troca NÃO abate daqui:
    // ela é pagamento em espécie (dação em pagamento), não desconto — o cliente
    // pagou o preço todo, só que parte dele em aparelho. É `valorVenda` que vai
    // para `vendas.valor_venda`, e é dele que saem faturamento e lucro.
    const valorVenda = Math.max(0, subtotal - descontoNum)
    // `total` é outra coisa: o DINHEIRO que o cliente ainda tem de pagar. Aqui a
    // troca abate, porque ela já foi paga em aparelho. É o valor do Pix, da
    // maquininha e do "Total a pagar" na tela.
    const total = Math.max(0, subtotal - abatimento)
    const custo = carrinho.reduce((a, c) => a + (c.item.preco_custo ?? 0) * c.qtd, 0)
    // Juros agora saem das LINHAS de pagamento (cada cartão tem a sua taxa), não
    // de uma forma única — ver `resumoPag` logo abaixo.
    // Lucro sai de `valorVenda`, não de `total`: senão a troca viraria prejuízo.
    return { subtotal, valorVenda, total, custo, lucro: valorVenda - custo }
  }, [carrinho, abatimento, descontoNum, acessoriosTotal])

  const resumoPag = useMemo(
    () => resumirPagamentos(pagamentos, totais.total, taxas),
    [pagamentos, totais.total, taxas],
  )

  /**
   * Uma linha só acompanha o total automaticamente — é o caso comum e evita
   * digitar o valor toda venda. Com duas ou mais, o operador é quem divide, e
   * mexer nos valores dele seria pior que não ajudar.
   */
  useEffect(() => {
    if (pagamentos.length !== 1) return
    setPagamentos((ps) => (ps.length === 1 && ps[0].valor !== totais.total ? [{ ...ps[0], valor: totais.total }] : ps))
  }, [totais.total, pagamentos.length])

  function mudarPagamento(id: string, patch: Partial<LinhaPagamento>) {
    setPagamentos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  function removerPagamento(id: string) {
    setPagamentos((ps) => (ps.length <= 1 ? ps : ps.filter((p) => p.id !== id)))
  }
  /** Nova linha já vem com o que falta — é o valor que o operador ia digitar. */
  function adicionarPagamento() {
    setPagamentos((ps) => {
      const coberto = ps.reduce((s, p) => s + (Number(p.valor) || 0), 0)
      const resta = Math.max(0, totais.total - coberto)
      return [...ps, { id: `p${Date.now()}`, forma: 'dinheiro', valor: resta, parcelas: 1, bandeira: 'visa_master' }]
    })
  }

  /**
   * Itens do carrinho sem preço de venda. Acontece de verdade com aparelho que
   * entrou por troca: nasce com custo e sem preço, e a venda fecharia por R$ 0
   * sem ninguém notar. Não bloqueio — brinde e troca em garantia são legítimos —
   * mas confirmo apontando qual item está sem preço.
   */
  const semPreco = carrinho.filter((c) => !c.item.preco_venda)

  async function finalizarVenda(jaConfirmado = false, trocaAceita = false) {
    if (carrinho.length === 0) { notify.warn('Carrinho vazio'); return }
    const subtotalBruto = carrinho.reduce((s, c) => s + (c.item.preco_venda ?? 0) * c.qtd, 0) + acessoriosTotal
    if (descontoNum < 0) { notify.warn('Desconto não pode ser negativo'); return }
    if (abatimento > subtotalBruto) { notify.warn('Desconto + troca maior que o valor total'); return }
    if (!jaConfirmado && semPreco.length > 0) { setConfirmarSemPreco(true); return }
    // Troca acima da referência: o vendedor precisa aceitar, e o aceite é gravado
    // logo abaixo. Sem passar por aqui a venda não fecha.
    if (!trocaAceita && trocasAcima.length > 0) { setConfirmarTroca(true); return }
    setFinalizando(true)
    // Rollback: venda não é atômica sem RPC. Se algo falhar no meio, desfazemos o
    // que foi gravado nesta tentativa (unidades reivindicadas + vendas/pagamentos).
    // Guarda o status anterior: item de reserva volta a 'reservado', não 'disponivel'.
    // `saldoAnterior` só existe em lote: desfazer ali é devolver o saldo, não só
    // o status. Sem isso, uma falha no meio da venda sumiria com estoque.
    const claimed: { id: number; statusAnterior: string; qtdBaixada?: number; saldoAnterior?: number }[] = []
    const vendaIds: number[] = []
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      // Mesma resolução do servidor e da RLS. Consultar `empresa_usuarios` aqui
      // quebrava para o super admin em impersonação — ele não tem vínculo, e a
      // venda morria em "Empresa não encontrada" no último clique.
      const empresaId = await empresaAtualId(supabase)
      if (!empresaId) throw new Error('Empresa não encontrada')

      // Um fechamento gera VÁRIAS vendas (uma por item do carrinho). O grupo as
      // amarra: é por ele que um aparelho de troca ainda não recebido segura a
      // comissão do fechamento inteiro, e não só da primeira linha.
      const grupoPdv = crypto.randomUUID()
      const vendaStatus = entregaPendente ? 'pendente_entrega' : 'concluida'
      const unitStatus = entregaPendente ? 'reservado' : 'vendido'
      const trocaNota = trocasValidas.length
        ? ` Troca: ${trocasValidas.map((t) => `${t.aparelho.trim() || 'aparelho'} (${fmt(t.num)})`).join(', ')}.`
        : ''
      let primeiraVendaId: number | null = null
      let trocaNotaPendente = trocaNota.length > 0

      // Uma venda por unidade do carrinho. Desconto e troca são rateados
      // separadamente porque têm naturezas diferentes: o desconto reduz o valor da
      // venda, a troca só troca a FORMA de pagamento de uma parte dela.
      /**
       * Sobra do rateio, em centavos, fica com a ÚLTIMA linha.
       *
       * Cada venda é gravada com duas casas. R$ 100 de desconto entre três itens
       * de R$ 1.000 dá 33,3333… por item; arredondado, três linhas de 966,67
       * somam R$ 2.900,01 — um centavo a mais de faturamento por venda, que
       * ninguém confere e que nunca fecha com o caixa. Fechar a conta na última
       * linha faz a soma bater exatamente com o valor cobrado do cliente.
       */
      const cent = (n: number) => Math.round(n * 100) / 100
      let descontoRateado = 0

      for (const [iCarrinho, c] of carrinho.entries()) {
        const precoCheio = (c.item.preco_venda ?? 0) * c.qtd
        const fatia = subtotalBruto > 0 ? precoCheio / subtotalBruto : 0
        const ultimaLinha = iCarrinho === carrinho.length - 1
        const descontoItem = ultimaLinha
          ? cent(descontoNum - descontoRateado)
          : cent(descontoNum * fatia)
        descontoRateado += descontoItem
        const valorItem = cent(precoCheio - descontoItem)
        // A parte paga em dinheiro não é mais calculada por item: os pagamentos
        // do fechamento vão juntos na primeira venda do grupo.

        // Item de reserva só é vendável enquanto AINDA está reservado (a reserva
        // trava a peça); item comum exige 'disponivel' — protege contra corrida.
        const statusEsperado = c.reserva ? 'reservado' : 'disponivel'

        if (porQuantidade(c.item)) {
          // Lote: baixa o saldo em vez de mudar o status. O filtro `gte` no
          // próprio UPDATE é a trava contra corrida — dois caixas vendendo a
          // última capinha ao mesmo tempo, só um consegue. Sem ele o saldo iria a
          // negativo (o CHECK no banco recusaria, mas depois de meia venda feita).
          const saldoAtual = c.item.quantidade ?? 1
          const restante = saldoAtual - c.qtd
          const { data: baixa } = await supabase
            .from('inventario_unidades')
            .update({
              quantidade: restante,
              // Lote zerado sai do estoque; com saldo, continua disponível.
              status: restante <= 0 ? unitStatus : statusEsperado,
            } as never)
            .eq('id', c.item.id)
            .eq('status', statusEsperado)
            .gte('quantidade', c.qtd)
            .select('id')
            .maybeSingle()
          if (!baixa) throw new Error(`Estoque insuficiente de "${c.item.produto_nome}" — alguém vendeu enquanto você fechava`)
          claimed.push({ id: c.item.id, statusAnterior: statusEsperado, qtdBaixada: c.qtd, saldoAnterior: saldoAtual })
        } else {
          const { data: unidadeClaim } = await supabase
            .from('inventario_unidades')
            .update({ status: unitStatus, cliente_id: clienteSelecionado?.id ?? null })
            .eq('id', c.item.id)
            .eq('status', statusEsperado)
            .select('id')
            .single()
          if (!unidadeClaim) throw new Error(c.reserva ? `A reserva de "${c.item.produto_nome}" não está mais ativa` : `"${c.item.produto_nome}" não está mais disponível`)
          claimed.push({ id: c.item.id, statusAnterior: statusEsperado })
        }

        const vendaRow = {
          empresa_id: empresaId,
          grupo_pdv: grupoPdv,
          cliente_id: clienteSelecionado?.id ?? null,
          vendedor_id: user.id,
          usuario_id: user.id,
          valor_venda: valorItem,
          /**
           * A PEÇA fica amarrada à venda SEMPRE, não só na entrega pendente.
           *
           * Antes o vínculo só era gravado quando a venda ficava pendente de
           * entrega (ali ele é obrigatório, para baixar depois). Na venda normal a
           * unidade virava 'vendido' e nada apontava para qual venda a levou: o
           * teste registrou uma venda de R$ 1.200 com `unidade_id` nulo. Sobrava só
           * o `numero_serie` como ligação — e item sem série (acessório em lote) não
           * tem nem isso. Sem o vínculo, nenhuma conferência de estoque fecha.
           */
          unidade_id: c.item.id,
          valor_custo: (c.item.preco_custo ?? 0) * c.qtd,
          // Quantas peças saíram nesta linha. Sem isto, vender 3 películas viraria
          // 3 vendas e o ranking contaria 3.
          quantidade: c.qtd,
          // `lucro` NAO entra: e coluna gerada (valor_venda - valor_custo). Mandar
          // valor faz o Postgres recusar o INSERT inteiro com 428C9.
          forma_pagamento: formaPagamento,
          parcelas: ['credito', 'link'].includes(formaPagamento) ? parcelas : null,
          canal_venda: 'loja_fisica',
          comanda: isFood ? (comanda.trim() || null) : null,
          desconto_valor: descontoItem,
          produto_id: c.item.produto_id,
          numero_serie: c.item.imei ?? c.item.numero_serie,
          status: vendaStatus,
          // Sem cadastro de produto (aparelho de troca), a descricao vai para a
          // observacao: e a unica coisa que o Historico tera para exibir depois.
          observacoes: [
            c.item.produto_id ? null : c.item.produto_nome,
            trocaNotaPendente ? trocaNota.trim() : null,
          ].filter(Boolean).join(' · ') || null,
          data_venda: new Date().toISOString(),
        }
        trocaNotaPendente = false
        const { data: venda, error } = await supabase
          .from('vendas')
          .insert(vendaRow as never)
          .select('id').single<{ id: number }>()
        if (error) throw new Error(error.message)
        vendaIds.push(venda.id)
        if (primeiraVendaId === null) primeiraVendaId = venda.id
        // O vínculo com a unidade já vai no INSERT acima (inclusive na entrega
        // pendente, que é quem precisa dele para baixar o estoque no "Entregar").
        // Os pagamentos NÃO são gravados por item: com várias formas, ratear
        // "crédito 3x" entre três linhas do carrinho inventaria uma divisão que
        // não existe na maquininha. Ficam todos na primeira venda do fechamento,
        // logo abaixo do laço — o invariante passa a ser por GRUPO:
        // soma dos pagamentos do grupo = soma dos valor_venda do grupo.
      }

      // #3 Acessórios ofertados (kit proteção, fonte…) → venda extra por item.
      for (const ac of acessorios) {
        const preco = Number(ac.valor) || 0
        if (preco <= 0 || !ac.descricao.trim()) continue
        const fatiaAc = subtotalBruto > 0 ? preco / subtotalBruto : 0
        const descAc = descontoNum * fatiaAc
        const valorAc = preco - descAc
        const { data: vAc } = await supabase.from('vendas').insert({
          empresa_id: empresaId, grupo_pdv: grupoPdv, cliente_id: clienteSelecionado?.id ?? null, vendedor_id: user.id, usuario_id: user.id,
          valor_venda: valorAc, valor_custo: 0, forma_pagamento: formaPagamento, // sem `lucro`: coluna gerada
          parcelas: ['credito', 'link'].includes(formaPagamento) ? parcelas : null, canal_venda: 'loja_fisica',
          desconto_valor: descAc, status: 'concluida', observacoes: `Acessório: ${ac.descricao.trim()}`, data_venda: new Date().toISOString(),
        } as never).select('id').single()
        if (vAc?.id) vendaIds.push(vAc.id)
        // Acessório também não grava pagamento por linha — tudo vai junto na
        // primeira venda do fechamento (ver o bloco de pagamentos abaixo).
      }

      // #1 Cada aparelho recebido na troca entra no estoque como UMA unidade
      // própria — com o IMEI e o custo dele. Somar tudo numa unidade só perderia
      // o rastro de qual aparelho é qual na hora de revender.
      // Entra como PENDENTE, não disponível: no ato da venda o aparelho ainda não
      // está na loja — o cliente pode levar dias para entregar, ou não entregar.
      // Vender uma peça que não chegou é pior que não tê-la no estoque. Fica no
      // nome de quem fechou (`usuario_id`) e a comissão do fechamento espera a
      // confirmação de chegada.
      for (const t of trocasValidas) {
        await supabase.from('inventario_unidades').insert({
          empresa_id: empresaId, produto_id: null, condicao: 'usado', tipo: 'troca', status: 'pendente',
          grupo_pdv: grupoPdv, usuario_id: user.id,
          preco_custo: t.num, imei: t.imei.trim() || null,
          observacoes: `${t.aparelho.trim() || 'Aparelho recebido em troca'} — entrada por troca no PDV${clienteSelecionado ? ` (cliente ${clienteSelecionado.nome})` : ''}.`,
          ativo: true,
        } as never)
      }

      /**
       * A cotação usada é MARCADA — é o que impede abater duas vezes.
       *
       * O código vale dinheiro: digitado em duas vendas, o cliente recebe o
       * abatimento duas vezes e ninguém percebe até o fechamento do mês. A
       * marca é o que faz a próxima leitura do código dizer "já usada".
       *
       * `is('usada_em', null)` no filtro: marcar de novo apagaria a venda
       * original de uma cotação reaproveitada, e é justamente a primeira que
       * interessa para auditar.
       */
      for (const t of trocasValidas) {
        if (!t.cotacaoId) continue
        await supabase.from('troca_cotacoes')
          .update({ usada_em: new Date().toISOString(), venda_id: primeiraVendaId } as never)
          .eq('id', t.cotacaoId)
          .is('usada_em', null)
      }

      // Pagamentos do fechamento, na primeira venda do grupo: as formas que o
      // cliente usou (cada cartão com sua bandeira, parcelas e juros) mais o
      // aparelho dado em troca, que é pagamento em espécie.
      if (primeiraVendaId !== null) {
        const linhas = [
          ...pagamentos
            .filter((p) => (Number(p.valor) || 0) > 0.005)
            .map((p) => {
              const comJuros = valorComJuros(p, taxas)
              return {
                empresa_id: empresaId,
                venda_id: primeiraVendaId!,
                forma_pagamento: p.forma,
                valor_pago: p.valor,
                bandeira_cartao: p.forma === 'credito' ? (p.bandeira ?? 'visa_master') : null,
                parcelas: FORMAS_PARCELAVEIS.includes(p.forma) ? (p.parcelas ?? 1) : null,
                valor_com_juros: comJuros > p.valor ? comJuros : null,
              }
            }),
          ...(trocaNum > 0.005 ? [{
            empresa_id: empresaId,
            venda_id: primeiraVendaId!,
            forma_pagamento: 'troca',
            valor_pago: trocaNum,
            bandeira_cartao: null, parcelas: null, valor_com_juros: null,
          }] : []),
        ]
        if (linhas.length) await supabase.from('vendas_pagamentos').insert(linhas as never)
      }

      // Termos a assinar, na PRIMEIRA venda do fechamento: são documentos da
      // compra inteira, e marcar cada linha do carrinho faria a mesma compra
      // aparecer três vezes na fila.
      //
      // O de TROCA entra sozinho sempre que há aparelho recebido — é o termo de
      // responsabilidade e entrega do usado, e depender de o vendedor lembrar de
      // marcar seria depender justamente de quem tem pressa de fechar.
      if (primeiraVendaId !== null) {
        const termos = [
          ...(termoGarantia ? [{ tipo: 'garantia' }] : []),
          ...(trocasValidas.length ? [{ tipo: 'troca' }] : []),
        ].map((t) => ({ empresa_id: empresaId, venda_id: primeiraVendaId!, tipo: t.tipo, status: 'pendente' }))
        if (termos.length) await supabase.from('vendas_termos').insert(termos as never)
      }

      // Log do aceite: uma linha por troca acima da referência, ligada à primeira
      // venda do fechamento. Fica em tabela própria (sem UPDATE nem DELETE por
      // policy) porque a finalidade é comprovar — texto solto em `observacoes`
      // seria editável e sem autor.
      if (primeiraVendaId !== null && trocasAcima.length > 0) {
        await supabase.from('vendas_alertas').insert(
          trocasAcima.map((t) => ({
            empresa_id: empresaId,
            venda_id: primeiraVendaId!,
            tipo: 'troca_acima_referencia',
            mensagem: textoDoAceite(t.aparelho, t.avaliacao),
            valor_referencia: t.avaliacao.referencia,
            valor_informado: t.avaliacao.valor,
            aceito_por: user.id,
          })) as never,
        )
      }

      // Cobrança Pix pelo valor da LINHA de Pix, não pelo total: numa venda de
      // R$ 5.000 com R$ 1.500 no Pix e o resto no cartão, gerar QR de 5.000
      // cobraria o cliente duas vezes.
      const valorPix = pagamentos
        .filter((p) => p.forma === 'pix')
        .reduce((s, p) => s + (Number(p.valor) || 0), 0)
      if (valorPix > 0.005) {
        try {
          const res = await fetch('/api/payments/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: 'pix',
              valor: valorPix,
              vendaId: primeiraVendaId,
              descricao: `Venda PDV`,
              pagador: clienteSelecionado ? { nome: clienteSelecionado.nome, telefone: clienteSelecionado.telefone ?? undefined } : undefined,
            }),
          })
          const json = await res.json()
          if (res.ok && json.cobranca) setPixCobranca(json.cobranca)
        } catch { /* não bloqueia a venda */ }
      }

      // Reserva consumida pela venda: limpa o vínculo com o lead.
      const reservaIds = carrinho.filter((c) => c.reserva).map((c) => c.item.id)
      if (reservaIds.length) {
        await supabase.from('inventario_unidades')
          .update({ reservado_lead_id: null, reservado_por: null, reservado_em: null, reserva_expira_em: null } as never)
          .in('id', reservaIds)
      }

      // Guarda o contexto da venda para emitir o documento que o vendedor
      // escolher — a emissão deixou de ser automática. Uma venda = N linhas em
      // `vendas`, mas UM documento por emissão: `vendaIds` amarra as duas
      // coisas, e é por ele que o Histórico acha a 2ª via.
      // Guarda o que o cliente paga de fato (com juros), que é o valor do Pix e
      // o que aparece no modal de sucesso.
      setUltimoTotal(resumoPag.cobrado || totais.total)
      setUltimoValorVenda(totais.valorVenda)
      setContexto({
        empresaId,
        vendaIds,
        clienteId: clienteSelecionado?.id ?? null,
        // Aparelhos da troca para os marcadores {{trocas}} — permite emitir o
        // termo de entrega do usado já na tela de sucesso da venda.
        trocas: trocasValidas.map((t) => ({ aparelho: t.aparelho.trim(), imei: t.imei.trim() || null, valor: t.num })),
        itens: [
          ...carrinho.map((c) => ({
            descricao: c.item.produto_nome,
            imei: c.item.imei ?? c.item.numero_serie,
            valor: c.item.preco_venda ?? 0,
            garantia_dias: c.item.produto_garantia_dias ?? null,
          })),
          // Acessório não tem cadastro de produto — segue o padrão da loja.
          ...acessorios.filter((a) => a.descricao.trim() && a.valor > 0)
            .map((a) => ({ descricao: `Acessório: ${a.descricao.trim()}`, imei: null, valor: a.valor })),
        ],
        // ATENÇÃO: aqui é o DINHEIRO (`total`), de propósito — diferente do
        // `valor_venda` gravado na venda. O contrato é assinado pelo cliente: pôr
        // o preço cheio sem que o documento diga que parte foi paga em aparelho
        // criaria um contrato afirmando que ele pagou algo que não pagou em
        // dinheiro. Para o contrato declarar o preço cheio primeiro precisa existir
        // um marcador de troca no modelo — e o texto da cláusula é do lojista,
        // não do CRM.
        total: totais.total,
        desconto: abatimento,
        forma_pagamento: formaPagamento,
        parcelas,
        criadoPor: user.id,
      })
      setEmitidos([])
      // Com Pix na jogada, o modal do QR toma a frente; sem, mostra o sucesso.
      if (valorPix <= 0.005) setSucessoOpen(true)

      notify.ok(entregaPendente ? 'Venda registrada — pendente de entrega' : 'Venda finalizada')
      setCarrinho([]); setDesconto('')
      setPagamentos([{ id: 'p1', forma: 'dinheiro', valor: 0, parcelas: 1, bandeira: 'visa_master' }])
      setAcessorios([]); setTrocaAtiva(false); setTrocas([{ aparelho: '', imei: '', valor: '' }]); setEntregaPendente(false); setTermoGarantia(false)
      if (valorPix <= 0.005) setClienteSelecionado(null)
      setComanda('')
      router.refresh()
    } catch (e) {
      // Desfaz a tentativa parcial para o operador poder repetir sem estoque/venda presos.
      try {
        if (vendaIds.length) {
          await supabase.from('vendas_pagamentos').delete().in('venda_id', vendaIds)
          await supabase.from('vendas').delete().in('id', vendaIds)
        }
        for (const cl of claimed) {
          await supabase.from('inventario_unidades').update({
            status: cl.statusAnterior,
            cliente_id: null,
            // Lote: devolve o saldo que foi baixado nesta tentativa.
            ...(cl.saldoAnterior != null ? { quantidade: cl.saldoAnterior } : {}),
          } as never).eq('id', cl.id)
        }
      } catch { /* rollback best-effort */ }
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
    const msg = `Olá ${clienteSelecionado.nome}! Segue o Pix para pagamento da sua compra no valor de *${fmt(ultimoTotal || totais.total)}*:\n\n${chave}`
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

  /**
   * Emite o documento escolhido: monta com os dados da venda, arquiva e imprime.
   * A venda já está gravada — falhar aqui não a desfaz.
   */
  async function emitir(doc: { id: number; nome: string }) {
    if (!contexto) return
    setEmitindo(doc.id)
    try {
      const r = await emitirContrato(supabase, {
        ...contexto, documentoId: doc.id, nomeDocumento: doc.nome,
      })
      setEmitindo(null)
      // Recusado: a loja não está identificada. Não há documento a imprimir.
      if (r.bloqueado) { notify.bad('Contrato não emitido', r.bloqueado); return }
      if (r.semModelo) { notify.warn(`"${doc.nome}" não tem conteúdo`, 'Monte o documento em Administração → Documentos'); return }
      if (!r.html) { notify.bad('Não foi possível emitir'); return }
      setEmitidos((e) => [...e, doc.id])
      if (!r.salvo) notify.warn('Documento não foi arquivado', 'Dá para imprimir agora, mas não haverá 2ª via no Histórico')
      // Cadastro incompleto: o contrato imprime o espaço em branco calado, então
      // avisa ANTES de o papel ir para a mão do cliente.
      if (r.faltando?.length) {
        notify.warn('Contrato saiu com campos em branco', 'Falta no cadastro do cliente: ' + r.faltando.join(', ') + '.')
      }
      // O mesmo para a LOJA: contrato que não identifica a vendedora não
      // identifica as partes. Só avisa do que este modelo realmente usa.
      if (r.faltandoLoja?.length) {
        notify.warn('Falta o cadastro da sua loja', 'O contrato pede: ' + r.faltandoLoja.join(', ') + '. Preencha em Administração → Minha empresa.')
      }
      if (!imprimirContratoHTML(r.html)) notify.warn('Permita pop-ups para imprimir')
    } catch (e) {
      setEmitindo(null)
      notify.bad('Erro ao emitir', e instanceof Error ? e.message : undefined)
    }
  }

  /**
   * Documentos que o vendedor pode emitir para a venda que acabou de fechar.
   * A escolha é dele: o CRM não decide qual contrato a loja usa.
   */
  const ListaDocumentos = () => (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Documentos</p>
      {documentos.length === 0 ? (
        <p className="rounded-control border border-line bg-raised px-3 py-2.5 text-[12px] text-ink-2">
          Nenhum documento cadastrado. O dono monta em{' '}
          <strong className="text-ink">Administração → Documentos</strong>.
        </p>
      ) : (
        documentos.map((d) => {
          const feito = emitidos.includes(d.id)
          return (
            <Button key={d.id} variant={feito ? 'outline' : 'primary'} className="w-full justify-start"
              loading={emitindo === d.id} onClick={() => emitir(d)}
              icon={feito ? <Check size={14} strokeWidth={2} /> : <FileText size={14} strokeWidth={1.7} />}>
              {feito ? `${d.nome} — emitir de novo` : `Emitir ${d.nome}`}
            </Button>
          )
        })
      )}
      {documentos.length > 0 && (
        <p className="pt-0.5 text-[11px] text-ink-3">
          O que você emitir fica arquivado: a 2ª via sai do Histórico, idêntica.
        </p>
      )}
    </div>
  )


  return (
    <>
      <Modal
        open={!!pixCobranca}
        onClose={() => { setPixCobranca(null); setClienteSelecionado(null); setContexto(null) }}
        size="sm"
        title={<span className="flex items-center gap-2"><QrCode size={17} strokeWidth={1.7} className="text-ok" /> Pix gerado</span>}
      >
        <div className="space-y-4">
          <div className="rounded-card border border-ok/20 bg-ok-soft p-4 text-center">
            <p className="text-[11px] text-ink-3">Valor a pagar</p>
            <p className="num text-[26px] font-bold tracking-[-0.035em] text-ink">{fmt(ultimoTotal || totais.total)}</p>
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
          {contexto && ListaDocumentos()}
        </div>
      </Modal>

      {/* Item sem preço: confirma em vez de bloquear (brinde e garantia existem). */}
      <ConfirmDialog
        open={confirmarSemPreco}
        onClose={() => setConfirmarSemPreco(false)}
        onConfirm={() => { setConfirmarSemPreco(false); finalizarVenda(true) }}
        title={semPreco.length === 1 ? 'Item sem preço de venda' : 'Itens sem preço de venda'}
        description={
          `${semPreco.map((c) => c.item.produto_nome).join(', ')} — sem preço cadastrado, então entra na venda por R$ 0,00. `
          + `Total a pagar: ${fmt(totais.total)}. Se for brinde ou troca em garantia, siga; senão, cancele e defina o preço no estoque.`
        }
        confirmLabel="Finalizar assim mesmo"
        tone="danger"
      />

      {/* Troca acima da referência: confirmar aqui grava um aceite com nome e
          hora na venda. O texto diz isso — o vendedor precisa saber que está
          assinando, senão o log não significa consentimento. */}
      <ConfirmDialog
        open={confirmarTroca}
        onClose={() => setConfirmarTroca(false)}
        onConfirm={() => { setConfirmarTroca(false); finalizarVenda(true, true) }}
        title={trocasAcima.length === 1 ? 'Troca acima do preço de referência' : 'Trocas acima do preço de referência'}
        description={
          trocasAcima.map((t) =>
            `"${t.aparelho.trim() || 'Aparelho'}": avaliado em ${fmt(t.avaliacao.valor)}, referência ${fmt(t.avaliacao.referencia)}`
            + ` — ${fmt(t.avaliacao.excedente)} a mais (${t.avaliacao.percentual.toFixed(0)}%).`,
          ).join(' ')
          + ' A loja está pagando mais do que o aparelho vale, e isso só aparece no resultado quando ele for revendido.'
          + ' Ao confirmar, fica registrado na venda que você aceitou, com seu nome e a hora.'
        }
        confirmLabel="Estou ciente, finalizar"
        tone="danger"
      />

      {/* Sucesso da venda (não-Pix) — oferece o contrato na hora */}
      <Modal
        open={sucessoOpen}
        onClose={() => { setSucessoOpen(false); setContexto(null); setClienteSelecionado(null) }}
        size="sm"
        title={<span className="flex items-center gap-2"><CheckCircle2 size={17} strokeWidth={1.7} className="text-ok" /> Venda registrada</span>}
      >
        <div className="space-y-4">
          <div className="rounded-card border border-ok/20 bg-ok-soft p-4 text-center">
            <p className="text-[11px] text-ink-3">Recebido do cliente</p>
            <p className="num text-[26px] font-bold tracking-[-0.035em] text-ink">{fmt(ultimoTotal)}</p>
            {ultimoValorVenda > ultimoTotal + 0.005 && (
              <p className="mt-1 text-[11.5px] text-ink-3">
                Venda registrada por <strong className="text-ink">{fmt(ultimoValorVenda)}</strong> — a diferença entrou em aparelho.
              </p>
            )}
          </div>
          {ListaDocumentos()}
          <Button variant="ghost" className="w-full" onClick={() => { setSucessoOpen(false); setContexto(null); setClienteSelecionado(null) }}>
            Nova venda
          </Button>
        </div>
      </Modal>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin sm:px-6 sm:py-6">
        <div className="mx-auto max-w-[1320px]">

        {/* ── AS DUAS ABAS DO PDV ── */}
        <div className="mb-5 flex items-center gap-1 border-b border-line">
          {([
            ['pronta', 'Pronta Entrega', null],
            ['encomenda', 'Encomenda', encomendas.length || null],
          ] as const).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={cn(
                'relative -mb-px flex items-center gap-2 border-b-2 px-3.5 pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors',
                aba === k ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2',
              )}
            >
              {label}
              {n ? (
                <span className={cn(
                  'num rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-bold',
                  // Vermelho só quando há atraso: contador colorido que nunca
                  // muda de cor deixa de ser lido depois da primeira semana.
                  encomendasAtrasadas > 0 ? 'bg-bad-soft text-bad' : 'bg-ink/[0.06] text-ink-2',
                )}>{n}</span>
              ) : null}
            </button>
          ))}
        </div>

        {aba === 'encomenda' ? (
          <div className="mx-auto max-w-[720px] space-y-4">
            <EncomendaForm clientes={clientes} taxas={taxas} />
            <EncomendasAbertas encomendas={encomendas} taxas={taxas} isAdmin={isAdmin} />
          </div>
        ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:[grid-template-columns:1.55fr_1fr]">

          {/* ── ESQUERDA: catálogo ── */}
          <div>
            {reservas.length > 0 && (
              <div className="mb-3 flex items-center gap-1.5">
                {([['estoque', 'Estoque'], ['reservas', `Reservas (${reservas.length})`]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAbaCat(k)}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
                      abaCat === k ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-2 hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="mb-4 flex items-center gap-2">
              <Input
                wrapperClassName="flex-1"
                icon={<ScanBarcode size={17} strokeWidth={1.7} />}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Escaneie o código de barras ou busque um produto…"
                className="h-11 text-[14px]"
              />
            </div>

            {abaCat === 'reservas' && reservas.length > 0 ? (
              <div className="space-y-2.5">
                {reservas.map((r) => {
                  const noCarrinho = carrinho.some((c) => c.item.id === r.id)
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-4">
                      <div className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent">
                        <Package size={18} strokeWidth={1.7} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ink">
                          {r.produto_nome}{r.armazenamento ? ` · ${r.armazenamento}` : ''}{r.cor ? ` · ${r.cor}` : ''}
                        </div>
                        <div className="truncate text-[11.5px] text-ink-3">
                          Reservado para <span className="font-medium text-ink-2">{r.lead_nome}</span> · {horasReserva(r.reserva_expira_em)}
                        </div>
                      </div>
                      <span className="num text-[15px] font-bold text-ink">{fmt(r.preco_venda ?? 0)}</span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          disabled={noCarrinho}
                          icon={noCarrinho ? <CheckCircle2 size={14} strokeWidth={1.7} /> : <Plus size={14} strokeWidth={1.7} />}
                          onClick={() => adicionarItem(r, true)}
                        >
                          {noCarrinho ? 'No carrinho' : 'Vender'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={cancelandoReserva === r.id}
                          onClick={() => cancelarReserva(r.id)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : itensFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-ink-3">
                <ScanBarcode size={38} strokeWidth={1.5} className="mb-3 opacity-40" />
                <p className="text-[13px]">Nenhum produto disponível no estoque</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-3">
                {itensFiltrados.map((item) => {
                  // Lote continua clicável mesmo já no carrinho: clicar soma mais
                  // um. Peça identificada trava, porque só existe uma.
                  const noCarrinho = carrinho.some((c) => c.item.id === item.id)
                  const lote = porQuantidade(item)
                  const travado = noCarrinho && !lote
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={travado}
                      onClick={() => !travado && adicionarItem(item)}
                      className={cn(
                        'rounded-card border bg-card p-4 text-left transition-all',
                        travado ? 'cursor-default border-line opacity-60' : 'border-line hover:border-accent hover:shadow-[0_4px_12px_-6px_rgba(46,92,230,0.25)]',
                      )}
                    >
                      {/* Foto da unidade quando existe; senão a do modelo; senão o ícone. */}
                      <div className="mb-3 grid h-11 w-11 place-items-center overflow-hidden rounded-control bg-ink/[0.04] text-ink-3">
                        {fotoDoItem(item)
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={fotoDoItem(item)!} alt="" className="h-full w-full object-cover" />
                          : <Package size={20} strokeWidth={1.7} />}
                      </div>
                      <div className="min-h-[36px] text-[13px] font-semibold leading-[1.3] text-ink">
                        {item.produto_nome}
                        {item.armazenamento && <span className="text-ink-3"> · {item.armazenamento}</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-3">
                        {item.cor ?? item.marca_nome}{item.bateria ? ` · bateria ${item.bateria}%` : ''}
                        {lote && <span className="font-medium text-ink-2"> · {item.quantidade ?? 1} em estoque</span>}
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
          <div className="rounded-card border border-line bg-card p-5 lg:sticky lg:top-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Carrinho</h3>
              <span className="num text-[11px] text-ink-3">{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</span>
            </div>

            {/* Mesa / comanda (Food) */}
            {isFood && (
              <div className="mb-4">
                <Input label="Mesa / Comanda" value={comanda} onChange={(e) => setComanda(e.target.value)} placeholder="Ex: Mesa 5" />
              </div>
            )}

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
                    onClick={() => { setCadastroCliente(true); setShowClientes(false) }}
                    className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-ink transition-colors hover:bg-ink/[0.04]"
                  >
                    <UserPlus size={17} strokeWidth={1.7} />
                    <span className="text-[12.5px] font-semibold">Cadastrar novo cliente</span>
                  </button>
                  {clientesFiltrados.length === 0 && buscaCliente.trim() && (
                    <p className="px-2.5 pb-1.5 text-[11.5px] text-ink-3">
                      Nenhum cliente com “{buscaCliente.trim()}”.
                    </p>
                  )}
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

            {cadastroCliente && (
              <ClienteModal
                cliente={null}
                isNew
                nomeInicial={buscaCliente.trim()}
                onCreated={(c) => {
                  setClientesNovos((prev) => [c, ...prev])
                  setClienteSelecionado(c)
                  setBuscaCliente('')
                }}
                onClose={() => setCadastroCliente(false)}
              />
            )}

            {/* Itens */}
            <div className="mb-4 flex min-h-[48px] flex-col gap-3">
              {carrinho.length === 0 ? (
                <div className="py-4 text-center text-[13px] text-ink-3">Carrinho vazio — toque num produto para adicionar.</div>
              ) : carrinho.map(({ item, qtd }) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink/[0.04] text-ink-3">
                    <Package size={17} strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{item.produto_nome}</div>
                    {/* Peça identificada não tem quantidade: só existe uma. Lote
                        soma e subtrai até o saldo. */}
                    <div className="mt-1 flex items-center gap-2">
                      <button type="button"
                        onClick={() => (porQuantidade(item) && qtd > 1 ? alterarQtd(item.id, -1) : removerItem(item.id))}
                        aria-label={porQuantidade(item) && qtd > 1 ? 'Diminuir' : 'Remover do carrinho'}
                        className="grid h-8 w-8 place-items-center rounded-[6px] border border-line text-ink transition-colors hover:bg-ink/[0.04] sm:h-[22px] sm:w-[22px]">
                        <Minus size={13} strokeWidth={1.7} />
                      </button>
                      <span className="num text-[12.5px] font-bold text-ink">{qtd}</span>
                      {porQuantidade(item) ? (
                        <button type="button" onClick={() => alterarQtd(item.id, 1)}
                          disabled={qtd >= (item.quantidade ?? 1)}
                          aria-label="Aumentar"
                          className="grid h-8 w-8 place-items-center rounded-[6px] border border-line text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-40 sm:h-[22px] sm:w-[22px]">
                          <Plus size={13} strokeWidth={1.7} />
                        </button>
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-[6px] border border-line text-ink-3 opacity-40 sm:h-[22px] sm:w-[22px]">
                          <Plus size={13} strokeWidth={1.7} />
                        </span>
                      )}
                      {porQuantidade(item) && (
                        <span className="text-[11px] text-ink-3">de {item.quantidade ?? 1} em estoque</span>
                      )}
                    </div>
                  </div>
                  <div className="num text-[13px] font-bold text-ink">{fmt((item.preco_venda ?? 0) * qtd)}</div>
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
              {acessoriosTotal > 0 && (
                <div className="mt-2 flex items-center justify-between"><span className="text-[13px] text-ink-2">Acessórios</span><span className="num text-[13px] font-semibold text-ok">+ {fmt(acessoriosTotal)}</span></div>
              )}
              {trocaNum > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[13px] text-ink-2">
                    Pago em aparelho (troca)
                    {trocasValidas.length > 1 && <span className="text-ink-3"> · {trocasValidas.length} aparelhos</span>}
                  </span>
                  <span className="num text-[13px] font-semibold text-ink-2">− {fmt(trocaNum)}</span>
                </div>
              )}
              <div className="mt-4 flex items-baseline justify-between border-t border-line-soft pt-3">
                <span className="text-[14px] font-semibold text-ink">Total a pagar</span>
                <span className="num text-[28px] font-bold leading-none tracking-[-0.035em] text-ink">{fmt(totais.total)}</span>
              </div>
              {/* Com troca, o que o cliente paga e o que a venda vale são números
                  diferentes. Mostrar os dois evita a leitura de que a loja "perdeu"
                  a diferença. */}
              {trocaNum > 0 && (
                <div className="mt-1.5 text-[11.5px] text-ink-3">
                  Em dinheiro. A venda é registrada por <span className="num font-semibold text-ink-2">{fmt(totais.valorVenda)}</span> — a troca entra como forma de pagamento.
                </div>
              )}
            </div>

            {/* #3 Ofertar acessórios */}
            <div className="mb-4">
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Ofertar acessórios</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {['Kit proteção', 'Película', 'Capinha', 'Fonte', 'Cabo', 'Fone'].map((s) => (
                  <button key={s} type="button" onClick={() => setAcessorios((a) => [...a, { descricao: s, valor: 0 }])}
                    className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent">+ {s}</button>
                ))}
              </div>
              {acessorios.map((ac, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <input value={ac.descricao} onChange={(e) => setAcessorios((a) => a.map((x, idx) => idx === i ? { ...x, descricao: e.target.value } : x))} placeholder="Acessório"
                    className="h-8 min-w-0 flex-1 rounded-control border border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-accent" />
                  <span className="text-[12px] text-ink-3">R$</span>
                  <input type="number" value={ac.valor || ''} onChange={(e) => setAcessorios((a) => a.map((x, idx) => idx === i ? { ...x, valor: Number(e.target.value) || 0 } : x))}
                    className="num h-8 w-[70px] rounded-control border border-line bg-card px-2 text-right text-[12.5px] text-ink outline-none focus:border-accent" />
                  <button type="button" onClick={() => setAcessorios((a) => a.filter((_, idx) => idx !== i))} className="-m-1.5 p-1.5 text-ink-3 hover:text-bad" aria-label="Remover"><Minus size={14} strokeWidth={2} /></button>
                </div>
              ))}
            </div>

            {/* #1 Aparelho na troca */}
            <div className="mb-4 rounded-card border border-line p-3">
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                <input type="checkbox" checked={trocaAtiva} onChange={(e) => setTrocaAtiva(e.target.checked)} className="size-4 accent-accent" /> Aparelho(s) na troca (abatem no total)
              </label>
              {trocaAtiva && (
                <div className="mt-2.5 space-y-2.5">
                  {trocas.map((t, i) => (
                    <div key={i} className="space-y-2 rounded-control border border-line-soft bg-raised p-2">
                      {/* CÓDIGO DA COTAÇÃO — o caminho curto. Preenche aparelho,
                          IMEI e valor com o que foi cotado no atendimento, em vez
                          de o vendedor redigitar o valor do usado na frente do
                          cliente. Os campos abaixo seguem editáveis: cotação é
                          ponto de partida, não camisa de força. */}
                      <div className="flex items-center gap-2">
                        <input
                          value={t.codigo ?? ''}
                          inputMode="numeric"
                          onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void aplicarCodigoTroca(i, e.currentTarget.value) } }}
                          onBlur={(e) => { if (e.target.value && t.cotacaoNumero == null) void aplicarCodigoTroca(i, e.target.value) }}
                          placeholder="Código da cotação"
                          aria-label={`Código da cotação do aparelho ${i + 1}`}
                          className="num h-9 w-[150px] flex-none rounded-control border border-dashed border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-solid focus:border-accent" />
                        {buscandoCodigo === i
                          ? <span className="text-[11.5px] text-ink-3">buscando…</span>
                          : t.cotacaoNumero != null && (
                            <span className={cn('text-[11.5px] font-medium', t.cotacaoJaUsada ? 'text-bad' : 'text-ok')}>
                              {t.cotacaoJaUsada ? `#${t.cotacaoNumero} já usada` : `#${t.cotacaoNumero} aplicada`}
                            </span>
                          )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input value={t.aparelho}
                          onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, aparelho: e.target.value } : x)))}
                          placeholder={`Aparelho ${i + 1} (ex.: iPhone 12 64GB Preto)`}
                          className="h-9 min-w-0 flex-1 rounded-control border border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-accent" />
                        {trocas.length > 1 && (
                          <button type="button" aria-label={`Remover aparelho ${i + 1}`}
                            onClick={() => setTrocas((ts) => ts.filter((_, j) => j !== i))}
                            className="grid h-9 w-9 flex-none place-items-center rounded-control text-ink-3 hover:bg-bad/10 hover:text-bad">
                            <Minus size={15} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={t.imei}
                          onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, imei: e.target.value } : x)))}
                          placeholder="IMEI (opcional)"
                          className="num h-9 w-full rounded-control border border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-accent" />
                        <input type="number" value={t.valor}
                          onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                          placeholder="Valor R$"
                          className="num h-9 w-full rounded-control border border-line bg-card px-2.5 text-right text-[12.5px] text-ink outline-none focus:border-accent" />
                      </div>

                      {/* Referência do modelo e o quanto o valor passou dela. O
                          vendedor vê ANTES de fechar, não depois. */}
                      {(() => {
                        const a = avaliacoesTroca[i]
                        if (!a?.referencia) {
                          return t.aparelho.trim() ? (
                            <p className="mt-1.5 text-[11px] text-ink-3">Sem preço de referência para este modelo na tabela.</p>
                          ) : null
                        }
                        const av = a.avaliacao
                        return (
                          <p className={cn('mt-1.5 text-[11px]', av?.exigeAceite ? 'font-medium text-bad' : 'text-ink-3')}>
                            Referência {fmt(a.referencia)}
                            {av && av.excedente > 0 && (
                              <> · {fmt(av.excedente)} acima ({av.percentual.toFixed(0)}%)
                                {av.exigeAceite ? ' — vai pedir confirmação' : ''}</>
                            )}
                            {av && av.excedente < 0 && <> · {fmt(-av.excedente)} abaixo — margem para a loja</>}
                          </p>
                        )
                      })()}
                    </div>
                  ))}

                  <button type="button"
                    onClick={() => setTrocas((ts) => [...ts, { aparelho: '', imei: '', valor: '' }])}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line text-[12.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent">
                    <Plus size={14} strokeWidth={1.9} /> Outro aparelho na troca
                  </button>

                  {/* O vendedor precisa saber, ANTES de fechar, que a comissão
                      depende dele trazer o aparelho — senão descobre depois, no
                      ranking, sem entender por quê. */}
                  <p className="text-[11px] text-ink-3">
                    Cada aparelho entra no estoque como uma unidade <strong className="font-semibold text-warn">pendente</strong>, no seu nome,
                    com o IMEI e o custo dele. A soma abate no total.
                    Comissão e ranking só contam esta venda quando alguém confirmar a chegada no Estoque.
                  </p>
                </div>
              )}
            </div>

            {/* #2 Entrega pendente */}
            <label className="mb-2 flex items-center gap-2 rounded-control border border-line px-3 py-2 text-[12.5px] text-ink-2">
              <input type="checkbox" checked={entregaPendente} onChange={(e) => setEntregaPendente(e.target.checked)} className="size-4 accent-accent" />
              Entrega pendente — baixar depois no Histórico
            </label>

            <label className="mb-4 flex items-start gap-2 rounded-control border border-line px-3 py-2 text-[12.5px] text-ink-2">
              <input type="checkbox" checked={termoGarantia} onChange={(e) => setTermoGarantia(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
              <span>
                Termo de garantia a assinar
                <span className="block text-[11px] text-ink-3">Fica pendente em Garantia até o termo assinado ser anexado. Não afeta o faturamento.</span>
              </span>
            </label>

            {/* ── Formas de pagamento (várias na mesma venda) ── */}
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {pagamentos.length > 1 ? 'Formas de pagamento' : 'Forma de pagamento'}
              </span>
              {resumoPag.juros > 0 && (
                <span className="text-[11px] text-ink-3">juros {fmt(resumoPag.juros)}</span>
              )}
            </div>

            <div className="mb-3 space-y-2">
              {pagamentos.map((p) => {
                const opcoesParcela = parcelasDisponiveis(p, taxas)
                const comJuros = valorComJuros(p, taxas)
                return (
                  <div key={p.id} className="rounded-control border border-line p-2.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {FORMAS_PAG.map((pg) => {
                        const Icon = pg.icon
                        return (
                          <button key={pg.key} type="button"
                            onClick={() => mudarPagamento(p.id, { forma: pg.key, parcelas: 1 })}
                            className={cn('flex items-center gap-2 rounded-control border px-2.5 py-2 transition-all',
                              p.forma === pg.key ? 'border-ink/30 bg-ink/[0.05] text-ink' : 'border-line text-ink-2 hover:bg-ink/[0.03]')}>
                            <Icon size={15} strokeWidth={1.7} />
                            <span className="text-[12.5px] font-semibold">{pg.label}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[12px] text-ink-3">R$</span>
                      <input type="number" value={p.valor || ''}
                        onChange={(e) => mudarPagamento(p.id, { valor: Number(e.target.value) || 0 })}
                        placeholder="0,00"
                        className="num h-9 min-w-0 flex-1 rounded-control border border-line bg-card px-2.5 text-right text-[13px] font-semibold text-ink outline-none focus:border-accent" />
                      {pagamentos.length > 1 && (
                        <button type="button" aria-label="Remover forma de pagamento"
                          onClick={() => removerPagamento(p.id)}
                          className="grid h-9 w-9 flex-none place-items-center rounded-control text-ink-3 hover:bg-bad/10 hover:text-bad">
                          <Minus size={15} strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    {p.forma === 'credito' && (
                      <div className="mt-2 flex gap-1.5">
                        {(['visa_master', 'outros'] as const).map((b) => (
                          <button key={b} type="button"
                            onClick={() => mudarPagamento(p.id, { bandeira: b })}
                            className={cn('flex-1 rounded-control border py-1 text-[11px] font-medium transition-all',
                              (p.bandeira ?? 'visa_master') === b ? 'border-ink/30 bg-ink/[0.05] text-ink' : 'border-line text-ink-2 hover:bg-ink/[0.03]')}>
                            {b === 'visa_master' ? 'Visa / Master' : 'Outros'}
                          </button>
                        ))}
                      </div>
                    )}

                    {FORMAS_PARCELAVEIS.includes(p.forma) && (
                      <>
                        <div className="mt-2 grid grid-cols-6 gap-1">
                          {(opcoesParcela.length ? opcoesParcela : [1, 2, 3, 4, 5, 6]).map((n) => (
                            <button key={n} type="button"
                              onClick={() => mudarPagamento(p.id, { parcelas: n })}
                              className={cn('num rounded-control border py-1.5 text-center text-[12px] font-bold transition-all',
                                (p.parcelas ?? 1) === n ? 'border-ink/30 bg-ink/[0.05] text-ink' : 'border-line text-ink-2 hover:bg-ink/[0.03]')}>
                              {n}x
                            </button>
                          ))}
                        </div>
                        {p.valor > 0 && comJuros > p.valor && (
                          <div className="mt-1.5 text-[11px] text-ink-3">
                            {p.parcelas ?? 1}× de <span className="num font-semibold text-ink-2">{fmt(comJuros / (p.parcelas ?? 1))}</span>
                            {' '}· cobra {fmt(comJuros)} com juros
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Quanto falta é a informação que o caixa olha ao dividir. */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" onClick={adicionarPagamento}
                className="flex items-center gap-1.5 rounded-control border border-dashed border-line px-3 py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent">
                <Plus size={14} strokeWidth={1.9} /> Outra forma
              </button>
              {totais.total > 0 && !resumoPag.fechado && (
                <span className={cn('text-[12px] font-semibold', resumoPag.falta > 0 ? 'text-bad' : 'text-warn')}>
                  {resumoPag.falta > 0 ? `Falta ${fmt(resumoPag.falta)}` : `Passou ${fmt(-resumoPag.falta)}`}
                </span>
              )}
            </div>

            <Button
              size="lg"
              className="w-full"
              loading={finalizando}
              disabled={carrinho.length === 0}
              onClick={() => finalizarVenda()}
              icon={!finalizando ? <CheckCircle2 size={19} strokeWidth={1.7} /> : undefined}
            >
              {finalizando ? 'Finalizando…' : `Finalizar venda · ${fmt(resumoPag.cobrado || totais.total)}`}
            </Button>
          </div>
        </div>
        )}
        </div>
      </div>
    </>
  )
}
