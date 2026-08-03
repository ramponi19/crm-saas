'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ShoppingCart, Building2, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/ui'
import { useEmpresa } from '@/lib/empresa-context'
import { formatCurrency } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { Card, StatCard, Modal, Input, Select, Textarea, Button, Badge, EmptyState } from '@/components/ui'

interface Pedido {
  id: number
  descricao: string | null
  valor_total: number | null
  status: string | null
  data_pedido: string | null
  created_at: string | null
  observacoes: string | null
  fornecedor_id: number | null
  fornecedores: { nome_fantasia: string; contato: string | null; telefone: string | null } | null
}
interface Fornecedor {
  id: number
  nome_fantasia: string
  razao_social: string | null
  cnpj: string | null
  contato: string | null
  telefone: string | null
  email: string | null
  created_at: string | null
}
interface Props { pedidos: Pedido[]; fornecedores: Fornecedor[]; isAdmin?: boolean }

const STATUS_PEDIDO: Record<string, { label: string; tone: 'acc' | 'ok' | 'warn' | 'neutro' }> = {
  aberto:      { label: 'Aberto',      tone: 'acc'    },
  em_transito: { label: 'Em trânsito', tone: 'warn'   },
  recebido:    { label: 'Recebido',    tone: 'ok'     },
  cancelado:   { label: 'Cancelado',   tone: 'neutro' },
}

const fmtBRL = (v: number | null) => v ? formatCurrency(v) : '—'

