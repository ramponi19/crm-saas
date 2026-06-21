'use client'

import { useState } from 'react'
import { X, Send, Pencil, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Lead, Usuario, KANBAN_COLUMNS, STATUS_LABELS, KanbanStatus } from './types'
import { toast } from 'sonner'

interface LeadModalProps {
  lead: Lead
  usuarios: Usuario[]
  onClose: () => void
  onUpdate: (lead: Lead) => void
}

const CANAL_NOME: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', site: 'Site', manual: 'Loja',
}

const AVATAR_COLORS = ['#D7282F','#7FB0E8','#34D399','#F4B740','#C6A86A','#a855f7']
const getAvatarColor = (nome: string) => AVATAR_COLORS[nome.charCodeAt(0) % AVATAR_COLORS.length]
const getInitials    = (nome: string) => nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()

interface ChatMsg { from: 'cliente' | 'loja'; text: string; time: string }

export function LeadModal({ lead, usuarios, onClose, onUpdate }: LeadModalProps) {
  const supabase = createClient()
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus]   = useState(false)
  const [status, setStatus]                = useState<KanbanStatus>(lead.kanban_status ?? 'novo')
  const [draft, setDraft]                  = useState('')
  const [chat, setChat] = useState<ChatMsg[]>(() => {
    const primeiroNome = (lead.nome ?? 'Cliente').split(' ')[0]
    const prod = lead.produto_interessado ?? 'produto'
    return [
      { from: 'cliente', text: `Oi! Vi o ${prod}, ainda tem disponível?`, time: '10:32' },
      { from: 'loja',    text: `Olá ${primeiroNome}! Temos sim 🙌`,        time: '10:35' },
      { from: 'cliente', text: 'Quero! Qual a condição no crédito?',       time: '10:37' },
    ]
  })

  const responsavel = usuarios.find(u => u.id === lead.responsavel_id)
  const col         = KANBAN_COLUMNS.find(c => c.id === status)
  const canalNome   = CANAL_NOME[lead.origem ?? 'manual'] ?? 'Loja'
  const avatarBg    = getAvatarColor(lead.nome ?? 'Lead')

  async function handleStatusChange(newStatus: KanbanStatus) {
    setSavingStatus(true)
    setEditingStatus(false)
    const { error } = await supabase
      .from('leads')
      .update({ kanban_status: newStatus, data_transferencia_funil: new Date().toISOString() })
      .eq('id', lead.id)
    setSavingStatus(false)
    if (error) { toast.error('Erro ao atualizar status'); return }
    setStatus(newStatus)
    onUpdate({ ...lead, kanban_status: newStatus })
    toast.success(`Movido para ${STATUS_LABELS[newStatus]}`)
  }

  function sendMsg() {
    const t = draft.trim()
    if (!t) return
    setChat(prev => [...prev, { from: 'loja', text: t, time: 'agora' }])
    setDraft('')
  }

  const fields = [
    { l: 'Telefone',  v: lead.telefone ?? '—' },
    { l: 'Instagram', v: lead.instagram ?? '—' },
    { l: 'Produto',   v: lead.produto_interessado ?? '—' },
    { l: 'Canal',     v: canalNome },
    { l: 'Responsável', v: responsavel?.nome ?? '—' },
    { l: 'Valor estimado', v: lead.valor_estimado
        ? lead.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—' },
  ]

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: 'rgba(5,9,16,0.55)' }}>
      <div onClick={e => e.stopPropagation()}
        className="w-[430px] max-w-[92vw] h-full overflow-y-auto scrollbar-thin p-[28px_28px_36px]"
        style={{
          background: '#0E1A2C',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-24px 0 70px rgba(0,0,0,0.55)',
          animation: 'slideIn 0.3s cubic-bezier(.16,1,.3,1)',
        }}>

        {/* Header */}
        <div className="flex items-start justify-between gap-[14px] mb-[22px]">
          <div className="flex items-center gap-[14px] min-w-0">
            <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center font-bold text-[18px] text-white flex-none"
              style={{ background: `linear-gradient(135deg, ${avatarBg}, ${avatarBg}99)` }}>
              {getInitials(lead.nome ?? 'L')}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] leading-[1.2]">{lead.nome ?? 'Lead'}</h3>
              <div className="text-[12.5px] text-[#7E8EA2] mt-[3px]">{canalNome} · {lead.telefone ?? 'sem telefone'}</div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-[36px] h-[36px] rounded-[10px] bg-white/[0.05] border border-white/[0.08] text-[#9FB0C2] flex items-center justify-center flex-none hover:bg-white/[0.1] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Status (clicável) */}
        <div className="relative mb-[20px]">
          <button onClick={() => setEditingStatus(!editingStatus)} disabled={savingStatus}
            className="inline-flex items-center gap-1.5 px-[13px] py-[5px] rounded-full text-[12px] font-semibold hover:opacity-80 transition-opacity"
            style={{ background: col ? col.color + '22' : undefined, color: col?.color }}>
            {col?.label}
            <ChevronDown size={13} />
          </button>
          {editingStatus && (
            <div className="absolute top-full left-0 mt-1 bg-[#0A111E] border border-white/[0.1] rounded-[12px] shadow-[0_16px_40px_rgba(0,0,0,0.5)] z-10 overflow-hidden min-w-[180px] p-1">
              {KANBAN_COLUMNS.map(c => (
                <button key={c.id} onClick={() => handleStatusChange(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] rounded-[8px] hover:bg-white/[0.05] transition-colors"
                  style={{ color: c.color }}>
                  <span className="w-[8px] h-[8px] rounded-full" style={{ background: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex flex-col gap-[10px] max-h-[280px] overflow-y-auto scrollbar-thin p-[14px] rounded-[14px] mb-3"
          style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {chat.map((m, i) => {
            const isLoja = m.from === 'loja'
            return (
              <div key={i} className={`flex ${isLoja ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[78%] px-[13px] py-[9px] rounded-[13px] text-[13px]"
                  style={{
                    background: isLoja ? 'linear-gradient(180deg,#E03037,#C01F26)' : 'rgba(255,255,255,0.06)',
                    color: isLoja ? '#fff' : '#E9EEF4',
                    borderBottomRightRadius: isLoja ? 4 : 13,
                    borderBottomLeftRadius: isLoja ? 13 : 4,
                  }}>
                  {m.text}
                  <div className="text-[9.5px] mt-[4px]" style={{ color: isLoja ? 'rgba(255,255,255,0.7)' : '#5C6E84' }}>
                    {m.time}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Campo de resposta */}
        <div className="flex gap-2 mb-4">
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMsg()}
            placeholder={`Responder pelo ${canalNome}…`}
            className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-[11px] px-[13px] py-[11px] text-[13px] text-[#E9EEF4] placeholder:text-[#46586E] outline-none focus:border-[rgba(215,40,47,0.5)] min-w-0" />
          <button onClick={sendMsg}
            className="w-[46px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white flex items-center justify-center flex-none hover:-translate-y-[1px] transition-all">
            <Send size={18} />
          </button>
        </div>

        {/* Campos */}
        <div className="flex flex-col gap-[1px] rounded-[14px] overflow-hidden border border-white/[0.06]">
          {fields.map((f, i) => (
            <div key={i} className="flex justify-between items-center gap-4 px-4 py-[13px]" style={{ background: 'rgba(255,255,255,0.025)' }}>
              <span className="text-[12.5px] text-[#8A9BB0]">{f.l}</span>
              <span className="text-[13.5px] font-semibold text-[#E9EEF4] text-right">{f.v}</span>
            </div>
          ))}
        </div>

        {/* Botão editar */}
        <div className="flex gap-[10px] mt-6">
          <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[11px] border border-white/[0.1] bg-white/[0.05] text-[#C4CCD6] font-semibold text-[13.5px] hover:bg-white/[0.1] transition-colors">
            <Pencil size={16} /> Editar
          </button>
        </div>
      </div>
    </div>
  )
}
