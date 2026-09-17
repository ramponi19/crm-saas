'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { ChevronDown, MapPin, Plus, Smartphone, Trash2, UserPlus } from 'lucide-react'
import { Input, Select, Textarea, Button, notify } from '@/components/ui'
import ClienteModal from '@/app/(dashboard)/clientes/components/cliente-modal'
import { formatCurrency } from '@/lib/utils'
import { parcelasDisponiveis, valorComJuros, type Taxa } from '@/lib/pdv-pagamentos'
import { EncomendaItens, itemVazio, itensValidos, descreverItem, type ItemEncomenda } from './encomenda-itens'

interface Cli { id: number; nome: string }

/** Aparelho recebido como entrada. `valor` fica string porque vem de <input>. */
interface AparelhoEntrada { aparelho: string; imei: string; valor: string }

/**
 * LANÇAR UMA ENCOMENDA — o formulário que mora na aba, não num modal.
 *
 * ══ POR QUE SAIU DO MODAL ══════════════════════════════════════════════════
 *
 * O modal fechava e a encomenda sumia de vista: quem lançava não via a lista de
 * pendências que acabava de aumentar. Aqui o formulário recolhe para cima da
 * própria lista — lançou, fechou, e a encomenda nova está na tela.
 *
 * ══ OS CAMPOS ══════════════════════════════════════════════════════════════
 *
 * A ordem e o conjunto vieram do dono (15/09/2026), que listou o que a loja
 * precisa ter na mão ao encomendar: cliente, endereço, produto, capacidade,
 * cor, total, entrada, restante, à vista ou parcelado, prazo e vendedor.
 *
 * ⚠️ NÃO TEM CAMPO DE CUSTO, e isso é escolha, não esquecimento. O custo é
 * informação do dono, não de quem atende o balcão — e o vendedor não sabe por
 * quanto a loja vai comprar. Ele continua editável no lápis da lista de
 * encomendas em aberto, que é onde o aviso "sem custo" aparece e onde quem
 * define preço de compra vai corrigir.
 */

const FORMAS = [
  { key: 'pix', label: 'PIX' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'link', label: 'Link' },
  { key: 'aparelho', label: 'Aparelho semi-novo' },
]

/** `YYYY-MM-DD` de hoje + n dias, no fuso local (nada de toISOString aqui). */
function emDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Endereço em uma linha, pulando o que o cadastro não tem. */
function umaLinha(c: Record<string, string | null> | null): string {
  if (!c) return ''
  const rua = [c.endereco, c.numero].filter(Boolean).join(', ')
  const compl = c.complemento ? `(${c.complemento})` : ''
  const cidade = [c.cidade, c.estado].filter(Boolean).join('/')
  return [rua, compl, c.bairro, cidade, c.cep].filter(Boolean).join(' · ')
}

