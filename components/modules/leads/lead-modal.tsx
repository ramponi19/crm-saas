'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, UserRound, UserCheck, Trash2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Lead, Usuario, type KanbanColumn, ganhoColId } from './types'
import { LeadMatchPanel } from './lead-match-panel'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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

// Entrega real acontece na Edge Function (Graph API / Evolution).
// Canais externos: whatsapp, instagram, messenger. site/manual/null → nota interna.
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook-leads`

// Chama a Edge Function que entrega na Meta/Evolution E grava em lead_mensagens.
// Lança erro com a mensagem da API quando a entrega falha (ex.: fora da janela de 24h).
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
  const router   = useRouter()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft]   = useState('')

  const responsavelInicial = usuarios.find(u => u.id === lead.responsavel_id)?.nome ?? ''
  const canalNome = CANAL_NOME[lead.origem ?? 'manual'] ?? 'Loja'

  const [form, setForm] = useState({
    nome:        lead.nome ?? '',
    tel:         lead.telefone ?? '',
    ig:          lead.instagram ?? '',
    produto:     lead.produto_interessado ?? '',
    canal:       canalNome,
    status:      lead.kanban_status ?? 'novo',
    responsavel: responsavelInicial,
    obs:         lead.observacoes ?? '',
  })
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const [chat, setChat] = useState<ChatMsg[]>([])
  const [loadingChat, setLoadingChat] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Busca mensagens reais de lead_mensagens
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
      const msgs: ChatMsg[] = ((data ?? []) as MsgRow[]).map(m => ({
        from: m.direcao === 'enviada' ? 'loja' : 'cliente',
        text: m.conteudo ?? '',
        time: new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      }))
      setChat(msgs)
      setLoadingChat(false)
      // Rola para a última mensagem após renderizar
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
      // Marca como lidas + zera contador do lead
      if ((lead.msgs_nao_lidas ?? 0) > 0) {
        await supabase.from('lead_mensagens').update({ lida: true }).eq('lead_id', lead.id).eq('lida', false)
        await supabase.from('leads').update({ msgs_nao_lidas: 0 }).eq('id', lead.id)
        onUpdate({ ...lead, msgs_nao_lidas: 0 })
      }
    }
    load()

    // Realtime: escuta novas mensagens deste lead
    const channel = supabase
      .channel(`lead_msgs_${lead.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_mensagens', filter: `lead_id=eq.${lead.id}` },
        (payload: RealtimePostgresChangesPayload<{ id: number; direcao: string; conteudo: string | null; created_at: string; lida: boolean | null }>) => {
          const m = payload.new as { id: number; direcao: string; conteudo: string | null; created_at: string; lida: boolean | null }
          // Evita duplicar mensagens que o próprio vendedor acabou de enviar (otimista)
          setChat(prev => {
            const novaMsg: ChatMsg = {
              from: m.direcao === 'enviada' ? 'loja' : 'cliente',
              text: m.conteudo ?? '',
              time: new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            }
            // Se for enviada e já existir uma igual com time 'agora', substitui
            if (novaMsg.from === 'loja') {
              const idx = prev.findIndex(x => x.from === 'loja' && x.text === novaMsg.text && x.time === 'agora')
              if (idx >= 0) {
                const copy = [...prev]; copy[idx] = novaMsg; return copy
              }
            }
            return [...prev, novaMsg]
          })
          // Mensagem recebida enquanto o modal está aberto → marca como lida na hora
          if (m.direcao === 'recebida' && !m.lida) {
            supabase.from('lead_mensagens').update({ lida: true }).eq('id', m.id)
          }
        })
      .subscribe()

    return () => { cancel = true; supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  // Mantém o scroll no fim quando novas mensagens entram
  useEffect(() => {
    if (!loadingChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.length, loadingChat])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function sendMsg() {
    const t = draft.trim(); if (!t) return
    const canal = lead.origem ?? 'manual'
    setDraft('')
    // Otimista: mostra na hora; o realtime substitui pela linha real (dedup acima).
    setChat(prev => [...prev, { from: 'loja', text: t, time: 'agora' }])

    // Desfaz o otimista e devolve o texto ao vendedor quando a entrega falha.
    const rollback = () => {
      setChat(prev => {
        const idx = prev.findIndex(x => x.from === 'loja' && x.text === t && x.time === 'agora')
        if (idx < 0) return prev
        const copy = [...prev]; copy.splice(idx, 1); return copy
      })
      setDraft(t)
    }

    try {
      if (canal === 'instagram' || canal === 'messenger') {
        // Edge Function entrega na Graph API E grava em lead_mensagens.
        await entregarViaEdge('send_meta', { leadId: lead.id, texto: t, canal })
      } else if (canal === 'whatsapp') {
        if (!lead.telefone) throw new Error('Lead sem telefone para envio no WhatsApp')
        await entregarViaEdge('send', { number: lead.telefone, text: t, leadId: lead.id })
      } else {
        // Sem canal externo (loja/site/manual): registra como nota interna.
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
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar mensagem')
    }
  }

  async function handleSave() {
    setSaving(true)
    const statusKey = form.status || lead.kanban_status || 'novo'
    const respId = usuarios.find(u => u.nome === form.responsavel)?.id ?? lead.responsavel_id

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
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success('Lead atualizado')
    onUpdate({ ...lead, nome: form.nome, telefone: form.tel, instagram: form.ig,
      produto_interessado: form.produto, kanban_status: statusKey, responsavel_id: respId, observacoes: form.obs })
  }

  async function handleConvert() {
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Não autenticado'); setSaving(false); return }

    const { data: vinculo } = await supabase
      .from('empresa_usuarios')
      .select('empresa_id')
      .eq('usuario_id', user.id)
      .eq('ativo', true)
      .single()
    if (!vinculo) { toast.error('Empresa não encontrada'); setSaving(false); return }

    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert({
        empresa_id: vinculo.empresa_id,
        nome: form.nome.trim(),
        telefone: form.tel.trim() || null,
        instagram: form.ig.trim() || null,
        ativo: true,
      })
      .select('id')
      .single()

    if (error || !cliente) { toast.error('Erro ao converter'); setSaving(false); return }

    await supabase
      .from('leads')
      .update({ kanban_status: ganhoColId(columns), convertido_em: cliente.id })
      .eq('id', lead.id)

    setSaving(false)
    toast.success('Lead convertido em cliente!')
    onUpdate({ ...lead, kanban_status: ganhoColId(columns), convertido_em: cliente.id })
    onClose()
  }

  async function handleDelete() {
    if (!confirm('Excluir este lead?')) return
    setSaving(true)
    const { error } = await supabase.from('leads').update({ ativo: false }).eq('id', lead.id)
    setSaving(false)
    if (error) { toast.error('Erro ao excluir'); return }
    toast.success('Lead excluído')
    router.refresh()
    onClose()
  }

  const labelCls = "font-mono text-[10px] tracking-[0.12em] text-[#6B7C92] uppercase mb-[6px] block"
  const inputCls = "w-full bg-white/[0.04] border border-[#16212E]/[0.10] rounded-[9px] px-[11px] py-[9px] text-[13px] text-[#1F2A39] outline-none focus:border-[rgba(215,40,47,0.5)] transition-colors box-border"

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      style={{ background: 'rgba(5,9,16,0.62)' }}>
      <div onClick={e => e.stopPropagation()}
        className="w-[1000px] max-w-[96vw] h-[620px] max-h-[90vh] flex flex-col rounded-[18px] overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid rgba(22,32,46,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)', animation: 'popIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-[22px] py-4 border-b border-[#16212E]/[0.08] flex-wrap">
          <div className="w-[40px] h-[40px] rounded-[11px] bg-white/[0.06] flex items-center justify-center flex-none">
            <UserRound size={22} className="text-[#9FB0C2]" />
          </div>
          <h3 className="font-serif font-medium text-[20px] text-[#16212E]">{form.nome || 'Lead'}</h3>
          <span className="font-mono text-[10px] tracking-[0.1em] text-[#34D399] bg-[rgba(52,211,153,0.13)] px-[10px] py-1 rounded-full">
            {canalNome}
          </span>
          <div className="flex-1" />
          <button onClick={handleConvert} disabled={saving}
            className="flex items-center gap-[7px] px-[14px] py-2 rounded-[10px] bg-[rgba(52,211,153,0.14)] text-[#34D399] text-[12.5px] font-semibold hover:bg-[rgba(52,211,153,0.22)] transition-colors">
            <UserCheck size={15} /> Converter em cliente
          </button>
          <button onClick={handleDelete} disabled={saving}
            className="flex items-center gap-[7px] px-[14px] py-2 rounded-[10px] bg-[rgba(215,40,47,0.14)] text-[#C01F26] text-[12.5px] font-semibold hover:bg-[rgba(215,40,47,0.22)] transition-colors">
            <Trash2 size={15} /> Excluir
          </button>
          <button onClick={onClose}
            className="w-[34px] h-[34px] rounded-[9px] bg-white/[0.05] border border-[#16212E]/[0.10] text-[#9FB0C2] flex items-center justify-center hover:bg-[#16212E]/[0.04] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body: 2 colunas */}
        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: '330px 1fr' }}>

          {/* Coluna esquerda — form */}
          <div className="p-[20px_22px] overflow-y-auto scrollbar-thin border-r border-[#16212E]/[0.08] flex flex-col gap-[13px]">
            <div><label className={labelCls}>Nome</label>
              <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Telefone / WhatsApp</label>
              <input value={form.tel} onChange={e => set('tel', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Instagram</label>
              <input value={form.ig} onChange={e => set('ig', e.target.value)} placeholder="@usuario" className={inputCls} /></div>
            <div><label className={labelCls}>Produto interessado</label>
              <input value={form.produto} onChange={e => set('produto', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Canal de origem</label>
              <input value={form.canal} onChange={e => set('canal', e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Status no funil</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={`${inputCls} cursor-pointer`}>
                {columns.map(c => <option key={c.id} value={c.id} style={{ background: '#FFFFFF' }}>{c.label}</option>)}
              </select></div>
            <div><label className={labelCls}>Responsável</label>
              <select value={form.responsavel} onChange={e => set('responsavel', e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="" style={{ background: '#FFFFFF' }}>Sem responsável</option>
                {usuarios.map(u => <option key={u.id} style={{ background: '#FFFFFF' }}>{u.nome}</option>)}
              </select></div>
            <div><label className={labelCls}>Observações</label>
              <textarea value={form.obs} onChange={e => set('obs', e.target.value)} rows={3}
                placeholder="Produto de interesse, contexto…" className={`${inputCls} resize-none`} /></div>

            {segmento === 'imobiliaria' && <LeadMatchPanel leadId={lead.id} />}
            <button onClick={handleSave} disabled={saving}
              className="flex items-center justify-center gap-2 py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13.5px] hover:-translate-y-[1px] transition-all disabled:opacity-40 mt-1">
              <Save size={17} /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>

          {/* Coluna direita — chat */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-5 py-[14px] font-mono text-[10px] tracking-[0.14em] text-[#6B7C92] border-b border-[#16212E]/[0.07]">
              HISTÓRICO DE MENSAGENS
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-[18px_20px] flex flex-col gap-[10px]" style={{ background: 'rgba(0,0,0,0.18)' }}>
              {loadingChat ? (
                <div className="flex items-center justify-center h-full text-[#788698] text-[13px]">Carregando mensagens…</div>
              ) : chat.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-[#788698] gap-2 py-10">
                  <Send size={28} className="opacity-30" />
                  <p className="text-[13px]">Nenhuma mensagem ainda.</p>
                  <p className="text-[11.5px] text-[#9AA7B6]">As conversas deste canal aparecerão aqui.</p>
                </div>
              ) : chat.map((m, i) => {
                const isLoja = m.from === 'loja'
                return (
                  <div key={i} className={`flex ${isLoja ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[72%] px-[14px] py-[10px] rounded-[14px] text-[13px]"
                      style={{
                        background: isLoja ? 'linear-gradient(180deg,#E03037,#C01F26)' : 'rgba(22,32,46,0.06)',
                        color: isLoja ? '#fff' : '#E9EEF4',
                        borderBottomRightRadius: isLoja ? 4 : 14,
                        borderBottomLeftRadius: isLoja ? 14 : 4,
                      }}>
                      {m.text}
                      <div className="text-[9.5px] mt-[4px]" style={{ color: isLoja ? 'rgba(255,255,255,0.7)' : '#5C6E84' }}>{m.time}</div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 px-5 py-[14px] border-t border-[#16212E]/[0.08]">
              <input value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMsg()}
                placeholder="Digite uma mensagem…"
                className="flex-1 bg-white/[0.05] border border-[#16212E]/[0.10] rounded-[11px] px-[13px] py-[11px] text-[13px] text-[#1F2A39] placeholder:text-[#46586E] outline-none focus:border-[rgba(215,40,47,0.5)] min-w-0" />
              <button onClick={sendMsg}
                className="w-[46px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white flex items-center justify-center flex-none hover:-translate-y-[1px] transition-all">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
