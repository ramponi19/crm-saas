'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { Modal, Input, Select, Textarea, Button, Badge, ConfirmDialog, notify } from '@/components/ui'
import type { TablesInsert, TablesUpdate } from '@/types/database'

interface Cliente {
  id?: number
  nome: string
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
  data_nascimento: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  tipo_cliente: string | null
  instagram: string | null
  origem_cliente: string | null
  observacoes: string | null
  estado_civil: string | null
  profissao: string | null
  nacionalidade: string | null
  ativo?: boolean | null
  total_vendas?: number
  valor_total?: number
  ultima_compra?: string | null
}

/**
 * Cliente recém-criado, devolvido a quem abriu o modal de dentro de uma venda.
 * Traz `cpf_cnpj` porque o PDV o repassa ao contrato e ao termo de garantia —
 * sem ele o documento sairia com lacuna logo depois do cadastro.
 */
export interface ClienteCriado { id: number; nome: string; telefone: string | null; cpf_cnpj: string | null }

interface Props {
  cliente: Cliente | null
  isNew: boolean
  onClose: () => void
  /**
   * Avisa quem abriu que o cliente foi criado — é o que permite cadastrar no
   * meio do PDV ou da encomenda e a venda seguir já com ele selecionado.
   */
  onCreated?: (c: ClienteCriado) => void
  /** Pré-preenche o nome (o que a pessoa já tinha digitado na busca). */
  nomeInicial?: string
}

const EMPTY: Cliente = {
  nome: '', email: null, telefone: null, cpf_cnpj: null, data_nascimento: null,
  endereco: null, numero: null, complemento: null, bairro: null, cidade: null,
  estado: null, cep: null, tipo_cliente: 'Novo', instagram: null,
  origem_cliente: null, observacoes: null, estado_civil: null,
  profissao: null, nacionalidade: 'Brasileiro(a)',
}

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'CL'
}

