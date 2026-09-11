'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { ChevronDown, Plus, UserPlus } from 'lucide-react'
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
 * ══ O QUE MUDOU NA REGRA ═══════════════════════════════════════════════════
 *
 * Três coisas que as encomendas reais da JM mostraram estar faltando:
 *
 *  1. PRAZO em coluna (`vendas.previsao_entrega`), não em texto livre. A #37
 *     dizia "Entregar hoje" — escrito em 21/08. Texto não vira alerta.
 *  2. CUSTO como ESCOLHA, não como campo que dá para pular sem perceber. As
 *     três reais estavam com custo 0 → margem de 100% no relatório.
 *  3. SINAL registrado em `vendas_pagamentos` no ato. Antes o dinheiro que o
 *     cliente adiantava não existia em lugar nenhum do sistema.
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

export function EncomendaForm({ clientes, fornecedores, isAdmin }: {
  clientes: Cli[]; fornecedores: Forn[]; isAdmin: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const { resolverEmpresaId } = useEmpresa()

  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState('')
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
  const [custoConhecido, setCustoConhecido] = useState<boolean | null>(null)
  const [custo, setCusto] = useState('')
  const [prazo, setPrazo] = useState('')
  const [sinal, setSinal] = useState('')
  const [formaSinal, setFormaSinal] = useState('pix')
  const [fornecedorId, setFornecedorId] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  const especif = [capacidade, cor].filter(Boolean).join(' ')
  const vVenda = Number(valorVenda) || 0
  const vSinal = Number(sinal) || 0
  const falta = Math.max(0, vVenda - vSinal)

  async function escolherProduto(p: { id: number; nome: string; preco: number | null }) {
    setProduto(p.nome); setProdutoId(p.id); setCor(''); setCapacidade('')
    if (!valorVenda && p.preco) setValorVenda(String(p.preco))
    const { data } = await supabase.from('produtos').select('cores, armazenamentos').eq('id', p.id).maybeSingle()
    setCoresDisp(data?.cores ?? []); setArmazDisp(data?.armazenamentos ?? [])
  }

  function limpar() {
    setClienteId(''); setProduto(''); setProdutoId(null); setCor(''); setCapacidade('')
    setCoresDisp([]); setArmazDisp([]); setValorVenda(''); setCustoConhecido(null); setCusto('')
    setPrazo(''); setSinal(''); setFormaSinal('pix'); setFornecedorId(''); setObs('')
  }

  async function salvar() {
    // Cliente é obrigatório na encomenda: o produto vai ser comprado por causa
    // dele e alguém precisa avisá-lo quando chegar. Encomenda sem contato é
    // encomenda que fica encalhada na prateleira.
    if (!clienteId) { notify.warn('Selecione o cliente', 'Cadastre-o aqui mesmo se ainda não estiver no sistema.'); return }
    if (!produto.trim()) { notify.warn('Informe o produto a encomendar'); return }
    /**
     * O PREÇO DE VENDA É OBRIGATÓRIO — e aqui é bloqueio, não aviso.
     *
     * Uma encomenda entrou com o campo vazio e virou venda de R$ 0,00. Pior: uma
     * das reais da JM saiu com R$ 7,60 num iPhone 17 Pro Max — dígito trocado,
     * ninguém viu. Diferente do custo, que às vezes só aparece com a nota do
     * fornecedor, o preço cobrado é o que a loja ACABOU de combinar com o
     * cliente. Se ninguém sabe quanto vai cobrar, não há encomenda para lançar.
     */
    if (!(vVenda > 0)) {
      notify.warn('Informe quanto o cliente vai pagar', 'Sem isso a encomenda entra como venda de R$ 0,00.')
      return
    }
    /**
     * CUSTO: ESCOLHA EXPLÍCITA, não campo pulável.
     *
     * `valor_custo` alimenta o lucro da venda. Em branco, a encomenda entra como
     * se o aparelho fosse de graça — margem de 100% num item que a loja ainda
     * vai pagar. As TRÊS encomendas reais da JM estavam assim, todas com 0.
     *
     * O aviso antigo não resolveu porque some sozinho. Agora é preciso dizer
     * "ainda não sei" — o que é uma resposta legítima (a nota do fornecedor às
     * vezes chega depois) e fica registrada na lista até alguém preencher.
     */
    if (custoConhecido === null) {
      notify.warn('Falta o custo de compra', 'Informe o valor ou marque "ainda não sei" — sem isso o lucro sai errado.')
      return
    }
    if (custoConhecido && !(Number(custo) > 0)) {
      notify.warn('Informe o custo de compra', 'Ou marque "ainda não sei" para preencher quando a nota chegar.')
      return
    }
    if (vSinal > vVenda) {
      notify.warn('Sinal maior que o valor da venda', 'Confira os dois números.')
      return
    }

    const empresaId = await resolverEmpresaId()
    if (!empresaId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const cliNome = listaClientes.find((c) => String(c.id) === clienteId)?.nome ?? ''
    const vCusto = custoConhecido ? Number(custo) || 0 : 0

    const { data: pedido, error: e1 } = await supabase.from('pedidos_compra').insert({
      empresa_id: empresaId,
      fornecedor_id: fornecedorId ? Number(fornecedorId) : null,
      descricao: `Encomenda: ${produto.trim()}${especif ? ` ${especif}` : ''}${cliNome ? ` — ${cliNome}` : ''}`,
      valor_total: vCusto,
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
      // Agora VAI para a venda, não só para o pedido: é daqui que sai o lucro.
      valor_custo: vCusto,
      status: 'encomenda',
      cliente_id: Number(clienteId),
      vendedor_id: user?.id ?? null,
      canal_venda: 'encomenda',
      data_venda: new Date().toISOString(),
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
     * O SINAL entra como pagamento da venda pendente.
     *
     * Não é faturamento — a venda só conta quando é entregue. Mas o dinheiro já
     * está no caixa, e antes disto ele não existia em lugar nenhum: o vendedor
     * escrevia "pagou 500 de sinal" na observação e a conferência do dia não
     * batia. `vendas_pagamentos` é 1:N, então o resto entra na entrega.
     *
     * Se este insert falhar, a encomenda FICA: desfazer uma venda válida por
     * causa do sinal seria trocar um problema pequeno por um grande. O aviso
     * diz o que fazer.
     */
    if (vSinal > 0) {
      const { error: e3 } = await supabase.from('vendas_pagamentos').insert({
        empresa_id: empresaId,
        venda_id: (venda as { id: number }).id,
        forma_pagamento: formaSinal,
        valor_pago: vSinal,
      } as never)
      if (e3) notify.warn('Encomenda lançada, mas o sinal não foi registrado', 'Lance o pagamento manualmente.')
    }

    setSalvando(false)
    notify.ok(
      'Encomenda lançada',
      falta > 0.005 ? `Falta receber ${formatCurrency(falta)} na entrega.` : 'Pedido de compra criado + venda pendente.',
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

        <ProdutoAutocomplete label="Produto a encomendar" value={produto}
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

        <Input label="Venda — quanto o cliente paga (R$)" type="number" required
          value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} placeholder="0,00" />

        {/* CUSTO: a pergunta vem antes do campo, e não dá para atravessar. */}
        <div className="rounded-control border border-line-soft bg-bg p-3">
          <p className="text-[12px] font-medium text-ink-2">Custo de compra</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setCustoConhecido(true)}
              className={`h-8 rounded-control px-3 text-[12px] font-semibold transition-colors ${
                custoConhecido === true ? 'bg-ink text-white' : 'border border-line bg-card text-ink-2 hover:bg-line-soft'}`}>
              Sei o valor
            </button>
            <button type="button" onClick={() => { setCustoConhecido(false); setCusto('') }}
              className={`h-8 rounded-control px-3 text-[12px] font-semibold transition-colors ${
                custoConhecido === false ? 'bg-ink text-white' : 'border border-line bg-card text-ink-2 hover:bg-line-soft'}`}>
              Ainda não sei
            </button>
          </div>
          {custoConhecido === true && (
            <div className="mt-2.5">
              <Input type="number" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" autoFocus />
            </div>
          )}
          {custoConhecido === false && (
            <p className="mt-2 text-[11px] text-warn">
              A encomenda fica marcada como <strong>sem custo</strong> na lista até alguém preencher — o lucro dela sai como 100% enquanto isso.
            </p>
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

        {/* SINAL: opcional. Quem não pegou sinal deixa em branco e segue. */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sinal pago agora (opcional)" type="number" value={sinal}
            onChange={(e) => setSinal(e.target.value)} placeholder="0,00" />
          {vSinal > 0 && (
            <Select label="Forma do sinal" value={formaSinal} onChange={(e) => setFormaSinal(e.target.value)}>
              {FORMAS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          )}
        </div>
        {vSinal > 0 && vVenda > 0 && (
          <p className="-mt-1 text-[12px] text-ink-2">
            Falta receber na entrega: <strong className="num text-ink">{formatCurrency(falta)}</strong>
          </p>
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