function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function getInitials(name: string) {
  return name.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

const FORM_VAZIO = { nome_fantasia: '', razao_social: '', cnpj: '', contato: '', telefone: '', email: '' }
const PEDIDO_VAZIO = { descricao: '', fornecedor_id: '', valor_total: '', data_pedido: '', observacoes: '', status: 'aberto' }

export default function ComprasView({ pedidos: pedidosInit, fornecedores: fornecedoresInit, isAdmin = false }: Props) {
  const { empresa } = useEmpresa()
  const empresaId = empresa?.id
  const router = useRouter()
  const [recebendo, setRecebendo] = useState<number | null>(null)
  const [pedidos,        setPedidos]        = useState(pedidosInit)
  const [fornecedores,   setFornecedores]   = useState(fornecedoresInit)
  const [modalFornecedor, setModalFornecedor] = useState(false)
  const [modalPedido,    setModalPedido]    = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (modalFornecedor) setModalFornecedor(false)
      else if (modalPedido) setModalPedido(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modalFornecedor, modalPedido])
  const [form,           setForm]           = useState(FORM_VAZIO)
  const [formPedido,     setFormPedido]     = useState(PEDIDO_VAZIO)
  const [salvando,       setSalvando]       = useState(false)
  const [salvandoPedido, setSalvandoPedido] = useState(false)
  const [erro,           setErro]           = useState<string | null>(null)
  const [erroPedido,     setErroPedido]     = useState<string | null>(null)

  async function salvarPedido() {
    if (!empresaId) { setErroPedido('Empresa não encontrada'); return }
    if (!formPedido.descricao.trim()) { setErroPedido('Descrição é obrigatória'); return }
    if (formPedido.valor_total && isNaN(parseFloat(formPedido.valor_total.replace(',', '.')))) {
      setErroPedido('Valor total inválido'); return
    }
    setSalvandoPedido(true)
    setErroPedido(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('pedidos_compra')
      .insert({
        empresa_id:    empresaId,
        descricao:     formPedido.descricao.trim(),
        fornecedor_id: formPedido.fornecedor_id ? Number(formPedido.fornecedor_id) : null,
        valor_total:   formPedido.valor_total ? parseFloat(formPedido.valor_total.replace(',', '.')) : null,
        data_pedido:   formPedido.data_pedido || null,
        observacoes:   formPedido.observacoes.trim() || null,
        status:        formPedido.status,
      })
      .select('*, fornecedores(nome_fantasia, contato, telefone)')
      .single()
    if (error) { setErroPedido('Erro ao salvar. Tente novamente.') }
    else { setPedidos(p => [data as Pedido, ...p]); setModalPedido(false); setFormPedido(PEDIDO_VAZIO) }
    setSalvandoPedido(false)
  }

  const stats = {
    abertos:    pedidos.filter(p => p.status === 'aberto').length,
    transito:   pedidos.filter(p => p.status === 'em_transito').length,
    recebidos:  pedidos.filter(p => p.status === 'recebido').length,
    investido:  pedidos.reduce((s, p) => s + (p.valor_total ?? 0), 0),
  }

  function set(k: keyof typeof FORM_VAZIO, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function salvarFornecedor() {
    if (!empresaId) { setErro('Empresa não encontrada'); return }
    if (!form.nome_fantasia.trim()) { setErro('Nome fantasia é obrigatório'); return }
    setSalvando(true)
    setErro(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('fornecedores')
      .insert({
        empresa_id:    empresaId,
        nome_fantasia: form.nome_fantasia.trim(),
        razao_social:  form.razao_social.trim() || null,
        cnpj:          form.cnpj.trim() || null,
        contato:       form.contato.trim() || null,
        telefone:      form.telefone.trim() || null,
        email:         form.email.trim() || null,
        ativo:         true,
      })
      .select()
      .single()

    if (error) {
      setErro('Erro ao salvar. Tente novamente.')
    } else {
      setFornecedores(f => [...f, data as Fornecedor])
      setModalFornecedor(false)
      setForm(FORM_VAZIO)
    }
    setSalvando(false)
  }

  async function receber(pedidoId: number) {
    setRecebendo(pedidoId)
    const r = await fetch('/api/compras/receber', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId }) })
    setRecebendo(null)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Erro ao receber', j.error); return }
    setPedidos(ps => ps.map(p => p.id === pedidoId ? { ...p, status: 'recebido' } : p))
    notify.ok('Pedido recebido', j.encomenda ? 'Unidade reservada no estoque p/ o cliente' : 'Unidade deu entrada no estoque')
    router.refresh()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Compras" />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
        <div className="mx-auto max-w-[1240px] space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            <StatCard bare label="Pedidos abertos" value={stats.abertos} />
            <StatCard bare label="Em trânsito" value={stats.transito} />
            <StatCard bare label="Recebidos no mês" value={stats.recebidos} />
            <StatCard bare label="Investido no mês" value={fmtBRL(stats.investido)} />
          </div>

          {/* Painéis: fornecedores só p/ admin/proprietário */}
          <div className={isAdmin ? 'grid gap-4 lg:grid-cols-[1fr_360px]' : 'grid gap-4'}>

            {/* Pedidos */}
            <Card
              flush
              title="Pedidos de compra"
              actions={
                <Button
                  size="sm"
                  icon={<Plus size={14} strokeWidth={1.7} />}
                  onClick={() => { setFormPedido(PEDIDO_VAZIO); setErroPedido(null); setModalPedido(true) }}
                >
                  Novo pedido
                </Button>
              }
            >
              {pedidos.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={<ShoppingCart size={22} strokeWidth={1.7} />} title="Nenhum pedido" description="Registre seu primeiro pedido de compra." />
                </div>
              ) : (
                <div className="divide-y divide-line-soft">
                  {pedidos.map(p => {
                    const s = STATUS_PEDIDO[p.status ?? ''] ?? { label: p.status ?? '—', tone: 'neutro' as const }
                    return (
                      <div key={p.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.03]">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-ink">{p.descricao ?? `Pedido #${p.id}`}</div>
                          <div className="mt-0.5 truncate text-[11px] text-ink-3">{isAdmin && <>{p.fornecedores?.nome_fantasia ?? '—'} · </>}<span className="num">{fmtData(p.data_pedido ?? p.created_at)}</span></div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="num text-[13px] font-semibold text-ink">{fmtBRL(p.valor_total)}</span>
                          {p.status !== 'recebido' && p.status !== 'cancelado' ? (
                            <button
                              onClick={() => receber(p.id)}
                              disabled={recebendo === p.id}
                              className="flex items-center gap-1 rounded-control border border-line px-2 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-ok hover:text-ok disabled:opacity-50"
                            >
                              <PackageCheck size={13} strokeWidth={1.8} /> Receber
                            </button>
                          ) : (
                            <Badge tone={s.tone}>{s.label}</Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Fornecedores — visível só p/ admin/proprietário */}
            {isAdmin && (
            <Card
              flush
              title="Fornecedores"
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Plus size={14} strokeWidth={1.7} />}
                  onClick={() => { setForm(FORM_VAZIO); setErro(null); setModalFornecedor(true) }}
                >
                  Novo
                </Button>
              }
            >
              {fornecedores.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={<Building2 size={22} strokeWidth={1.7} />} title="Nenhum fornecedor" description="Cadastre seu primeiro fornecedor." />
                </div>
              ) : (
                <div className="divide-y divide-line-soft">
                  {fornecedores.map(f => {
                    const qtd = pedidos.filter(p => p.fornecedor_id === f.id).length
                    return (
                      <div key={f.id} className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.03]">
                        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
                          {getInitials(f.nome_fantasia)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-ink">{f.nome_fantasia}</div>
                          <div className="truncate text-[11px] text-ink-3">{f.contato ?? '—'}{f.telefone ? ` · ${f.telefone}` : ''}</div>
                        </div>
                        <span className="num shrink-0 text-[11px] text-ink-3">{qtd} pedidos</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            )}

          </div>
        </div>
      </div>

      {/* Modal novo fornecedor */}
      <Modal
        open={modalFornecedor}
        onClose={() => setModalFornecedor(false)}
        title="Novo fornecedor"
        disableOverlayClose={salvando}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalFornecedor(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvarFornecedor} loading={salvando}>Salvar fornecedor</Button>
          </>
        }
      >
        <form onSubmit={e => { e.preventDefault(); salvarFornecedor() }} className="space-y-3.5">
          {[
            { label: 'Nome fantasia', key: 'nome_fantasia', placeholder: 'Ex: Distribuidora ABC', required: true },
            { label: 'Razão social',    key: 'razao_social',  placeholder: 'Ex: ABC Comércio Ltda' },
            { label: 'CNPJ',            key: 'cnpj',          placeholder: '00.000.000/0000-00' },
            { label: 'Contato (pessoa)',key: 'contato',       placeholder: 'Nome do responsável' },
            { label: 'Telefone',        key: 'telefone',      placeholder: '(11) 99999-9999' },
            { label: 'E-mail',          key: 'email',         placeholder: 'contato@fornecedor.com' },
          ].map(({ label, key, placeholder, required }) => (
            <Input
              key={key}
              label={label}
              required={required}
              value={form[key as keyof typeof FORM_VAZIO]}
              onChange={e => set(key as keyof typeof FORM_VAZIO, e.target.value)}
              placeholder={placeholder}
            />
          ))}
          {erro && <p className="text-[12px] font-medium text-bad">{erro}</p>}
        </form>
      </Modal>

      {/* Modal novo pedido */}
      <Modal
        open={modalPedido}
        onClose={() => setModalPedido(false)}
        title="Novo pedido de compra"
        disableOverlayClose={salvandoPedido}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalPedido(false)} disabled={salvandoPedido}>Cancelar</Button>
            <Button onClick={salvarPedido} loading={salvandoPedido}>Criar pedido</Button>
          </>
        }
      >
        <form onSubmit={e => { e.preventDefault(); salvarPedido() }} className="space-y-3.5">
          <Input
            label="Descrição"
            required
            value={formPedido.descricao}
            onChange={e => setFormPedido(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Reposição de estoque smartphones"
          />
          {isAdmin && (
            <Select
              label="Fornecedor"
              value={formPedido.fornecedor_id}
              onChange={e => setFormPedido(f => ({ ...f, fornecedor_id: e.target.value }))}
            >
              <option value="">— Selecionar —</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
            </Select>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Valor total (R$)"
              value={formPedido.valor_total}
              onChange={e => setFormPedido(f => ({ ...f, valor_total: e.target.value }))}
              placeholder="0,00"
            />
            <Input
              label="Data do pedido"
              type="date"
              value={formPedido.data_pedido}
              onChange={e => setFormPedido(f => ({ ...f, data_pedido: e.target.value }))}
            />
          </div>
          <Select
            label="Status"
            value={formPedido.status}
            onChange={e => setFormPedido(f => ({ ...f, status: e.target.value }))}
          >
            {Object.entries(STATUS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Textarea
            label="Observações"
            rows={2}
            value={formPedido.observacoes}
            onChange={e => setFormPedido(f => ({ ...f, observacoes: e.target.value }))}
            placeholder="Informações adicionais..."
          />
          {erroPedido && <p className="text-[12px] font-medium text-bad">{erroPedido}</p>}
        </form>
      </Modal>
    </div>
  )
}