function fmtUltima(d: string | null | undefined) {
  if (!d) return '—'
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return `${diff} dias`
  return new Date(d).toLocaleDateString('pt-BR')
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ink' | 'ok' }) {
  return (
    <div className="rounded-card border border-line bg-raised p-3 text-center">
      <div className={`num text-[17px] font-bold leading-tight ${tone === 'ok' ? 'text-ok' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-ink-3">{label}</div>
    </div>
  )
}

export default function ClienteModal({ cliente, isNew, onClose, onCreated, nomeInicial }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState<Cliente>(
    isNew ? { ...EMPTY, nome: nomeInicial ?? '' } : { ...EMPTY, ...cliente },
  )
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  function set(field: keyof Cliente, value: string) {
    setForm((f) => ({ ...f, [field]: value || null }))
  }

  async function salvar() {
    if (!form.nome.trim()) { notify.warn('Nome é obrigatório'); return }
    setSaving(true)
    const { total_vendas: _tv, valor_total: _vt, ultima_compra: _uc, ...payload } = form
    const data = { ...payload, ativo: true }
    if (isNew) {
      const empId = await empresaAtualId(supabase)
      if (!empId) { notify.bad('Empresa não encontrada'); setSaving(false); return }
      const { data: emp } = await supabase
        .from('empresas').select('limite_leads').eq('id', empId).maybeSingle()
      const limite = emp?.limite_leads ?? 0
      if (limite > 0) {
        const { count } = await supabase.from('clientes')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empId).eq('ativo', true)
        if ((count ?? 0) >= limite) {
          notify.bad('Limite de clientes atingido', `${count}/${limite}. Faça upgrade para continuar.`)
          setSaving(false); return
        }
      }
      const { data: novo, error } = await supabase
        .from('clientes')
        .insert({ ...data, empresa_id: empId } as TablesInsert<'clientes'>)
        .select('id, nome, telefone, cpf_cnpj')
        .single()
      if (error || !novo) { notify.bad('Erro ao cadastrar', error?.message); setSaving(false); return }
      notify.ok('Cliente cadastrado')
      onCreated?.(novo as ClienteCriado)
    } else {
      // Não reenvia `ativo` na edição — senão reativa silenciosamente um cliente desativado.
      const { ativo: _ativo, ...semAtivo } = data
      const { error } = await supabase.from('clientes').update(semAtivo as TablesUpdate<'clientes'>).eq('id', cliente!.id!)
      if (error) { notify.bad('Erro ao salvar', error.message); setSaving(false); return }
      notify.ok('Alterações salvas')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    const { error } = await supabase.from('clientes').update({ ativo: false }).eq('id', cliente!.id!)
    if (error) { notify.bad('Erro ao remover', error.message); return }
    notify.ok('Cliente desativado')
    router.refresh()
    onClose()
  }

  const tv = cliente?.total_vendas ?? 0
  const vt = cliente?.valor_total ?? 0
  const uc = cliente?.ultima_compra ?? null
  const isVip = form.tipo_cliente === 'VIP'

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        disableOverlayClose={saving}
        title={
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
              {getInitials(form.nome || 'CL')}
            </span>
            <span className="truncate">{isNew ? 'Novo cliente' : form.nome || 'Cliente'}</span>
            {isVip ? <Badge tone="warn">VIP</Badge> : !isNew && form.ativo !== false ? <Badge tone="ok" dot>Ativo</Badge> : null}
          </span>
        }
        footer={
          <>
            {!isNew && (
              <Button variant="ghost" className="mr-auto text-bad hover:bg-bad-soft" onClick={() => setConfirmDel(true)} disabled={saving}>
                Desativar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={saving}>Fechar</Button>
            <Button onClick={salvar} loading={saving}>Salvar</Button>
          </>
        }
      >
        {!isNew && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Compras" value={tv} />
            <Stat label="Total gasto" value={vt > 0 ? formatCurrency(vt) : '—'} tone="ok" />
            <Stat label="Última compra" value={fmtUltima(uc)} />
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); salvar() }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input wrapperClassName="col-span-2" label="Nome completo" required value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome completo" />
          <Input label="Telefone / WhatsApp" value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
          <Input label="E-mail" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" />
          <Input label="CPF / CNPJ" value={form.cpf_cnpj ?? ''} onChange={(e) => set('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
          <Input label="Data de nascimento" type="date" value={form.data_nascimento ?? ''} onChange={(e) => set('data_nascimento', e.target.value)} />
          <Select label="Tipo de cliente" value={form.tipo_cliente ?? 'Novo'} onChange={(e) => set('tipo_cliente', e.target.value)}>
            {['Novo', 'Ativo', 'VIP', 'Recorrente', 'Inativo'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Select label="Estado civil" value={form.estado_civil ?? ''} onChange={(e) => set('estado_civil', e.target.value)}>
            <option value="">—</option>
            {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Input label="Profissão" value={form.profissao ?? ''} onChange={(e) => set('profissao', e.target.value)} placeholder="Ex.: Comerciante" />
          <Input label="Nacionalidade" value={form.nacionalidade ?? ''} onChange={(e) => set('nacionalidade', e.target.value)} placeholder="Brasileiro(a)" />
          <Input label="Instagram" value={form.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} placeholder="@usuario" />
          <Select label="Origem do cliente" value={form.origem_cliente ?? ''} onChange={(e) => set('origem_cliente', e.target.value)}>
            <option value="">—</option>
            {['Instagram', 'WhatsApp', 'Indicação', 'Loja física', 'Facebook', 'Google', 'Marketplace'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Input label="CEP" value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
          <Input label="Endereço (Rua / Av.)" value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
          <Input label="Nº" value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} placeholder="123" />
          <Input label="Complemento" value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} placeholder="Apto, bloco…" />
          <Input label="Bairro" value={form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
          <Input label="Cidade" value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
          <Input wrapperClassName="col-span-2" label="Estado (UF)" value={form.estado ?? ''} onChange={(e) => set('estado', e.target.value)} maxLength={2} />
          <Textarea wrapperClassName="col-span-2" label="Observações" rows={3} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} placeholder="Anotações sobre o cliente…" />
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={excluir}
        title="Desativar cliente?"
        description={`${form.nome || 'Este cliente'} deixará de aparecer nas listas. Você pode reativá-lo depois.`}
        confirmLabel="Desativar"
        tone="danger"
      />
    </>
  )
}
