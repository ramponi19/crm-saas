'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Modal, Input, Select, Textarea, Button, notify } from '@/components/ui'

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
  const { empresa } = useEmpresa()
  const [clienteId, setClienteId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [produto, setProduto] = useState('')
  const [custo, setCusto] = useState('')
  const [valorVenda, setValorVenda] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!produto.trim()) { notify.warn('Informe o produto a encomendar'); return }
    if (!empresa?.id) { notify.bad('Empresa não carregada'); return }
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const cliNome = clienteId ? (clientes.find((c) => String(c.id) === clienteId)?.nome ?? '') : clienteNome.trim()

    const { data: pedido, error: e1 } = await supabase.from('pedidos_compra').insert({
      empresa_id: empresa.id,
      fornecedor_id: fornecedorId ? Number(fornecedorId) : null,
      descricao: `Encomenda: ${produto.trim()}${cliNome ? ` — ${cliNome}` : ''}`,
      valor_total: Number(custo) || 0,
      status: 'aberto',
      usuario_id: user?.id ?? null,
      data_pedido: new Date().toISOString(),
      observacoes: obs.trim() || null,
    } as never).select('id').single()

    const { error: e2 } = await supabase.from('vendas').insert({
      empresa_id: empresa.id,
      valor_venda: Number(valorVenda) || 0,
      status: 'encomenda',
      cliente_id: clienteId ? Number(clienteId) : null,
      vendedor_id: user?.id ?? null,
      canal_venda: 'encomenda',
      data_venda: new Date().toISOString(),
      pedido_compra_id: (pedido as { id?: number } | null)?.id ?? null,
      observacoes: `Encomenda: ${produto.trim()}.${obs.trim() ? ' ' + obs.trim() : ''}${cliNome && !clienteId ? ` Cliente: ${cliNome}.` : ''}`,
    } as never)

    setSalvando(false)
    if (e1 || e2) { notify.bad('Erro ao lançar encomenda'); return }
    notify.ok('Encomenda lançada', 'Pedido de compra criado + venda pendente registrada')
    onClose(); router.refresh()
  }

  return (
    <Modal open onClose={onClose} title="Venda por encomenda" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button onClick={salvar} loading={salvando}>Lançar encomenda</Button>
    </>}>
      <div className="space-y-3.5">
        <p className="rounded-control bg-accent-soft px-3 py-2 text-[12px] text-ink-2">
          Produto que não tem em estoque. Ao lançar, o <strong className="text-ink">pedido de compra</strong> é criado automaticamente e a venda fica <strong className="text-ink">pendente</strong> até você finalizar quando o produto chegar.
        </p>

        <Select label="Cliente (opcional)" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">— Cliente novo / avulso —</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        {!clienteId && <Input label="Nome do cliente" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Se não estiver cadastrado" />}

        <Input label="Produto a encomendar" value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex.: iPhone 15 Pro 256GB Titânio" />

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
    </Modal>
  )
}
