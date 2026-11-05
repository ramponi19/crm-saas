'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { Modal, Input, Select, Textarea, Button, Badge, ConfirmDialog, notify } from '@/components/ui'
import { camposFaltantesContrato } from '@/lib/cliente-contrato'
import { avisoDocumento, conferirDocumento, documentoMudou, soDigitos } from '@/lib/documento'
import { consultaClientes, contarClientes } from '@/lib/clientes'
import { iniciais } from '@/lib/sem-nome'

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
    const faltando = camposFaltantesContrato(form)
    if (faltando.length) {
      // Lista TUDO que falta de uma vez: apontar um campo por tentativa faria o
      // vendedor salvar seis vezes para descobrir o formulário inteiro.
      notify.warn('Faltam dados que o contrato usa', faltando.join(', ') + '.')
      return
    }
    // O servidor confere de novo (lib/clientes.ts); aqui é para avisar antes de enviar.
    // Só quando o documento MUDA: ficha antiga com CPF incompleto salva o resto (aviso no campo).
    if (isNew || documentoMudou(cliente?.cpf_cnpj, form.cpf_cnpj)) {
      const doc = conferirDocumento(form.cpf_cnpj)
      if (!doc.ok) { notify.warn(doc.erro); return }
    }
    setSaving(true)
    // Os três números de compra são calculados na tela; o id vai na URL, não no corpo.
    const { id: _id, total_vendas: _tv, valor_total: _vt, ultima_compra: _uc, ...payload } = form
    if (isNew) {
      const empId = await empresaAtualId(supabase)
      if (!empId) { notify.bad('Empresa não encontrada'); setSaving(false); return }

      /**
       * CPF JÁ CADASTRADO — avisa em vez de criar o segundo.
       *
       * Nada impedia dois cadastros da mesma pessoa, e a consequência não é uma
       * linha a mais na lista: o histórico de compras racha em dois, a garantia
       * fica no cadastro errado e o contrato sai apontando para o cadastro que o
       * vendedor não abriu. Aqui é só aviso, não bloqueio: existe caso legítimo
       * (mesmo CPF, cadastro reativado) e travar o balcão seria pior.
       */
      const digitos = soDigitos(form.cpf_cnpj)
      if (digitos.length >= 11) {
        const { data: iguais } = await consultaClientes(supabase, 'id, nome')
          .eq('empresa_id', empId).eq('ativo', true)
          .ilike('cpf_cnpj', `%${digitos.slice(-9)}%`).limit(1)
        if (iguais?.length) {
          notify.warn('Já existe cliente com este CPF/CNPJ', `${iguais[0].nome} — confira antes de duplicar o cadastro.`)
        }
      }
      const { data: emp } = await supabase
        .from('empresas').select('limite_leads').eq('id', empId).maybeSingle()
      const limite = emp?.limite_leads ?? 0
      if (limite > 0) {
        const count = await contarClientes(supabase, empId, { ativos: true })
        if (count >= limite) {
          notify.bad('Limite de clientes atingido', `${count}/${limite}. Faça upgrade para continuar.`)
          setSaving(false); return
        }
      }
      const r = await fetch('/api/clientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ativo: true }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.cliente) { notify.bad('Erro ao cadastrar', j?.error); setSaving(false); return }
      notify.ok('Cliente cadastrado')
      const c = j.cliente as ClienteCriado
      onCreated?.({ id: c.id, nome: c.nome, telefone: c.telefone, cpf_cnpj: c.cpf_cnpj })
    } else {
      // Não reenvia `ativo` na edição — senão reativa silenciosamente um cliente desativado.
      const { ativo: _ativo, ...semAtivo } = payload
      const r = await fetch(`/api/clientes/${cliente!.id!}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(semAtivo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad('Erro ao salvar', j?.error); setSaving(false); return }
      const aviso = avisoDocumento(form.cpf_cnpj)
      if (aviso) notify.warn('Alterações salvas', `${aviso}: corrija o número quando o cliente informar.`)
      else notify.ok('Alterações salvas')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    const r = await fetch(`/api/clientes/${cliente!.id!}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: false }),
    })
    if (!r.ok) { notify.bad('Erro ao remover', (await r.json().catch(() => ({})))?.error); return }
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
              {iniciais(form.nome)}
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
          <Input label="Telefone / WhatsApp" required value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
          <Input label="E-mail" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" />
          <Input label="CPF / CNPJ" required value={form.cpf_cnpj ?? ''} onChange={(e) => set('cpf_cnpj', e.target.value)} placeholder="000.000.000-00"
            error={!isNew && !documentoMudou(cliente?.cpf_cnpj, form.cpf_cnpj) ? avisoDocumento(form.cpf_cnpj) ?? undefined : undefined} />
          <Input label="Data de nascimento" type="date" value={form.data_nascimento ?? ''} onChange={(e) => set('data_nascimento', e.target.value)} />
          <Select label="Tipo de cliente" value={form.tipo_cliente ?? 'Novo'} onChange={(e) => set('tipo_cliente', e.target.value)}>
            {['Novo', 'Ativo', 'VIP', 'Recorrente', 'Inativo'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Select label="Estado civil" required value={form.estado_civil ?? ''} onChange={(e) => set('estado_civil', e.target.value)}>
            <option value="">—</option>
            {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Input label="Profissão" required value={form.profissao ?? ''} onChange={(e) => set('profissao', e.target.value)} placeholder="Ex.: Comerciante" />
          <Input label="Nacionalidade" value={form.nacionalidade ?? ''} onChange={(e) => set('nacionalidade', e.target.value)} placeholder="Brasileiro(a)" />
          <Input label="Instagram" value={form.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} placeholder="@usuario" />
          <Select label="Origem do cliente" value={form.origem_cliente ?? ''} onChange={(e) => set('origem_cliente', e.target.value)}>
            <option value="">—</option>
            {['Instagram', 'WhatsApp', 'Indicação', 'Loja física', 'Facebook', 'Google', 'Marketplace'].map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Input label="CEP" required value={form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
          <Input label="Endereço (Rua / Av.)" required value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
          <Input label="Nº" required value={form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} placeholder="123" />
          <Input label="Complemento" value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} placeholder="Apto, bloco…" />
          <Input label="Bairro" required value={form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
          <Input label="Cidade" required value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
          <Input wrapperClassName="col-span-2" label="Estado (UF)" required value={form.estado ?? ''} onChange={(e) => set('estado', e.target.value)} maxLength={2} />
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