export function EncomendaForm({ clientes, taxas = [] }: {
  clientes: Cli[]; taxas?: Taxa[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const { resolverEmpresaId } = useEmpresa()

  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [enderecoDe, setEnderecoDe] = useState<{ id: string; texto: string } | null>(null)
  const [cadastroAberto, setCadastroAberto] = useState(false)
  /** Clientes criados aqui: a prop vem do servidor e só muda no refresh. */
  const [clientesNovos, setClientesNovos] = useState<Cli[]>([])
  const listaClientes = [...clientesNovos, ...clientes.filter((c) => !clientesNovos.some((n) => n.id === c.id))]
  const [itens, setItens] = useState<ItemEncomenda[]>([itemVazio()])
  const [entrada, setEntrada] = useState('')
  const [formaEntrada, setFormaEntrada] = useState('pix')
  const [pagamento, setPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const [parcelas, setParcelas] = useState(2)
  const [aparelhos, setAparelhos] = useState<AparelhoEntrada[]>([{ aparelho: '', imei: '', valor: '' }])
  const [prazo, setPrazo] = useState('')
  const [obs, setObs] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [salvando, setSalvando] = useState(false)

  /** So vale o endereco do cliente que esta selecionado agora. */
  const endereco = enderecoDe?.id === clienteId ? enderecoDe.texto : null
  /** O total e a SOMA dos itens: com varios produtos, digitar a mao seria
   *  convidar a divergencia que ninguem acha depois. */
  const validos = itensValidos(itens)
  const vVenda = validos.reduce((s, i) => s + (Number(i.valor) || 0), 0)

  /**
   * A entrada pode vir em dinheiro OU em aparelho — às vezes nos dois.
   *
   * Quando o cliente entrega um semi-novo, o valor avaliado abate do total do
   * mesmo jeito que o PIX abateria: para a conta do restante, dá na mesma.
   * A diferença aparece depois — o aparelho vira uma unidade no estoque.
   */
  const aparelhosValidos = aparelhos.filter((a) => (Number(a.valor) || 0) > 0)
  const vAparelhos = aparelhosValidos.reduce((s, a) => s + (Number(a.valor) || 0), 0)
  const vDinheiro = formaEntrada === 'aparelho' ? 0 : Number(entrada) || 0
  const vEntrada = vDinheiro + vAparelhos

  /**
   * Os aparelhos ficam escritos na observação da venda.
   *
   * É o único lugar onde eles existem — não entram no estoque (ver o bloco na
   * gravação). Sem isto, o abatimento apareceria como "troca R$ 2.000" sem
   * dizer troca de quê, e daqui a três meses ninguém saberia qual aparelho foi.
   */
  const textoAparelhos = aparelhosValidos.length === 0 ? '' :
    ` Entrada em aparelho: ${aparelhosValidos.map((a) =>
      `${a.aparelho.trim() || 'aparelho'}${a.imei.trim() ? ` (IMEI ${a.imei.trim()})` : ''} — ${formatCurrency(Number(a.valor) || 0)}`,
    ).join('; ')}.`
  const restante = Math.max(0, vVenda - vEntrada)

  /**
   * Parcelas e juros saem das TAXAS CADASTRADAS, não de uma lista fixa.
   *
   * Cada loja fecha sua maquininha com percentuais próprios por bandeira e por
   * número de parcelas. Oferecer 12x quando a loja só tem taxa até 6x é
   * prometer o que o caixa não consegue cobrar.
   */
  const opcoesParcela = parcelasDisponiveis(
    { id: 'enc', forma: 'credito', valor: restante, bandeira: 'visa_master' }, taxas,
  )
  const nParcelas = parcelas
  const totalComJuros = valorComJuros(
    { id: 'enc', forma: 'credito', valor: restante, parcelas: nParcelas, bandeira: 'visa_master' }, taxas,
  )
  const juros = Math.max(0, totalComJuros - restante)

  /** Quem está lançando — vai gravado e aparece na tela para conferência. */
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !vivo) return
      const { data } = await supabase.from('usuarios').select('nome').eq('id', user.id).maybeSingle()
      if (vivo) setVendedor(data?.nome ?? user.email ?? '')
    })()
    return () => { vivo = false }
  }, [supabase])

  /**
   * O endereço vem do cadastro do cliente, não é digitado de novo.
   *
   * Encomenda costuma ser entregue ou retirada, e o endereço errado só aparece
   * na hora ruim. Mostrado aqui para conferir na frente do cliente — quando
   * falta, o aviso manda completar no cadastro em vez de anotar na observação.
   */
  useEffect(() => {
    if (!clienteId) return
    let vivo = true
    ;(async () => {
      const { data } = await supabase.from('clientes')
        .select('endereco, numero, complemento, bairro, cidade, estado, cep')
        .eq('id', Number(clienteId)).maybeSingle()
      // Guardado COM o id de quem é: trocar de cliente não pode deixar na tela
      // o endereço do anterior enquanto a consulta nova não volta.
      if (vivo) setEnderecoDe({ id: clienteId, texto: umaLinha(data as Record<string, string | null> | null) })
    })()
    return () => { vivo = false }
  }, [clienteId, supabase])

  function limpar() {
    setClienteId(''); setEnderecoDe(null); setItens([itemVazio()]); setEntrada(''); setFormaEntrada('pix')
    setPagamento('a_vista'); setParcelas(2); setPrazo(''); setObs('')
    setAparelhos([{ aparelho: '', imei: '', valor: '' }])
  }

  /**
   * Desfaz o que ESTA tentativa gravou.
   *
   * Sem RPC o lancamento nao e atomico: com tres itens, o terceiro pode falhar
   * com os dois primeiros ja no banco. Deixar meia encomenda seria pior que
   * nao lancar — o cliente some da lista pela metade e ninguem entende.
   */
  async function desfazer(criados: { vendaId: number; pedidoId: number }[]) {
    for (const c of criados) {
      await supabase.from('vendas').delete().eq('id', c.vendaId)
      await supabase.from('pedidos_compra').delete().eq('id', c.pedidoId)
    }
  }

  async function salvar() {
    // Cliente é obrigatório: o produto vai ser comprado por causa dele e alguém
    // precisa avisá-lo quando chegar. Encomenda sem contato encalha na prateleira.
    if (!clienteId) { notify.warn('Selecione o cliente', 'Cadastre-o aqui mesmo se ainda não estiver no sistema.'); return }
    /**
     * CADA ITEM PRECISA DE PRODUTO E PREÇO — e aqui é bloqueio, não aviso.
     *
     * Uma encomenda entrou com o campo vazio e virou venda de R$ 0,00. Pior: uma
     * das reais da JM saiu com R$ 7,60 num iPhone 17 Pro Max — dígito trocado,
     * ninguém viu. O preço cobrado é o que a loja ACABOU de combinar com o
     * cliente: se ninguém sabe quanto vai cobrar, não há encomenda para lançar.
     *
     * Com vários itens, apontar QUAL linha está incompleta evita o vendedor
     * caçar o erro numa lista de cinco produtos.
     */
    if (validos.length === 0) {
      notify.warn('Informe o produto e o preço', 'Cada item da encomenda precisa dos dois.')
      return
    }
    const incompleto = itens.findIndex((i) =>
      (i.produto.trim() || i.valor) && !(i.produto.trim() && (Number(i.valor) || 0) > 0))
    if (incompleto >= 0) {
      notify.warn(`Item ${incompleto + 1} está incompleto`, 'Preencha o produto e o preço, ou remova a linha.')
      return
    }
    if (vEntrada > vVenda) {
      notify.warn('Entrada maior que o total', 'Confira os dois números.')
      return
    }

    const empresaId = await resolverEmpresaId()
    if (!empresaId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const cliNome = listaClientes.find((c) => String(c.id) === clienteId)?.nome ?? ''

    /**
     * UM PAR (pedido de compra + venda) POR ITEM, amarrados pelo mesmo grupo.
     *
     * ══ POR QUE UM PEDIDO POR ITEM, e não um só para a encomenda toda ═══════
     *
     * Porque os itens chegam em datas diferentes. O botão "Chegou" recebe UM
     * pedido e cria UMA unidade reservada; com um pedido só para três aparelhos,
     * receber o primeiro marcaria os três como chegados e criaria uma unidade
     * para três peças. O 1:1 entre venda e pedido é o que deixa cada item andar
     * no seu ritmo.
     *
     * O `grupo_pdv` é o que diz "isto foi UMA encomenda": é ele que junta os
     * itens de volta na lista e o que amarra a entrada ao conjunto. Mesmo padrão
     * que o PDV usa para uma venda de vários itens.
     *
     * ⚠️ Rollback à mão: sem RPC isto não é atômico. Se o segundo item falhar,
     * o primeiro já está gravado — então desfazemos o que esta tentativa criou,
     * em vez de deixar meia encomenda no banco.
     */
    const grupo = crypto.randomUUID()
    const criados: { vendaId: number; pedidoId: number }[] = []

    for (const [n, item] of validos.entries()) {
      const descricao = descreverItem(item)
      const vItem = Number(item.valor) || 0

      const { data: pedido, error: e1 } = await supabase.from('pedidos_compra').insert({
        empresa_id: empresaId,
        // Fornecedor sai do balcão: quem compra define depois, em Compras. O
        // aviso "sem fornecedor" na lista de encomendas é quem cobra isso.
        fornecedor_id: null,
        descricao: `Encomenda: ${descricao}${cliNome ? ` — ${cliNome}` : ''}`,
        // Sem custo no lançamento: quem define preço de compra preenche depois,
        // pelo lápis da lista. O pedido nasce com zero de propósito.
        valor_total: 0,
        status: 'aberto',
        usuario_id: user?.id ?? null,
        data_pedido: new Date().toISOString(),
        observacoes: obs.trim() || null,
      } as never).select('id').single()

      // Sem pedido de compra não há como "Chegou" depois → não cria venda órfã.
      if (e1 || !pedido) {
        await desfazer(criados)
        setSalvando(false); notify.bad(`Erro ao criar o pedido do item ${n + 1}`, e1?.message); return
      }
      const pedidoId = (pedido as { id: number }).id

      const { data: venda, error: e2 } = await supabase.from('vendas').insert({
        empresa_id: empresaId,
        grupo_pdv: grupo,
        valor_venda: vItem,
        status: 'encomenda',
        cliente_id: Number(clienteId),
        vendedor_id: user?.id ?? null,
        canal_venda: 'encomenda',
        data_venda: new Date().toISOString(),
        // O combinado com o cliente, para a entrega já saber o que cobrar.
        forma_pagamento: pagamento,
        parcelas: pagamento === 'parcelado' ? nParcelas : null,
        // O prazo prometido em coluna: é o que vira "3 dias de atraso" na lista.
        previsao_entrega: prazo || null,
        produto_id: item.produtoId,
        pedido_compra_id: pedidoId,
        // A entrada é do CONJUNTO: fica descrita só na primeira venda, que é
        // também onde o pagamento é gravado. Repetir em todas faria três vezes
        // o mesmo aparelho aparecer no histórico.
        observacoes: `Encomenda: ${descricao}.${n === 0 ? textoAparelhos : ''}${obs.trim() ? ' ' + obs.trim() : ''}`,
      } as never).select('id').single()

      if (e2 || !venda) {
        await supabase.from('pedidos_compra').delete().eq('id', pedidoId)
        await desfazer(criados)
        setSalvando(false); notify.bad(`Erro ao lançar o item ${n + 1}`, e2?.message); return
      }
      criados.push({ vendaId: (venda as { id: number }).id, pedidoId })
    }

    const venda = { id: criados[0].vendaId }

    /**
     * A ENTRADA entra como pagamento da venda pendente.
     *
     * Não é faturamento — a venda só conta quando é entregue. Mas o dinheiro já
     * está no caixa, e antes disto ele não existia em lugar nenhum: o vendedor
     * escrevia "pagou 500 de entrada" na observação e a conferência do dia não
     * batia. `vendas_pagamentos` é 1:N, então o restante entra na entrega.
     *
     * Se este insert falhar, a encomenda FICA: desfazer uma venda válida por
     * causa da entrada seria trocar um problema pequeno por um grande.
     */
    const vendaId = (venda as { id: number }).id
    if (vEntrada > 0) {
      const { error: e3 } = await supabase.from('vendas_pagamentos').insert({
        empresa_id: empresaId,
        venda_id: vendaId,
        // Aparelho é pagamento em espécie: entra como `troca`, o mesmo nome que
        // o PDV usa, para o relatório não ter duas palavras para a mesma coisa.
        forma_pagamento: formaEntrada === 'aparelho' ? 'troca' : formaEntrada,
        valor_pago: vEntrada,
      } as never)
      if (e3) notify.warn('Encomenda lançada, mas a entrada não foi registrada', 'Lance o pagamento manualmente.')
    }

    /**
     * O APARELHO DA ENTRADA VIRA ESTOQUE, AMARRADO À ENCOMENDA.
     *
     * ══ POR QUE VOLTOU ════════════════════════════════════════════════════
     *
     * Em 15/09/2026 isto era só registro na observação, por decisão do dono. No
     * dia seguinte ele corrigiu, e a razão é boa: "é dinheiro/entrada da venda".
     * Um aparelho que abateu R$ 2.000 de uma encomenda não é uma anotação — é um
     * bem que entrou na loja e que alguém vai revender.
     *
     * ══ COMO A AMARRAÇÃO FUNCIONA ═════════════════════════════════════════
     *
     * O `grupo_pdv` é o mesmo da encomenda. É ele que responde "de onde veio
     * este aparelho?" e "o que o cliente entregou naquele pedido?" — sem coluna
     * nova e com o mesmo mecanismo que junta os itens da encomenda.
     *
     * `cliente_id` vai junto: se amanhã aparecer defeito oculto, a loja sabe de
     * quem recebeu sem garimpar observação.
     *
     * Entra como `usado` / `tipo: troca` / `status: pendente` — pendente porque
     * ainda não passou pela avaliação técnica que define preço de revenda. É o
     * mesmo estado que a troca do PDV cria, então o estoque não ganha duas
     * espécies de aparelho usado.
     *
     * ⚠️ Falhar aqui NÃO desfaz a encomenda: o aparelho está fisicamente no
     * balcão e a venda é real. O aviso manda dar entrada pelo Estoque.
     */
    if (formaEntrada === 'aparelho' && aparelhosValidos.length > 0) {
      const { error: e4 } = await supabase.from('inventario_unidades').insert(
        aparelhosValidos.map((a) => ({
          empresa_id: empresaId,
          grupo_pdv: grupo,
          cliente_id: Number(clienteId),
          produto_id: null,
          condicao: 'usado',
          tipo: 'troca',
          status: 'pendente',
          usuario_id: user?.id ?? null,
          preco_custo: Number(a.valor) || 0,
          imei: a.imei.trim() || null,
          observacoes: `${a.aparelho.trim() || 'Aparelho recebido'} — entrada da encomenda${cliNome ? ` de ${cliNome}` : ''}.`,
          ativo: true,
        })) as never,
      )
      if (e4) {
        notify.warn(
          aparelhosValidos.length > 1 ? 'Aparelhos não entraram no estoque' : 'Aparelho não entrou no estoque',
          'A encomenda foi lançada. Dê entrada em Estoque.',
        )
      }
    }

    setSalvando(false)
    notify.ok(
      'Encomenda lançada',
      restante > 0.005 ? `Falta receber ${formatCurrency(restante)} na entrega.` : 'Pedido de compra criado + venda pendente.',
    )
    limpar(); setAberto(false); router.refresh()
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-2 rounded-card border border-dashed border-line bg-card px-4 py-3 text-[13px] font-semibold text-ink-2 transition-colors hover:border-accent hover:text-accent"
      >
        <Plus size={16} strokeWidth={2} />
        Nova encomenda
      </button>
    )
  }

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="mb-3.5 flex w-full items-center justify-between text-[13px] font-semibold text-ink"
      >
        Nova encomenda
        <ChevronDown size={16} strokeWidth={2} className="text-ink-3" />
      </button>

      <div className="space-y-3.5">
        <div>
          <Select label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">— Selecione o cliente —</option>
            {listaClientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <button
            type="button"
            onClick={() => setCadastroAberto(true)}
            className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80"
          >
            <UserPlus size={14} strokeWidth={1.9} />
            Cadastrar cliente novo
          </button>
        </div>

        {/* Endereço do cadastro — não se digita de novo, só se confere. */}
        {clienteId && (
          <div className="flex items-start gap-2 rounded-control bg-bg px-3 py-2">
            <MapPin size={14} strokeWidth={1.8} className="mt-[3px] shrink-0 text-ink-3" />
            {endereco ? (
              <span className="text-[12.5px] leading-snug text-ink-2">{endereco}</span>
            ) : (
              <span className="text-[12.5px] leading-snug text-warn">
                Cliente sem endereço no cadastro — complete em Clientes se a encomenda for entregue.
              </span>
            )}
          </div>
        )}

        <EncomendaItens itens={itens} onChange={setItens} />

        {/* O total sai da soma dos itens — nao e digitado. */}
        {vVenda > 0 && (
          <div className="flex items-baseline justify-between rounded-control bg-bg px-3 py-2">
            <span className="text-[12.5px] font-medium text-ink-2">Total a ser pago</span>
            <span className="num text-[17px] font-bold text-ink">{formatCurrency(vVenda)}</span>
          </div>
        )}

        <div>
          <Select label="Entrada" value={formaEntrada} onChange={(e) => setFormaEntrada(e.target.value)}>
            <option value="">— Sem entrada —</option>
            {FORMAS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </Select>

          {formaEntrada && formaEntrada !== 'aparelho' && (
            <div className="mt-2.5">
              <Input type="number" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="0,00" />
            </div>
          )}

          {/**
            * APARELHO COMO ENTRADA.
            *
            * O cliente entrega o usado e leva o novo encomendado — na conta do
            * restante dá no mesmo que ter pago em PIX. A diferença aparece no
            * fechamento: cada aparelho vira uma unidade no estoque, com o valor
            * avaliado como custo, igual à troca do PDV.
            *
            * IMEI aqui não é burocracia: é o que liga o aparelho recebido ao
            * cliente que entregou, e sem ele a unidade entra anônima no estoque.
            */}
          {formaEntrada === 'aparelho' && (
            <div className="mt-2.5 space-y-2">
              {aparelhos.map((a, i) => (
                <div key={i} className="rounded-control border border-line-soft bg-bg p-2.5">
                  <div className="flex items-center gap-2">
                    <Smartphone size={14} strokeWidth={1.8} className="shrink-0 text-ink-3" />
                    <Input wrapperClassName="flex-1" placeholder="Aparelho (ex.: iPhone 13 128GB Azul)"
                      value={a.aparelho}
                      onChange={(e) => setAparelhos((xs) => xs.map((x, j) => j === i ? { ...x, aparelho: e.target.value } : x))} />
                    {aparelhos.length > 1 && (
                      <button type="button" aria-label="Remover aparelho"
                        onClick={() => setAparelhos((xs) => xs.filter((_, j) => j !== i))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:text-bad">
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input placeholder="IMEI" value={a.imei}
                      onChange={(e) => setAparelhos((xs) => xs.map((x, j) => j === i ? { ...x, imei: e.target.value } : x))} />
                    <Input type="number" placeholder="Valor avaliado (R$)" value={a.valor}
                      onChange={(e) => setAparelhos((xs) => xs.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
                  </div>
                </div>
              ))}
              <button type="button"
                onClick={() => setAparelhos((xs) => [...xs, { aparelho: '', imei: '', valor: '' }])}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80">
                <Plus size={13} strokeWidth={2} /> Outro aparelho
              </button>
              {vAparelhos > 0 && (
                <p className="text-[12px] text-ink-2">
                  Entrada em aparelho: <strong className="num text-ink">{formatCurrency(vAparelhos)}</strong>
                </p>
              )}
            </div>
          )}
        </div>

        {/* O restante é a conta que o cliente leva na cabeça — fica na tela. */}
        {vVenda > 0 && (
          <div className="flex items-baseline justify-between rounded-control bg-accent-soft px-3 py-2">
            <span className="text-[12.5px] font-medium text-ink-2">Restante a pagar na entrega</span>
            <span className="num text-[16px] font-bold text-accent">{formatCurrency(restante)}</span>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[12px] font-medium text-ink-2">Como o restante será pago</p>
          <div className="flex gap-2">
            {([['a_vista', 'À vista'], ['parcelado', 'Parcelado']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPagamento(k)}
                className={`h-8 rounded-control px-3.5 text-[12px] font-semibold transition-colors ${
                  pagamento === k ? 'bg-ink text-white' : 'border border-line bg-card text-ink-2 hover:bg-line-soft'}`}>
                {label}
              </button>
            ))}
          </div>
          {pagamento === 'parcelado' && (
            opcoesParcela.length > 0 ? (
              <div className="mt-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {opcoesParcela.map((n) => (
                    <button key={n} type="button" onClick={() => setParcelas(n)}
                      className={`num h-7 w-11 rounded-control border text-[12px] font-bold transition-colors ${
                        nParcelas === n ? 'border-ink/30 bg-ink/[0.06] text-ink' : 'border-line text-ink-2 hover:bg-line-soft'}`}>
                      {n}x
                    </button>
                  ))}
                </div>
                {restante > 0 && (
                  <p className="mt-1.5 text-[12px] text-ink-2">
                    {nParcelas}× de <strong className="num text-ink">{formatCurrency(totalComJuros / nParcelas)}</strong>
                    {juros > 0.005 && (
                      <> · cobra <span className="num">{formatCurrency(totalComJuros)}</span> com a taxa da maquininha</>
                    )}
                  </p>
                )}
              </div>
            ) : (
              // Sem taxa cadastrada não dá para prometer parcela: o número que
              // apareceria aqui seria chute, e quem cobra é o caixa.
              <p className="mt-2 text-[12px] text-warn">
                Nenhuma taxa de parcelamento cadastrada. Configure em Administração → Taxas
                para o sistema calcular as parcelas.
              </p>
            )
          )}
        </div>

        {/* PRAZO: o que transforma a lista em alerta. */}
        <div>
          <Input label="Prazo prometido ao cliente" type="date" value={prazo}
            onChange={(e) => setPrazo(e.target.value)} hint="Em branco, a encomenda aparece como “sem prazo combinado”." />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[3, 7, 15, 30].map((n) => (
              <button key={n} type="button" onClick={() => setPrazo(emDias(n))}
                className="h-7 rounded-control border border-line bg-card px-2.5 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-line-soft">
                {n} dias
              </button>
            ))}
          </div>
        </div>

        {vendedor && (
          <div className="flex items-baseline justify-between rounded-control bg-bg px-3 py-2">
            <span className="text-[12px] text-ink-3">Vendedor</span>
            <span className="text-[12.5px] font-semibold text-ink-2">{vendedor}</span>
          </div>
        )}


        <Textarea label="Observações" rows={2} value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Detalhe combinado com o cliente, referência do fornecedor…" />

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => { limpar(); setAberto(false) }}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Lançar encomenda</Button>
        </div>
      </div>

      {cadastroAberto && (
        <ClienteModal
          cliente={null}
          isNew
          onCreated={(c) => { setClientesNovos((prev) => [c, ...prev]); setClienteId(String(c.id)) }}
          onClose={() => setCadastroAberto(false)}
        />
      )}
    </div>
  )
}
