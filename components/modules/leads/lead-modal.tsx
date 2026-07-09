'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Send, UserCheck, Trash2, UserRound, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Lead, Usuario, type KanbanColumn, ganhoColId } from './types'
import { LeadMatchPanel } from './lead-match-panel'
import { LeadInteressePanel } from './lead-interesse-panel'
import { LeadFinanciamentoPanel } from './lead-financiamento-panel'
import { LeadAcoesPanel } from './lead-acoes-panel'
import { ResponsavelPanel } from './responsavel-panel'
import { useRouter } from 'next/navigation'
import { Input, Select, Textarea, Button, IconButton, Badge, ConfirmDialog, notify } from '@/components/ui'
import { useLockScroll, useEscape } from '@/components/ui/overlay'

interface LeadModalProps {
  lead: Lead
  usuarios: Usuario[]
  columns: KanbanColumn[]
  segmento?: string | null
  onClose: () => void
  onUpdate: (lead: Lead) => void
}

const CANAL_NOME: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', site: 'Site', manual: 'Loja',
}

// ⚠️ Zona sensível (Meta). Entrega real acontece na Edge Function (Graph API / Evolution).
// NÃO alterar a lógica abaixo sem alinhamento — impacta a aprovação de API da Meta.
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook-leads`

async function entregarViaEdge(action: 'send' | 'send_meta', payload: Record<string, unknown>) {
  const res = await fetch(`${FUNCTIONS_URL}?action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (data as { error?: string }).error) {
    throw new Error((data as { error?: string }).error ?? 'Falha ao enviar a mensagem')
  }
}

interface ChatMsg { from: 'cliente' | 'loja'; text: string; time: string }

