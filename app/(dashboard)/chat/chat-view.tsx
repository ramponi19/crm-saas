'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import { Send, Megaphone, MessageSquare, Trash2, Bell, BellRing } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Select, notify } from '@/components/ui'
import { VAPID_PUBLIC_KEY } from '@/lib/vapid'

export interface Membro { id: string; nome: string; role: string }
export interface MsgInicial { id: number; autor_id: string; conteudo: string; created_at: string | null }
interface Msg { id: number; autor_id: string; destinatario_id?: string | null; conteudo: string; created_at: string | null }

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'agora')

// Converte a chave pública VAPID (base64url) no formato que o pushManager espera.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function ChatView({ empresaId, meuId, membros, muralInicial }: { empresaId: number; meuId: string; membros: Membro[]; muralInicial: MsgInicial[] }) {
  const supabase = createClient()
  const [aba, setAba] = useState<'mural' | 'direto'>('mural')
  const [mural, setMural] = useState<Msg[]>(muralInicial as Msg[])
  const [peer, setPeer] = useState('')
  const [direto, setDireto] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [push, setPush] = useState<'idle' | 'on' | 'unsupported'>('idle')
  const fimRef = useRef<HTMLDivElement>(null)

  const nomePorId = Object.fromEntries(membros.map((m) => [m.id, m.nome])) as Record<string, string>
  const outros = membros.filter((m) => m.id !== meuId)
  const peerRef = useRef(peer); useEffect(() => { peerRef.current = peer }, [peer])

  const scrollFim = useCallback(() => { setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 40) }, [])

  // Estado das notificações: já inscrito neste dispositivo?
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) { setPush('unsupported'); return }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setPush('on') })
      .catch(() => {})
  }, [])

  async function ativarPush() {
    try {
      if (typeof Notification === 'undefined') { notify.warn('Notificações não suportadas neste navegador'); return }
      if (Notification.permission === 'denied') { notify.warn('Notificações bloqueadas', 'Libere nas permissões do navegador para este site'); return }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
      if (!res.ok) { notify.bad('Não foi possível ativar as notificações'); return }
      setPush('on')
      notify.ok('Notificações ativadas neste dispositivo')
    } catch {
      notify.bad('Não foi possível ativar as notificações')
    }
  }

  // Carrega a conversa direta ao escolher o usuário.
  useEffect(() => {
    if (!peer) { setDireto([]); return }
    let cancel = false
    supabase.from('mensagens_internas')
      .select('id, autor_id, destinatario_id, conteudo, created_at')
      .eq('empresa_id', empresaId).eq('tipo', 'direto')
      .or(`and(autor_id.eq.${meuId},destinatario_id.eq.${peer}),and(autor_id.eq.${peer},destinatario_id.eq.${meuId})`)
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (!cancel) { setDireto((data ?? []) as Msg[]); scrollFim() } })
    return () => { cancel = true }
  }, [peer, empresaId, meuId, supabase, scrollFim])

  // Realtime: um canal por empresa; a RLS já filtra (mural p/ todos, direto só meu).
  useEffect(() => {
    const ch = supabase.channel(`chat_${empresaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_internas', filter: `empresa_id=eq.${empresaId}` },
        (payload: RealtimePostgresInsertPayload<Msg & { tipo: string }>) => {
          const m = payload.new
          if (m.tipo === 'mural') {
            setMural((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
            if (aba === 'mural') scrollFim()
          } else if (m.tipo === 'direto') {
            const p = peerRef.current
            const naConversa = (m.autor_id === p && m.destinatario_id === meuId) || (m.autor_id === meuId && m.destinatario_id === p)
            if (naConversa) { setDireto((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]); scrollFim() }
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, meuId])

  useEffect(() => { scrollFim() }, [aba, scrollFim])

  async function enviar() {
    const texto = draft.trim()
    if (!texto) return
    if (aba === 'direto' && !peer) { notify.warn('Escolha com quem conversar'); return }
    setEnviando(true)
    const row = { empresa_id: empresaId, autor_id: meuId, tipo: aba, conteudo: texto, destinatario_id: aba === 'direto' ? peer : null }
    const { data, error } = await supabase.from('mensagens_internas').insert(row).select('id, autor_id, destinatario_id, conteudo, created_at').single()
    setEnviando(false)
    if (error) { notify.bad('Erro ao enviar', error.message); return }
    setDraft('')
    const m = data as Msg
    if (aba === 'mural') setMural((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
    else {
      setDireto((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
      // Notifica o destinatário no celular (best-effort; não bloqueia o envio).
      fetch('/api/chat/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinatario_id: peer, texto }) }).catch(() => {})
    }
    scrollFim()
  }

  async function apagar(id: number, tipo: 'mural' | 'direto') {
    const { error } = await supabase.from('mensagens_internas').delete().eq('id', id)
    if (error) { notify.bad('Erro ao apagar'); return }
    if (tipo === 'mural') setMural((p) => p.filter((x) => x.id !== id)); else setDireto((p) => p.filter((x) => x.id !== id))
  }

  const lista = aba === 'mural' ? mural : direto
  const vazio = aba === 'direto' && !peer

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Chat" />
      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col overflow-hidden">
        {/* Abas */}
        <div className="flex items-center justify-between border-b border-line-soft px-4 pt-3">
          <div className="flex gap-1">
            {([['mural', 'Mural de recados', Megaphone], ['direto', 'Chat direto', MessageSquare]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setAba(id)}
                className={`flex items-center gap-2 border-b-2 px-3 pb-2.5 text-[13.5px] font-semibold transition-colors ${aba === id ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink-2'}`}>
                <Icon size={15} strokeWidth={1.7} />{label}
              </button>
            ))}
          </div>
          {push !== 'unsupported' && (
            push === 'on' ? (
              <span className="mb-2 flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok/8 px-2.5 py-1 text-[11.5px] font-semibold text-ok" title="Notificações ativas neste dispositivo">
                <BellRing size={13} strokeWidth={1.8} /> Notificações on
              </span>
            ) : (
              <button onClick={ativarPush}
                className="mb-2 flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 transition-colors hover:border-accent hover:text-accent"
                title="Receber notificação de mensagens diretas no celular">
                <Bell size={13} strokeWidth={1.8} /> Ativar notificações
              </button>
            )
          )}
        </div>

        {/* Seletor de usuário (direto) */}
        {aba === 'direto' && (
          <div className="border-b border-line-soft px-4 py-3">
            <Select label="Conversar com" value={peer} onChange={(e) => setPeer(e.target.value)}>
              <option value="">Selecionar usuário…</option>
              {outros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Select>
          </div>
        )}

        {/* Mensagens */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4 scrollbar-thin">
          {vazio ? (
            <div className="flex h-full items-center justify-center text-center text-[13px] text-ink-3">Selecione um usuário para conversar.</div>
          ) : lista.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-ink-3">
              <p className="text-[14px] font-medium">Nenhuma mensagem ainda</p>
              <p className="text-[12px]">Comece a conversa enviando uma mensagem.</p>
            </div>
          ) : lista.map((m) => {
            const meu = m.autor_id === meuId
            return (
              <div key={m.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                <div className={`group max-w-[74%] ${meu ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  {aba === 'mural' && !meu && <span className="px-1 text-[11px] font-semibold text-ink-2">{nomePorId[m.autor_id] ?? '—'}</span>}
                  <div className={`rounded-[12px] px-3.5 py-2.5 text-[13.5px] ${meu ? 'rounded-br-[3px] bg-ink text-white' : 'rounded-bl-[3px] border border-line bg-card text-ink'}`}>
                    {m.conteudo}
                    <div className={`mt-1 flex items-center gap-2 text-[9.5px] ${meu ? 'text-white/55' : 'text-ink-3'}`}>
                      <span className="num">{hora(m.created_at)}</span>
                      {meu && <button onClick={() => apagar(m.id, aba)} className="opacity-0 transition-opacity group-hover:opacity-100" aria-label="Apagar"><Trash2 size={11} strokeWidth={1.8} /></button>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={fimRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 border-t border-line-soft bg-card px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            disabled={vazio || enviando}
            placeholder={vazio ? 'Escolha um usuário…' : 'Escreva uma mensagem…'}
            className="h-10 min-w-0 flex-1 rounded-control border border-line bg-bg px-3.5 text-[14px] text-ink placeholder:text-ink-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
          />
          <button onClick={enviar} disabled={vazio || enviando || !draft.trim()}
            className="flex h-10 items-center gap-2 rounded-control bg-ink px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            <Send size={16} strokeWidth={1.8} /> Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
