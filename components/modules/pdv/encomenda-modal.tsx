'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { UserPlus } from 'lucide-react'
import { Modal, Input, Select, Textarea, Button, notify } from '@/components/ui'
import { ProdutoAutocomplete } from '@/components/modules/leads/produto-autocomplete'
import ClienteModal from '@/app/(dashboard)/clientes/components/cliente-modal'

interface Cli { id: number; nome: string }
interface Forn { id: number; nome_fantasia: string }

/**
 * Venda por encomenda: produto que não tem em estoque. Ao lançar, cria o
 * PEDIDO DE COMPRA (aberto) automaticamente + registra a venda como
 * 'encomenda' (pendente — não conta no faturamento até finalizar).
 * Fornecedor só aparece p/ admin (o vendedor lança sem; o dono atribui depois).
 */
export function EncomendaModal({ clientes, fornecedores, isAdmin, onClose }: {
  clientes: Cli[]; fornecedores: Forn[]; isAdmin: boolean; onClose: () => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const { empresa, resolverEmpresaId } = useEmpresa()
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
  const [custo, setCusto] = useState('')
  const [valorVenda, setValorVenda] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function escolherProduto(p: { id: number; nome: string; preco: number | null }) {
    setProduto(p.nome); setProdutoId(p.id); setCor(''); setCapacidade('')
    if (!valorVenda && p.preco) setValorVenda(String(p.preco))
    const { data } = await supabase.from('produtos').select('cores, armazenamentos').eq('id', p.id).maybeSingle()
    setCoresDisp(data?.cores ?? []); setArmazDisp(data?.armazenamentos ?? [])
  }
  const especif = [capacidade, cor].filter(Boolean).join(' ')

  async function salvar() {
    // Cliente é obrigatório na encomenda: o produto vai ser comprado por causa
    // dele e alguém precisa avisá-lo quando chegar. Encomenda sem contato é
    // encomenda que fica encalhada na prateleira.
    if (!clienteId) { notify.warn('Selecione o cliente', 'Cadastre-o aqui mesmo se ainda não estiver no sistema.'); return }
    if (!produto.trim()) { notify.warn('Informe o produto a encomendar'); return }
    /**
     * O PREÇO DE VENDA É OBRIGATÓRIO — e aqui é bloqueio, não aviso.
     *
     * O teste lançou uma encomenda com o campo vazio e ela entrou como venda de
     * R$ 0,00: o cliente "não paga nada", o faturamento soma zero e o pedido de
     * compra fica com o custo sozinho — prejuízo puro no relatório.
     *
     * Diferente do custo, que às vezes só aparece com a nota do fornecedor: o preço
     * cobrado do cliente é o que a loja ACABOU DE COMBINAR com ele. Se ninguém sabe
     * quanto vai cobrar, não há encomenda para lançar.
     */
    if (!(Number(valorVenda) > 0)) {
      notify.warn('Informe quanto o cliente vai pagar', 'Sem isso a encomenda entra como venda de R$ 0,00.')
      return
    }

    /**
     * CUSTO ZERADO VIRA LUCRO DE 100% — e ninguém vai conferir depois.
     *
     * `valor_custo` alimenta o lucro da venda e o pedido de compra. Sem ele a
     * encomenda entra como se o aparelho fosse de graça: o relatório mostra margem
     * cheia num item que a loja ainda vai pagar. Foi o que aconteceu nas duas
     * encomendas de teste, ambas com valor_total 0,00.
     *
     * AVISO, não bloqueio: às vezes o custo real só chega com a nota do fornecedor,
     * e travar o balcão por um número que ainda não existe seria pior. Mas o
     * vendedor precisa saber o que está deixando em branco.
     */
    if (!(Number(custo) > 0)) {
      notify.warn('Encomenda sem custo de compra', 'O lucro vai aparecer como 100%. Preencha quando souber o valor do fornecedor.')
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
      valor_total: Number(custo) || 0,
      status: 'aberto',
      usuario_id: user?.id ?? null,
      data_pedido: new Date().toISOString(),
      observacoes: obs.trim() || null,
    } as never).select('id').single()

    // Sem pedido de compra não há como "Receber" depois → não cria venda órfã.
    if (e1 || !pedido) { setSalvando(false); notify.bad('Erro ao criar o pedido de compra'); return }

    const { error: e2 } = await supabase.from('vendas').insert({
      empresa_id: empresaId,
      valor_venda: Number(valorVenda) || 0,
      status: 'encomenda',
      cliente_id: Number(clienteId),
      vendedor_id: user?.id ?? null,
      canal_venda: 'encomenda',
      data_venda: new Date().toISOString(),
      produto_id: produtoId,
      pedido_compra_id: (pedido as { id?: number } | null)?.id ?? null,
      observacoes: `Encomenda: ${produto.trim()}${especif ? ` ${especif}` : ''}.${obs.trim() ? ' ' + obs.trim() : ''}`,
    } as never)

    setSalvando(false)
    if (e2) {
      // Venda falhou: remove o pedido recém-criado para não deixar pedido sem venda.
      await supabase.from('pedidos_compra').delete().eq('id', (pedido as { id: number }).id)
      notify.bad('Erro ao lançar encomenda'); return
    }
    notify.ok('Encomenda lançada', 'Pedido de compra criado + venda pendente registrada')
    onClose(); router.refresh()
  }

  // Os dois modais escutam Esc no document, então uma tecla fecharia o de fora
  // junto — e a encomenda já digitada iria embora. Enquanto o cadastro está
  // aberto, fechar o de trás não faz nada.
  const fechar = () => { if (!cadastroAberto) onClose() }

  return (
    <Modal open onClose={fechar} title="Venda por encomenda" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button onClick={salvar} loading={salvando}>Lançar encomenda</Button>
    </>}>
      <div className="space-y-3.5">
        <p className="rounded-control bg-accent-soft px-3 py-2 text-[12px] text-ink-2">
          Produto que não tem em estoque. Ao lançar, o <strong className="text-ink">pedido de compra</strong> é criado automaticamente e a venda fica <strong className="text-ink">pendente</strong> até você finalizar quando o produto chegar.
        </p>

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

        <div className="grid grid-cols-2 gap-3">
          <Input label="Custo (compra) R$" type="number" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
          <Input label="Venda (cliente paga) R$" type="number" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} placeholder="0,00" />
        </div>

        {isAdmin && (
          <Select label="Fornecedor (opcional)" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">— Definir depois —</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
          </Select>
        )}

        <Textarea label="Observações" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Cor, prazo prometido, sinal pago…" />
      </div>

      {cadastroAberto && (
        <ClienteModal
          cliente={null}
          isNew
          onCreated={(c) => { setClientesNovos((prev) => [c, ...prev]); setClienteId(String(c.id)) }}
          onClose={() => setCadastroAberto(false)}
        />
      )}
    </Modal>
  )
}
