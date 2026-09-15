'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { ChevronDown, MapPin, Plus, UserPlus } from 'lucide-react'
import { Input, Select, Textarea, Button, notify } from '@/components/ui'
import { ProdutoAutocomplete } from '@/components/modules/leads/produto-autocomplete'
import ClienteModal from '@/app/(dashboard)/clientes/components/cliente-modal'
import { formatCurrency } from '@/lib/utils'

interface Cli { id: number; nome: string }
interface Forn { id: number; nome_fantasia: string }

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

export function EncomendaForm({ clientes, fornecedores, isAdmin }: {
  clientes: Cli[]; fornecedores: Forn[]; isAdmin: boolean
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
  const [produto, setProduto] = useState('')
  const [produtoId, setProdutoId] = useState<number | null>(null)
  const [coresDisp, setCoresDisp] = useState<string[]>([])
  const [armazDisp, setArmazDisp] = useState<string[]>([])
  const [cor, setCor] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [valorVenda, setValorVenda] = useState('')
  const [entrada, setEntrada] = useState('')
  const [formaEntrada, setFormaEntrada] = useState('pix')
  const [pagamento, setPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const [parcelas, setParcelas] = useState('2')
  const [prazo, setPrazo] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [obs, setObs] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [salvando, setSalvando] = useState(false)

  /** So vale o endereco do cliente que esta selecionado agora. */
  const endereco = enderecoDe?.id === clienteId ? enderecoDe.texto : null
  const especif = [capacidade, cor].filter(Boolean).join(' ')
  const vVenda = Number(valorVenda) || 0
  const vEntrada = Number(entrada) || 0
  const restante = Math.max(0, vVenda - vEntrada)
  const nParcelas = Math.max(2, Number(parcelas) || 2)

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

  async function escolherProduto(p: { id: number; nome: string; preco: number | null }) {
    setProduto(p.nome); setProdutoId(p.id); setCor(''); setCapacidade('')
    if (!valorVenda && p.preco) setValorVenda(String(p.preco))
    const { data } = await supabase.from('produtos').select('cores, armazenamentos').eq('id', p.id).maybeSingle()
    setCoresDisp(data?.cores ?? []); setArmazDisp(data?.armazenamentos ?? [])
  }

  function limpar() {
    setClienteId(''); setEnderecoDe(null); setProduto(''); setProdutoId(null); setCor(''); setCapacidade('')
    setCoresDisp([]); setArmazDisp([]); setValorVenda(''); setEntrada(''); setFormaEntrada('pix')
    setPagamento('a_vista'); setParcelas('2'); setPrazo(''); setFornecedorId(''); setObs('')
  }

  async function salvar() {
    // Cliente é obrigatório: o produto vai ser comprado por causa dele e alguém
    // precisa avisá-lo quando chegar. Encomenda sem contato encalha na prateleira.
    if (!clienteId) { notify.warn('Selecione o cliente', 'Cadastre-o aqui mesmo se ainda não estiver no sistema.'); return }
    if (!produto.trim()) { notify.warn('Informe o produto a encomendar'); return }
    /**
     * O TOTAL É OBRIGATÓRIO — e aqui é bloqueio, não aviso.
     *
     * Uma encomenda entrou com o campo vazio e virou venda de R$ 0,00. Pior: uma
     * das reais da JM saiu com R$ 7,60 num iPhone 17 Pro Max — dígito trocado,
     * ninguém viu. O preço cobrado é o que a loja ACABOU de combinar com o
     * cliente: se ninguém sabe quanto vai cobrar, não há encomenda para lançar.
     */
    if (!(vVenda > 0)) {
      notify.warn('Informe o total a ser pago', 'Sem isso a encomenda entra como venda de R$ 0,00.')
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

    const { data: pedido, error: e1 } = await supabase.from('pedidos_compra').insert({
      empresa_id: empresaId,
      fornecedor_id: fornecedorId ? Number(fornecedorId) : null,
      descricao: `Encomenda: ${produto.trim()}${especif ? ` ${especif}` : ''}${cliNome ? ` — ${cliNome}` : ''}`,
      // Sem custo no lançamento: quem define preço de compra preenche depois,
      // pelo lápis da lista. O pedido nasce com zero de propósito.
      valor_total: 0,
      status: 'aberto',
      usuario_id: user?.id ?? null,
      data_pedido: new Date().toISOString(),
      observacoes: obs.trim() || null,
    } as never).select('id').single()

    // Sem pedido de compra não há como "Chegou" depois → não cria venda órfã.
    if (e1 || !pedido) { setSalvando(false); notify.bad('Erro ao criar o pedido de compra', e1?.message); return }
    const pedidoId = (pedido as { id: number }).id

    const { data: venda, error: e2 } = await supabase.from('vendas').insert({
      empresa_id: empresaId,
      valor_venda: vVenda,
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
      produto_id: produtoId,
      pedido_compra_id: pedidoId,
      observacoes: `Encomenda: ${produto.trim()}${especif ? ` ${especif}` : ''}.${obs.trim() ? ' ' + obs.trim() : ''}`,
    } as never).select('id').single()

    if (e2 || !venda) {
      // Venda falhou: remove o pedido recém-criado para não deixar pedido sem venda.
      await supabase.from('pedidos_compra').delete().eq('id', pedidoId)
      setSalvando(false); notify.bad('Erro ao lançar encomenda', e2?.message); return
    }

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
    if (vEntrada > 0) {
      const { error: e3 } = await supabase.from('vendas_pagamentos').insert({
        empresa_id: empresaId,
        venda_id: (venda as { id: number }).id,
        forma_pagamento: formaEntrada,
        valor_pago: vEntrada,
      } as never)
      if (e3) notify.warn('Encomenda lançada, mas a entrada não foi registrada', 'Lance o pagamento manualmente.')
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

        <ProdutoAutocomplete label="Produto" value={produto}
          onChange={(v) => { setProduto(v); setProdutoId(null); setCoresDisp([]); setArmazDisp([]); setCor(''); setCapacidade('') }}
          onSelect={escolherProduto} />

        {(coresDisp.length > 0 || armazDisp.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {armazDisp.length > 0 && (
              <Select label="Capacidade" value={capacidade} onChange={(e) => setCapacidade(e.target.value)}>
                <option value="">Selecionar…</option>
                {armazDisp.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            )}
            {coresDisp.length > 0 && (
              <Select label="Cor" value={cor} onChange={(e) => setCor(e.target.value)}>
                <option value="">Selecionar…</option>
                {coresDisp.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
          </div>
        )}

        <Input label="Total a ser pago (R$)" type="number" required
          value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} placeholder="0,00" />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Entrada (R$)" type="number" value={entrada}
            onChange={(e) => setEntrada(e.target.value)} placeholder="0,00" />
          {vEntrada > 0 && (
            <Select label="Forma da entrada" value={formaEntrada} onChange={(e) => setFormaEntrada(e.target.value)}>
              {FORMAS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
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
            <div className="mt-2.5 flex items-center gap-2">
              <Input type="number" min={2} max={24} value={parcelas}
                onChange={(e) => setParcelas(e.target.value)} wrapperClassName="w-24" />
              <span className="text-[12.5px] text-ink-2">
                parcelas{restante > 0 ? ` de ${formatCurrency(restante / nParcelas)}` : ''}
              </span>
            </div>
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

        {isAdmin && (
          <Select label="Fornecedor (opcional)" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">— Definir depois —</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
          </Select>
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
