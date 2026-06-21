'use client'

import { useState, useEffect } from 'react'
import { X, Phone, Instagram, User, Tag, Clock, MessageCircle, Send, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Lead, Usuario, KANBAN_COLUMNS, STATUS_LABELS, KanbanStatus } from './types'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

interface LeadMessage {
  id: number
  lead_id: number | null
  direcao: 'entrada' | 'saida'
  conteudo: string
  origem: string | null
  lida: boolean | null
  created_at: string | null
}

interface LeadModalProps {
  lead: Lead
  usuarios: Usuario[]
  onClose: () => void
  onUpdate: (lead: Lead) => void
}

export function LeadModal({ lead, usuarios, onClose, onUpdate }: LeadModalProps) {
  const [messages, setMessages] = useState<LeadMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(lead.observacoes ?? '')

  const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
  const col = KANBAN_COLUMNS.find(c => c.id === lead.kanban_status)

  useEffect(() => {
    loadMessages()
    markAsRead()
    // eslint-disable-next-line
  }, [lead.id])

  async function loadMessages() {
    setLoadingMsgs(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('lead_mensagens')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoadingMsgs(false)
  }

  async function markAsRead() {
    if (!lead.msgs_nao_lidas) return
    const supabase = createClient()
    await supabase
      .from('leads')
      .update({ msgs_nao_lidas: 0 })
      .eq('id', lead.id)
    onUpdate({ ...lead, msgs_nao_lidas: 0 })
  }

  async function handleStatusChange(status: KanbanStatus) {
    setSavingStatus(true)
    setEditingStatus(false)
    const supabase = createClient()
    const { error } = await supabase
      .from('leads')
      .update({
        kanban_status: status,
        data_transferencia_funil: new Date().toISOString(),
      })
      .eq('id', lead.id)

    if (error) {
      toast.error('Erro ao atualizar status')
    } else {
      onUpdate({ ...lead, kanban_status: status })
      toast.success('Status atualizado')
    }
    setSavingStatus(false)
  }

  async function handleSaveNotes() {
    const supabase = createClient()
    const { error } = await supabase
      .from('leads')
      .update({ observacoes: notes })
      .eq('id', lead.id)

    if (error) {
      toast.error('Erro ao salvar observações')
    } else {
      onUpdate({ ...lead, observacoes: notes })
      setEditingNotes(false)
      toast.success('Observações salvas')
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim()) return
    setSendingMsg(true)
    const supabase = createClient()

    // 1. Registra no banco
    const { data, error } = await supabase
      .from('lead_mensagens')
      .insert({
        lead_id: lead.id,
        direcao: 'saida',
        conteudo: newMessage.trim(),
        origem: 'crm',
        lida: true,
      })
      .select()
      .single()

    if (error) {
      toast.error('Erro ao enviar mensagem')
      setSendingMsg(false)
      return
    }

    setMessages(prev => [...prev, data])
    setNewMessage('')

    // 2. Atualiza ultima_tratativa
    await supabase
      .from('leads')
      .update({ ultima_tratativa: new Date().toISOString() })
      .eq('id', lead.id)

    // 3. Tenta enviar via WhatsApp se tiver telefone
    if (lead.telefone) {
      const numero = lead.telefone.replace(/\D/g, '')
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: numero.startsWith('55') ? numero : `55${numero}`, message: newMessage.trim() }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success('Mensagem enviada via WhatsApp')
      } else {
        toast.success('Mensagem registrada (WhatsApp não configurado)')
      }
    } else {
      toast.success('Mensagem registrada')
    }

    setSendingMsg(false)
  }

  async function handleResponsavelChange(userId: string) {
    const supabase = createClient()
    await supabase
      .from('leads')
      .update({ responsavel_id: userId || null })
      .eq('id', lead.id)
    onUpdate({ ...lead, responsavel_id: userId || null })
    toast.success('Responsável atualizado')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl h-full bg-[hsl(var(--background))] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[hsl(var(--crm-border))]">
          <div className="flex-1 min-w-0">
            <h2 className="font-fraunces text-xl font-medium text-[hsl(var(--crm-text-primary))] truncate">
              {lead.nome ?? 'Lead sem nome'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {/* Status badge clicável */}
              <div className="relative">
                <button
                  onClick={() => setEditingStatus(!editingStatus)}
                  disabled={savingStatus}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full hover:opacity-80 transition-opacity" style={{ background: col ? col.color + '22' : undefined, color: col?.color }}
                >
                  {col?.label}
                  <ChevronDown className="w-3 h-3" />
                </button>

                {editingStatus && (
                  <div className="absolute top-full left-0 mt-1 bg-[hsl(var(--card))] border border-[hsl(var(--crm-border))] rounded-xl shadow-lg z-10 overflow-hidden min-w-[160px]">
                    {KANBAN_COLUMNS.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleStatusChange(c.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/[0.05] transition-colors" style={{ color: c.color }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lead.origem && (
                <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-muted))]">
                  {lead.origem}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-subtle))] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info do lead */}
        <div className="px-6 py-4 border-b border-[hsl(var(--crm-border))] grid grid-cols-2 gap-3">
          {lead.telefone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
              <a
                href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-[hsl(var(--crm-brand))] hover:underline"
              >
                {lead.telefone}
              </a>
            </div>
          )}

          {lead.instagram && (
            <div className="flex items-center gap-2">
              <Instagram className="w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
              <a
                href={`https://instagram.com/${lead.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[hsl(var(--crm-brand))] hover:underline"
              >
                {lead.instagram}
              </a>
            </div>
          )}

          {lead.produto_interessado && (
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
              <span className="text-sm text-[hsl(var(--crm-text-primary))]">{lead.produto_interessado}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
            <select
              value={lead.responsavel_id ?? ''}
              onChange={e => handleResponsavelChange(e.target.value)}
              className="text-sm bg-transparent text-[hsl(var(--crm-text-primary))] focus:outline-none"
            >
              <option value="">Sem responsável</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          {lead.created_at && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[hsl(var(--crm-text-subtle))]" />
              <span className="text-sm text-[hsl(var(--crm-text-muted))]">
                Lead criado {formatDistanceToNow(new Date(lead.created_at), { locale: ptBR, addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        {/* Observações */}
        <div className="px-6 py-3 border-b border-[hsl(var(--crm-border))]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide">
              Observações
            </span>
            {!editingNotes && (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-xs text-[hsl(var(--crm-brand))] hover:underline"
              >
                Editar
              </button>
            )}
          </div>

          {editingNotes ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full text-sm rounded-lg border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20 resize-none"
                placeholder="Adicionar observações..."
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNotes}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[hsl(var(--crm-brand))] text-white hover:opacity-90"
                >
                  Salvar
                </button>
                <button
                  onClick={() => { setEditingNotes(false); setNotes(lead.observacoes ?? '') }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[hsl(var(--crm-border))] text-[hsl(var(--crm-text-muted))] hover:bg-[hsl(var(--muted))]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--crm-text-muted))]">
              {notes || <span className="italic text-[hsl(var(--crm-text-subtle))]">Sem observações</span>}
            </p>
          )}
        </div>

        {/* Histórico de mensagens */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 py-2 border-b border-[hsl(var(--crm-border))]">
            <span className="text-xs font-semibold text-[hsl(var(--crm-text-muted))] uppercase tracking-wide flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5" />
              Mensagens ({messages.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-[hsl(var(--crm-brand))] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[hsl(var(--crm-text-subtle))]">
                <MessageCircle className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Sem mensagens registradas</p>
              </div>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direcao === 'saida' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                      msg.direcao === 'saida'
                        ? 'bg-[hsl(var(--crm-brand))] text-white rounded-tr-sm'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--crm-text-primary))] rounded-tl-sm'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.conteudo}</p>
                    {msg.created_at && (
                      <p className={`text-[10px] mt-1 ${msg.direcao === 'saida' ? 'text-white/60' : 'text-[hsl(var(--crm-text-subtle))]'}`}>
                        {format(new Date(msg.created_at), "dd/MM HH:mm")}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input de mensagem */}
          <div className="px-6 py-4 border-t border-[hsl(var(--crm-border))]">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Registrar mensagem ou anotação..."
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--crm-border))] bg-[hsl(var(--crm-surface))] text-[hsl(var(--crm-text-primary))] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--crm-brand))]/20"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sendingMsg}
                className="p-2 rounded-xl bg-[hsl(var(--crm-brand))] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-[hsl(var(--crm-text-subtle))] mt-1.5 ml-1">
              Enter para enviar · WhatsApp automático se número cadastrado
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