export function LeadModal({ lead, usuarios, columns, segmento, onClose, onUpdate }: LeadModalProps) {
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  useLockScroll(true)
  useEscape(true, onClose)

  const responsavelInicial = usuarios.find((u) => u.id === lead.responsavel_id)?.nome ?? ''
  const canalNome = CANAL_NOME[lead.origem ?? 'manual'] ?? 'Loja'

  const [form, setForm] = useState({
    nome: lead.nome ?? '',
    tel: lead.telefone ?? '',
    ig: lead.instagram ?? '',
    produto: lead.produto_interessado ?? '',
    status: lead.kanban_status ?? 'novo',
    responsavel: responsavelInicial,
    obs: lead.observacoes ?? '',
  })
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const [chat, setChat] = useState<ChatMsg[]>([])
  const [loadingChat, setLoadingChat] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancel = false
    async function load() {
      setLoadingChat(true)
      const { data } = await supabase
        .from('lead_mensagens')
        .select('direcao, conteudo, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })
      if (cancel) return
      type MsgRow = { direcao: string | null; conteudo: string | null; created_at: string }
      const msgs: ChatMsg[] = ((data ?? []) as MsgRow[]).map((m) => ({
        from: m.direcao === 'enviada' ? 'loja' : 'cliente',
        text: m.conteudo ?? '',
        time: new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      }))
      setChat(msgs)
      setLoadingChat(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
      if ((lead.msgs_nao_lidas ?? 0) > 0) {
        await supabase.from('lead_mensagens').update({ lida: true }).eq('lead_id', lead.id).eq('lida', false)
        await supabase.from('leads').update({ msgs_nao_lidas: 0 }).eq('id', lead.id)
        onUpdate({ ...lead, msgs_nao_lidas: 0 })
      }
    }
    load()

    const channel = supabase
      .channel(`lead_msgs_${lead.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_mensagens', filter: `lead_id=eq.${lead.id}` },
        (payload: RealtimePostgresChangesPayload<{ id: number; direcao: string; conteudo: string | null; created_at: string; lida: boolean | null }>) => {
          const m = payload.new as { id: number; direcao: string; conteudo: string | null; created_at: string; lida: boolean | null }
          setChat((prev) => {
            const novaMsg: ChatMsg = {
              from: m.direcao === 'enviada' ? 'loja' : 'cliente',
              text: m.conteudo ?? '',
              time: new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            }
            if (novaMsg.from === 'loja') {
              const idx = prev.findIndex((x) => x.from === 'loja' && x.text === novaMsg.text && x.time === 'agora')
              if (idx >= 0) { const copy = [...prev]; copy[idx] = novaMsg; return copy }
            }
            return [...prev, novaMsg]
          })
          if (m.direcao === 'recebida' && !m.lida) {
            supabase.from('lead_mensagens').update({ lida: true }).eq('id', m.id)
          }
        })
      .subscribe()

    return () => { cancel = true; supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  useEffect(() => {
    if (!loadingChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.length, loadingChat])

  async function sendMsg() {
    const t = draft.trim(); if (!t) return
    const canal = lead.origem ?? 'manual'
    setDraft('')
    setChat((prev) => [...prev, { from: 'loja', text: t, time: 'agora' }])

    const rollback = () => {
      setChat((prev) => {
        const idx = prev.findIndex((x) => x.from === 'loja' && x.text === t && x.time === 'agora')
        if (idx < 0) return prev
        const copy = [...prev]; copy.splice(idx, 1); return copy
      })
      setDraft(t)
    }

    try {
      if (canal === 'instagram' || canal === 'messenger') {
        await entregarViaEdge('send_meta', { leadId: lead.id, texto: t, canal })
      } else if (canal === 'whatsapp') {
        if (!lead.telefone) throw new Error('Lead sem telefone para envio no WhatsApp')
        await entregarViaEdge('send', { number: lead.telefone, text: t, leadId: lead.id })
      } else {
        if (!empresa?.id) throw new Error('Empresa não encontrada')
        const { error } = await supabase.from('lead_mensagens').insert({
          empresa_id: empresa.id, lead_id: lead.id, direcao: 'enviada',
          conteudo: t, origem: canal, lida: true,
        })
        if (error) throw new Error(error.message)
      }
      await supabase.from('leads').update({ ultima_mensagem_at: new Date().toISOString() }).eq('id', lead.id)
    } catch (e) {
      rollback()
      notify.bad('Erro ao enviar', e instanceof Error ? e.message : 'Tente novamente.')
    }
  }

  async function handleSave() {
    setSaving(true)
    const statusKey = form.status || lead.kanban_status || 'novo'
    const respId = usuarios.find((u) => u.nome === form.responsavel)?.id ?? lead.responsavel_id

    const { error } = await supabase.from('leads').update({
      nome: form.nome.trim() || null,
      telefone: form.tel.trim() || null,
      instagram: form.ig.trim() || null,
      produto_interessado: form.produto.trim() || null,
      kanban_status: statusKey,
      responsavel_id: respId,
      observacoes: form.obs.trim() || null,
    }).eq('id', lead.id)

    setSaving(false)
    if (error) { notify.bad('Erro ao salvar'); return }
    notify.ok('Lead atualizado')
    onUpdate({
      ...lead, nome: form.nome, telefone: form.tel, instagram: form.ig,
      produto_interessado: form.produto, kanban_status: statusKey, responsavel_id: respId, observacoes: form.obs,
    })
  }

  async function handleConvert() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { notify.bad('Não autenticado'); setSaving(false); return }

    const { data: vinculo } = await supabase
      .from('empresa_usuarios').select('empresa_id')
      .eq('usuario_id', user.id).eq('ativo', true).single()
    if (!vinculo) { notify.bad('Empresa não encontrada'); setSaving(false); return }

    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert({
        empresa_id: vinculo.empresa_id,
        nome: form.nome.trim(),
        telefone: form.tel.trim() || null,
        instagram: form.ig.trim() || null,
        ativo: true,
      })
      .select('id').single()

    if (error || !cliente) { notify.bad('Erro ao converter'); setSaving(false); return }

    await supabase.from('leads')
      .update({ kanban_status: ganhoColId(columns), convertido_em: cliente.id })
      .eq('id', lead.id)

    setSaving(false)
    notify.ok('Lead convertido em cliente!')
    onUpdate({ ...lead, kanban_status: ganhoColId(columns), convertido_em: cliente.id })
    onClose()
  }

  async function handleDelete() {
    setSaving(true)
    const { error } = await supabase.from('leads').update({ ativo: false }).eq('id', lead.id)
    setSaving(false)
    if (error) { notify.bad('Erro ao excluir'); return }
    notify.ok('Lead excluído')
    router.refresh()
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 p-4 sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[620px] max-h-[92vh] w-[1000px] max-w-[96vw] flex-col overflow-hidden rounded-modal border border-line bg-card shadow-[0_30px_70px_-20px_rgba(21,24,28,0.4)]">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-3.5">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-white">
            <UserRound size={19} strokeWidth={1.7} />
          </span>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{form.nome || 'Lead'}</h2>
          <Badge tone="acc">{canalNome}</Badge>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleConvert} disabled={saving} icon={<UserCheck size={15} strokeWidth={1.7} />}>
            Converter em cliente
          </Button>
          <IconButton aria-label="Excluir lead" variant="danger" onClick={() => setConfirmDel(true)} disabled={saving}>
            <Trash2 size={16} strokeWidth={1.7} />
          </IconButton>
          <IconButton aria-label="Fechar" onClick={onClose}>
            <X size={17} strokeWidth={1.7} />
          </IconButton>
        </div>

        {/* Body: 2 colunas */}
        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: '340px 1fr' }}>

          {/* Esquerda: formulário */}
          <div className="flex flex-col gap-3 overflow-y-auto border-r border-line-soft p-5 scrollbar-thin">
            <Input label="Nome" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
            <Input label="Telefone / WhatsApp" value={form.tel} onChange={(e) => set('tel', e.target.value)} className="num" />
            <Input label="Instagram" value={form.ig} onChange={(e) => set('ig', e.target.value)} placeholder="@usuario" />
            <Input label={segmento === 'concessionaria' ? 'Veículo interessado' : segmento === 'imobiliaria' ? 'Imóvel interessado' : 'Produto interessado'} value={form.produto} onChange={(e) => set('produto', e.target.value)} />
            <Select label="Status no funil" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            <Select label="Responsável" value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)}>
              <option value="">Sem responsável</option>
              {usuarios.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
            </Select>
            <Textarea label="Observações" rows={3} value={form.obs} onChange={(e) => set('obs', e.target.value)} placeholder="Contexto, anotações…" />

            {empresa?.id && <LeadAcoesPanel leadId={lead.id} empresaId={empresa.id} segmento={segmento} />}
            <ResponsavelPanel
              leadId={lead.id}
              usuarios={usuarios}
              responsavelInicial={lead.responsavel_id}
              onChange={(id) => { setForm((f) => ({ ...f, responsavel: usuarios.find((u) => u.id === id)?.nome ?? '' })); onUpdate({ ...lead, responsavel_id: id }) }}
            />
            {segmento === 'imobiliaria' && <LeadMatchPanel leadId={lead.id} />}
            {segmento === 'concessionaria' && <LeadInteressePanel leadId={lead.id} />}
            {segmento === 'concessionaria' && <LeadFinanciamentoPanel leadId={lead.id} />}
            <Button className="mt-1 w-full" onClick={handleSave} loading={saving}>Salvar</Button>
          </div>

          {/* Direita: chat */}
          <div className="flex flex-col overflow-hidden bg-bg">
            <div className="border-b border-line-soft px-5 py-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Histórico de mensagens
            </div>
            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5 scrollbar-thin">
              {loadingChat ? (
                <div className="flex h-full items-center justify-center text-[13px] text-ink-3">Carregando mensagens…</div>
              ) : chat.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-ink-3">
                  <Send size={26} strokeWidth={1.5} className="opacity-40" />
                  <p className="text-[13px]">Nenhuma mensagem ainda.</p>
                  <p className="text-[11.5px]">As conversas deste canal aparecerão aqui.</p>
                </div>
              ) : chat.map((m, i) => {
                const isLoja = m.from === 'loja'
                return (
                  <div key={i} className={`flex ${isLoja ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] rounded-[12px] px-3.5 py-2.5 text-[13px] ${isLoja ? 'rounded-br-[3px] bg-ink text-white' : 'rounded-bl-[3px] bg-card text-ink border border-line'}`}>
                      {m.text}
                      <div className={`mt-1 text-[9.5px] ${isLoja ? 'text-white/60' : 'text-ink-3'}`}>{m.time}</div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="flex items-center gap-2 border-t border-line-soft px-5 py-3.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
                placeholder="Digite uma mensagem…"
                className="h-9 min-w-0 flex-1 rounded-control border border-line bg-card px-3 text-[13px] text-ink placeholder:text-ink-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
              />
              <IconButton aria-label="Enviar mensagem" variant="primary" onClick={sendMsg}>
                <Send size={16} strokeWidth={1.7} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={handleDelete}
        title="Excluir lead?"
        description={`${form.nome || 'Este lead'} será removido do funil. As mensagens ficam no histórico.`}
        confirmLabel="Excluir"
        tone="danger"
        loading={saving}
      />
    </div>,
    document.body,
  )
}
