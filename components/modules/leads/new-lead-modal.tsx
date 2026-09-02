'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Lead, Usuario, type KanbanColumn } from './types'
import { Modal, Input, Select, Textarea, Button, notify } from '@/components/ui'
import { ProdutoAutocomplete } from './produto-autocomplete'
import type { TablesInsert } from '@/types/database'

interface NewLeadModalProps {
  usuarios: Usuario[]
  columns: KanbanColumn[]
  onClose: () => void
  onCreate: (lead: Lead) => void
  /** Funil ao qual o novo lead pertence (Fase 4.1). */
  funilId?: number
}

const ORIGENS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'site', label: 'Site' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'manual', label: 'Loja física' },
]

export function NewLeadModal({ usuarios, columns, onClose, onCreate, funilId }: NewLeadModalProps) {
  const [loading, setLoading] = useState(false)

  // Responsável default = vendedor logado (se for da equipe).
  useEffect(() => {
    let cancel = false
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (cancel || !user || !usuarios.some((u) => u.id === user.id)) return
      // Devolver o MESMO objeto é o jeito sancionado de desistir da atualização.
      // eslint-disable-next-line react-hooks/immutability
      setForm((f) => (f.responsavel_id ? f : { ...f, responsavel_id: user.id }))
    })
    return () => { cancel = true }
  }, [usuarios])
  const [form, setForm] = useState({
    nome: '', telefone: '', instagram: '', origem: '',
    produto_interessado: '', valor_estimado: '',
    kanban_status: columns[0]?.id ?? 'novo', responsavel_id: '', observacoes: '',
  })

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  async function handleSubmit() {
    if (!form.nome.trim()) { notify.warn('Nome é obrigatório'); return }
    if (!form.origem) { notify.warn('Selecione a origem do lead'); return }
    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { notify.bad('Não autenticado'); setLoading(false); return }

    const empresaId = await empresaAtualId(supabase)
    if (!empresaId) { notify.bad('Empresa não encontrada'); setLoading(false); return }

    const { data: empresa } = await supabase
      .from('empresas').select('limite_leads').eq('id', empresaId).single()
    const { count: totalLeads } = await supabase
      .from('leads').select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('ativo', true)
    const limiteLeads = empresa?.limite_leads ?? 0
    if (limiteLeads > 0 && (totalLeads ?? 0) >= limiteLeads) {
      notify.bad('Limite de leads atingido', `${totalLeads}/${limiteLeads}. Faça upgrade para continuar.`)
      setLoading(false); return
    }

    const { data, error } = await supabase.from('leads').insert({
      empresa_id: empresaId,
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      instagram: form.instagram.trim() || null,
      origem: form.origem || null,
      produto_interessado: form.produto_interessado.trim() || null,
      valor_estimado: form.valor_estimado ? (Number(form.valor_estimado.replace(/\./g, '').replace(',', '.')) || null) : null,
      kanban_status: form.kanban_status,
      responsavel_id: form.responsavel_id || null,
      observacoes: form.observacoes.trim() || null,
      funil_id: funilId ?? null,
      ativo: true, msgs_nao_lidas: 0,
    } as TablesInsert<'leads'>).select().single()

    if (error) {
      const msg = error.message?.includes('LEAD_LIMIT_REACHED')
        ? 'Limite de leads atingido. Faça upgrade para continuar.'
        : 'Tente novamente.'
      notify.bad('Erro ao criar lead', msg)
      setLoading(false)
      return
    }
    let criado = data as Lead
    // Distribuição automática quando o criador não escolheu responsável.
    if (!form.responsavel_id && criado?.id) {
      try {
        const r = await fetch('/api/leads/distribuir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: criado.id }) })
        const j = await r.json().catch(() => ({}))
        if (j?.responsavel_id) criado = { ...criado, responsavel_id: j.responsavel_id }
      } catch { /* silencioso — lead fica na esteira */ }
    }
    notify.ok('Lead criado', form.nome.trim())
    onCreate(criado)
    setLoading(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo lead"
      disableOverlayClose={loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!form.nome.trim()}>Criar lead</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input wrapperClassName="col-span-2" label="Nome" required value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome do lead" autoFocus />
        <Input label="Telefone / WhatsApp" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(19) 99999-0000" className="num" />
        <Input label="Instagram" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@usuario" />
        <Select label="Origem" value={form.origem} onChange={(e) => set('origem', e.target.value)}>
          <option value="">Selecionar</option>
          {ORIGENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select label="Status inicial" value={form.kanban_status} onChange={(e) => set('kanban_status', e.target.value)}>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <ProdutoAutocomplete label="Produto de interesse" value={form.produto_interessado}
          onChange={(v) => set('produto_interessado', v)}
          onSelect={(p) => { set('produto_interessado', p.nome); if (!form.valor_estimado && p.preco) set('valor_estimado', String(p.preco)) }} />
        <Input label="Valor estimado (R$)" value={form.valor_estimado} onChange={(e) => set('valor_estimado', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" className="num" />
        <Select wrapperClassName="col-span-2" label="Responsável" value={form.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)}>
          <option value="">Sem responsável</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </Select>
        <Textarea wrapperClassName="col-span-2" label="Observações" rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Contexto, anotações…" />
      </form>
    </Modal>
  )
}
