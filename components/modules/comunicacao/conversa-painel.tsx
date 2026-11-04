'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCheck, Check, Clock, FileText, History, ListPlus, Loader2, Paperclip, Send, StickyNote, AlertTriangle, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, ConfirmDialog, Input, Modal, Select, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { urlDeMidia } from '@/lib/storage/midia'
import { formatarTextoChat } from '@/lib/texto-whatsapp'
import { AnuncioChat } from '@/components/modules/conversa/anuncio-chat'
import { entregarViaEdge, ehTimeoutMeta, TIPO_DB } from '@/lib/envio-edge'
import { useTempoReal, type EventoTR, type LinhaMensagemTR } from '@/components/layout/tempo-real-empresa'
import {
  apagarNota, criarTarefa, editarNota, gravarNota, lerConversa, marcarConversaLida, mensagensDaConversa, negocioDaConversa, notasDaConversa,
  type ConversaInbox, type MensagemInbox, type NegocioDaConversa, type NotaInbox,
} from '@/lib/inbox/consultas'
import { LeadModal } from '@/components/modules/leads/lead-modal'
import { ICONE_CANAL, horaCurta, nomeDoContato, type InboxProps } from './inbox-view'

const NOME_CANAL = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger' } as const
const JANELA_WHATSAPP_MS = 24 * 60 * 60 * 1000

/** Bolha local enquanto a Edge não devolve a linha gravada (o realtime a substitui). */
type Otimista = { chave: string; conteudo: string; tipo: string; midia_url: string | null; created_at: string; status: 'enviando' | 'falha_envio'; erro?: string }

type ItemLinha =
  | { tipo: 'msg'; em: number; m: MensagemInbox }
  | { tipo: 'nota'; em: number; n: NotaInbox }
  | { tipo: 'otimista'; em: number; o: Otimista }

type ModeloAprovado = { id: number; nome: string; idioma: string; corpo: string }

export function ConversaPainel({
  conversaId, inicial, empresaId, meuId, usuarios, etapas, funilPadrao, motivos, perfil, onVoltar, onAbrirConversa,
}: InboxProps & { conversaId: number; inicial: ConversaInbox | null; onVoltar: () => void; onAbrirConversa: (id: number) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const { assinar, aoReconectar } = useTempoReal()
  const [conversa, setConversa] = useState<ConversaInbox | null>(inicial)
  const [naoEncontrada, setNaoEncontrada] = useState(false)
  const [negocio, setNegocio] = useState<NegocioDaConversa | null>(null)
  const [mensagens, setMensagens] = useState<MensagemInbox[] | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false)
  const [notas, setNotas] = useState<NotaInbox[]>([])
  const [otimistas, setOtimistas] = useState<Otimista[]>([])
  const [outrasLojas, setOutrasLojas] = useState<{ filialId: number; nome: string }[]>([])
  const [conversaAtual, setConversaAtual] = useState<number | null>(null)
  const [modo, setModo] = useState<'responder' | 'nota'>('responder')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [tarefaAberta, setTarefaAberta] = useState(false)
  const [tarefa, setTarefa] = useState({ titulo: '', vencimento: '' })
  const [salvandoTarefa, setSalvandoTarefa] = useState(false)
  const [card, setCard] = useState<{ leadId: number; funilId: number | null } | null>(null)
  const [modelosAbertos, setModelosAbertos] = useState(false)
  const [modelos, setModelos] = useState<ModeloAprovado[] | null>(null)
  const [modelo, setModelo] = useState<ModeloAprovado | null>(null)
  const [params, setParams] = useState<string[]>([])
  const fimRef = useRef<HTMLDivElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const naoRolar = useRef(false)

  const nomeDe = useCallback((id: string | null) => (id ? usuarios.find((u) => u.id === id)?.nome ?? 'Atendente' : null), [usuarios])

  /** Marca como lida só com a aba à vista: conversa aberta numa aba esquecida não foi lida. */
  const marcarSeVisivel = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      marcarConversaLida(supabase, conversaId).catch(() => {})
    }
  }, [supabase, conversaId])

  // Carga: conversa (se não veio da lista), mensagens, notas, negócio e outras lojas.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const c = inicial ?? await lerConversa(supabase, conversaId)
      if (!vivo) return
      if (!c) { setNaoEncontrada(true); return }
      setConversa(c)
      const [msgs, ns, neg] = await Promise.all([
        mensagensDaConversa(supabase, conversaId),
        notasDaConversa(supabase, conversaId),
        negocioDaConversa(supabase, c),
      ])
      if (!vivo) return
      setMensagens(msgs.mensagens); setTemMais(msgs.temMais); setNotas(ns); setNegocio(neg)
      marcarSeVisivel()
      fetch(`/api/comunicacao/${conversaId}/lojas`).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (vivo && j?.outrasLojas) setOutrasLojas(j.outrasLojas)
      }).catch(() => {})
      // Conversa anterior aos canais: a resposta sai pela conversa atual do contato.
      if (c.canal_id == null && c.contato_id != null) {
        const { data } = await supabase.from('conversas').select('id').eq('contato_id', c.contato_id)
          .not('canal_id', 'is', null).order('ultima_mensagem_at', { ascending: false, nullsFirst: false }).limit(1)
        if (vivo) setConversaAtual(((data ?? []) as { id: number }[])[0]?.id ?? null)
      }
    })().catch((e) => { if (vivo) notify.bad('Não foi possível abrir a conversa', (e as Error).message) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a conversa é a chave (o pai monta com key=conversaId)
  }, [conversaId])

  // Voltou para a aba com a conversa aberta: o que chegou enquanto estava escondida foi lido agora.
  useEffect(() => {
    const aoVer = () => { if (document.visibilityState === 'visible') marcarSeVisivel() }
    document.addEventListener('visibilitychange', aoVer)
    window.addEventListener('focus', aoVer)
    return () => { document.removeEventListener('visibilitychange', aoVer); window.removeEventListener('focus', aoVer) }
  }, [marcarSeVisivel])

  // Tempo real pelo hub da aba: mensagens desta conversa e a própria conversa.
  useEffect(() => assinar((e: EventoTR) => {
    if (e.tabela === 'conversas') {
      if (e.novo && e.novo.id === conversaId) setConversa((c) => (c ? { ...c, ...e.novo, contato: c.contato, canal: c.canal } : c))
      return
    }
    const m = e.novo as LinhaMensagemTR
    if (m.conversa_id !== conversaId) return
    const linha: MensagemInbox = {
      id: m.id, conversa_id: m.conversa_id, direcao: m.direcao, conteudo: m.conteudo, created_at: m.created_at,
      tipo: m.tipo, origem: null, midia_url: m.midia_url, status_entrega: m.status_entrega, erro_envio: m.erro_envio,
      external_id: m.external_id, usuario_id: m.usuario_id, transcricao: null, midia_retida_em: null, lida: m.lida,
    }
    if (e.tipo === 'INSERT') {
      setMensagens((l) => (l && !l.some((x) => x.id === m.id) ? [...l, linha] : l))
      if (m.direcao === 'enviada') {
        // A linha gravada substitui a bolha local: mídia pela URL, texto pelo conteúdo.
        setOtimistas((o) => {
          const i = o.findIndex((x) => (x.midia_url ? x.midia_url === m.midia_url : x.conteudo === m.conteudo))
          return i < 0 ? o : o.filter((_, k) => k !== i)
        })
      } else if (!m.lida) marcarSeVisivel()
    } else {
      setMensagens((l) => l?.map((x) => (x.id === m.id ? { ...x, ...linha, transcricao: x.transcricao, origem: x.origem, midia_retida_em: x.midia_retida_em } : x)) ?? l)
    }
  }), [assinar, conversaId, marcarSeVisivel])

  // Caiu e voltou: relê as últimas mensagens.
  useEffect(() => aoReconectar(() => {
    mensagensDaConversa(supabase, conversaId).then((r) => setMensagens((atual) => {
      if (!atual) return r.mensagens
      const ids = new Set(atual.map((x) => x.id))
      return [...atual, ...r.mensagens.filter((x) => !ids.has(x.id))]
    })).catch(() => {})
  }), [aoReconectar, supabase, conversaId])

  const linhaDoTempo = useMemo<ItemLinha[]>(() => {
    const itens: ItemLinha[] = [
      ...(mensagens ?? []).map((m) => ({ tipo: 'msg' as const, em: new Date(m.created_at).getTime(), m })),
      ...notas.map((n) => ({ tipo: 'nota' as const, em: new Date(n.em).getTime(), n })),
      ...otimistas.map((o) => ({ tipo: 'otimista' as const, em: new Date(o.created_at).getTime(), o })),
    ]
    // Notas mais antigas que a primeira mensagem carregada só aparecem quando as anteriores chegarem.
    const primeira = mensagens?.[0] ? new Date(mensagens[0].created_at).getTime() : 0
    return itens.filter((i) => i.tipo !== 'nota' || !temMais || i.em >= primeira).sort((a, b) => a.em - b.em)
  }, [mensagens, notas, otimistas, temMais])

  useEffect(() => {
    if (naoRolar.current) { naoRolar.current = false; return }
    fimRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [linhaDoTempo.length])

  async function carregarAnteriores() {
    const primeira = mensagens?.[0]
    if (!primeira) return
    setCarregandoAnteriores(true)
    try {
      const r = await mensagensDaConversa(supabase, conversaId, { momento: primeira.created_at, id: primeira.id })
      naoRolar.current = true
      setMensagens((l) => [...r.mensagens, ...(l ?? [])])
      setTemMais(r.temMais)
    } finally {
      setCarregandoAnteriores(false)
    }
  }

  const canal = conversa?.canal?.tipo ?? null
  const ultimaDoCliente = conversa?.ultima_recebida_at ? new Date(conversa.ultima_recebida_at).getTime() : null
  const agora = Date.now()
  const janelaFechada = canal === 'whatsapp' && (!ultimaDoCliente || agora - ultimaDoCliente > JANELA_WHATSAPP_MS)
  const podeResponder = !!canal && !!negocio && !janelaFechada

  /** Responder ASSUME o lead livre (a mesma regra do card): quem respondeu primeiro fica com ele. */
  async function assumirSeLivre() {
    if (!negocio || negocio.responsavel_id) return
    const r = await fetch(`/api/leads/${negocio.id}/card`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assumir: true }),
    })
    const j = await r.json().catch(() => ({})) as { assumido?: boolean; responsavelId?: string | null }
    if (!r.ok) return
    if (j.responsavelId) setNegocio((n) => (n ? { ...n, responsavel_id: j.responsavelId ?? null } : n))
    if (j.assumido) notify.ok('Lead é seu', 'Você assumiu o atendimento ao responder.')
    else if (j.responsavelId && j.responsavelId !== meuId) notify.warn('Este lead já tem dono', `${nomeDe(j.responsavelId)} assumiu o atendimento primeiro.`)
  }

  async function enviarTexto(t: string) {
    if (!conversa || !negocio || !canal) return
    const chave = `o-${Date.now()}`
    setOtimistas((o) => [...o, { chave, conteudo: t, tipo: 'texto', midia_url: null, created_at: new Date().toISOString(), status: 'enviando' }])
    try {
      if (canal === 'whatsapp') {
        if (!conversa.contato?.telefone) throw new Error('Contato sem telefone para o WhatsApp.')
        await entregarViaEdge(supabase, 'send', { number: conversa.contato.telefone, text: t, leadId: negocio.id })
      } else {
        await entregarViaEdge(supabase, 'send_meta', { leadId: negocio.id, texto: t, canal })
      }
      await assumirSeLivre()
    } catch (e) {
      if (ehTimeoutMeta(e)) {
        setOtimistas((o) => o.map((x) => (x.chave === chave ? { ...x, status: 'falha_envio', erro: (e as Error).message } : x)))
        notify.warn('A Meta não respondeu', (e as Error).message)
        return
      }
      setOtimistas((o) => o.filter((x) => x.chave !== chave))
      setTexto((atual) => atual || t)
      notify.bad('Erro ao enviar', (e as Error).message)
    }
  }

  async function enviar() {
    const t = texto.trim()
    if (!t || !conversa) return
    setEnviando(true)
    try {
      if (modo === 'nota') {
        const n = await gravarNota(supabase, conversa, empresaId, meuId, t)
        setNotas((l) => [...l, n])
        setTexto('')
        return
      }
      setTexto('')
      await enviarTexto(t)
    } catch (e) {
      notify.bad('Não foi possível gravar', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function enviarArquivo(file: File) {
    if (!conversa || !negocio || !canal) return
    setEnviando(true)
    let chave: string | null = null
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd })
      const up = await res.json().catch(() => ({})) as { url?: string; tipoMidia?: 'image' | 'video' | 'audio'; error?: string }
      if (!res.ok || !up.url || !up.tipoMidia) throw new Error(up.error ?? 'Falha ao subir o arquivo')
      const tipoDb = TIPO_DB[up.tipoMidia]
      chave = `o-${Date.now()}`
      setOtimistas((o) => [...o, { chave: chave as string, conteudo: `[${tipoDb}]`, tipo: tipoDb, midia_url: up.url as string, created_at: new Date().toISOString(), status: 'enviando' }])
      if (canal === 'whatsapp') {
        if (!conversa.contato?.telefone) throw new Error('Contato sem telefone para o WhatsApp.')
        await entregarViaEdge(supabase, 'send', { number: conversa.contato.telefone, leadId: negocio.id, midiaUrl: up.url, tipoMidia: up.tipoMidia })
      } else {
        await entregarViaEdge(supabase, 'send_meta', { leadId: negocio.id, canal, midiaUrl: up.url, tipoMidia: up.tipoMidia })
      }
      await assumirSeLivre()
    } catch (e) {
      if (chave && ehTimeoutMeta(e)) {
        setOtimistas((o) => o.map((x) => (x.chave === chave ? { ...x, status: 'falha_envio', erro: (e as Error).message } : x)))
        notify.warn('A Meta não respondeu', (e as Error).message)
      } else {
        if (chave) setOtimistas((o) => o.filter((x) => x.chave !== chave))
        notify.bad('Erro ao enviar arquivo', (e as Error).message)
      }
    } finally {
      setEnviando(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  async function abrirModelos() {
    setModelosAbertos(true); setModelo(null); setParams([])
    if (modelos) return
    try {
      const r = await fetch('/api/modelos')
      const j = await r.json()
      setModelos(((j.modelos ?? []) as (ModeloAprovado & { status: string })[]).filter((m) => m.status === 'aprovado'))
    } catch {
      setModelos([]); notify.bad('Não foi possível carregar os modelos.')
    }
  }

  const previaModelo = modelo ? modelo.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : ''

  async function enviarModelo() {
    if (!modelo || !negocio || !conversa?.contato?.telefone) return
    const faltam = (modelo.corpo.match(/\{\{\d+\}\}/g) ?? []).length
    if (params.filter((p) => p?.trim()).length < faltam) return notify.warn('Preencha todas as variáveis do modelo.')
    setEnviando(true)
    try {
      await entregarViaEdge(supabase, 'send_template', {
        leadId: negocio.id, number: conversa.contato.telefone, modelo: modelo.nome,
        idioma: modelo.idioma, parametros: params, previa: previaModelo,
      })
      setModelosAbertos(false)
      notify.ok('Modelo enviado. A conversa reabre quando o cliente responder.')
    } catch (e) {
      notify.bad((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function salvarTarefa() {
    if (!negocio) return
    setSalvandoTarefa(true)
    try {
      await criarTarefa(supabase, empresaId, negocio, conversa?.contato_id ?? null, meuId, {
        titulo: tarefa.titulo, tipo: 'outro', vencimento: tarefa.vencimento ? new Date(tarefa.vencimento).toISOString() : null,
      })
      notify.ok('Tarefa criada')
      setTarefa({ titulo: '', vencimento: '' }); setTarefaAberta(false)
    } catch (e) {
      notify.bad('Não foi possível criar a tarefa', (e as Error).message)
    } finally {
      setSalvandoTarefa(false)
    }
  }

  async function abrirCard() {
    if (!negocio) return
    const { data } = await supabase.from('negocios').select('funil_id').eq('id', negocio.id).maybeSingle()
    setCard({ leadId: negocio.id, funilId: (data as { funil_id: number | null } | null)?.funil_id ?? null })
  }
  const colunasDoCard = useMemo(() => {
    if (!card) return []
    const funil = card.funilId ?? funilPadrao
    const doFunil = etapas.filter((e) => funil == null || e.funilId === funil)
    return doFunil.length ? doFunil : etapas
  }, [card, etapas, funilPadrao])

  if (naoEncontrada) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[13px] text-ink-3">
        Esta conversa não está na loja selecionada no topo — ou você não tem acesso a ela.
        <Button variant="outline" size="sm" onClick={onVoltar}>Voltar às conversas</Button>
      </div>
    )
  }

  const Icone = canal ? ICONE_CANAL[canal] : History

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      {/* Cabeçalho */}
      <header className="flex items-center gap-3 border-b border-line-soft bg-card px-4 py-2.5">
        <button onClick={onVoltar} aria-label="Voltar às conversas" className="grid h-8 w-8 place-items-center rounded-control text-ink-2 hover:bg-bg md:hidden">
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-ink">{conversa ? nomeDoContato(conversa.contato) : 'Carregando…'}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
            <span className="inline-flex items-center gap-1"><Icone size={12} strokeWidth={1.8} /> {canal ? NOME_CANAL[canal] : 'Anterior aos canais'}{conversa?.canal?.nome_exibicao ? ` · ${conversa.canal.nome_exibicao}` : ''}</span>
            {conversa?.contato?.telefone && <span>{conversa.contato.telefone}</span>}
            {conversa?.contato?.instagram && <span>@{conversa.contato.instagram}</span>}
            {negocio?.responsavel_id && <span className="inline-flex items-center gap-1"><UserRound size={11} /> {nomeDe(negocio.responsavel_id)}</span>}
            {outrasLojas.length > 0 && (
              <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn" data-tambem-em>
                também em {outrasLojas.map((l) => l.nome).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Button variant="outline" size="sm" icon={<ListPlus size={14} />} disabled={!negocio} onClick={() => setTarefaAberta((v) => !v)}>Tarefa</Button>
          <Button variant="outline" size="sm" icon={<FileText size={14} />} disabled={!negocio} onClick={abrirCard}>Abrir card</Button>
        </div>
      </header>

      {tarefaAberta && (
        <div className="flex flex-wrap items-end gap-2 border-b border-line-soft bg-card px-4 py-3">
          <div className="min-w-[200px] flex-1">
            <Input placeholder="O que fazer (ex.: ligar para fechar o valor)" value={tarefa.titulo} onChange={(e) => setTarefa((t) => ({ ...t, titulo: e.target.value }))} />
          </div>
          <Input type="datetime-local" aria-label="Prazo" value={tarefa.vencimento} onChange={(e) => setTarefa((t) => ({ ...t, vencimento: e.target.value }))} className="w-[200px]" />
          <Button size="sm" loading={salvandoTarefa} disabled={!tarefa.titulo.trim()} onClick={salvarTarefa}>Criar tarefa</Button>
        </div>
      )}

      {/* Mensagens e notas */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin" data-linha-do-tempo>
        {mensagens === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-3"><Loader2 size={15} className="animate-spin" /> Carregando mensagens…</div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-1.5">
            {temMais && (
              <div className="mb-2 flex justify-center">
                <Button variant="ghost" size="sm" loading={carregandoAnteriores} onClick={carregarAnteriores}>Ver mensagens anteriores</Button>
              </div>
            )}
            {linhaDoTempo.length === 0 && <p className="py-8 text-center text-[13px] text-ink-3">Nenhuma mensagem nesta conversa.</p>}
            {linhaDoTempo.map((i) => (
              i.tipo === 'nota' ? <BolhaNota key={`n${i.n.id}`} n={i.n} autor={nomeDe(i.n.por_usuario)} minha={i.n.por_usuario === meuId}
                  onMudou={(nova) => setNotas((l) => l.map((x) => (x.id === nova.id ? nova : x)))}
                  onApagou={(id) => setNotas((l) => l.filter((x) => x.id !== id))} />
                : i.tipo === 'otimista' ? <Bolha key={i.o.chave} lado="loja" conteudo={i.o.conteudo} tipo={i.o.tipo} midia={i.o.midia_url} hora="agora" status={i.o.status} erro={i.o.erro} />
                : <Bolha key={i.m.id} id={i.m.id} lado={i.m.direcao === 'enviada' ? 'loja' : 'cliente'} conteudo={i.m.conteudo} tipo={i.m.tipo ?? 'texto'}
                    midia={i.m.midia_url} retida={i.m.midia_retida_em} transcricao={i.m.transcricao} hora={horaCurta(i.m.created_at)}
                    status={i.m.status_entrega} erro={i.m.erro_envio} autor={i.m.direcao === 'enviada' ? nomeDe(i.m.usuario_id) : null} />
            ))}
            <div ref={fimRef} />
          </div>
        )}
      </div>

      {/* Escrever */}
      <footer className="border-t border-line-soft bg-card px-4 pb-3 pt-2">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-2 flex items-center gap-1">
            <AbaEscrita ativa={modo === 'responder'} onClick={() => setModo('responder')}><Send size={12} /> Responder</AbaEscrita>
            <AbaEscrita ativa={modo === 'nota'} onClick={() => setModo('nota')}><StickyNote size={12} /> Nota interna</AbaEscrita>
            {canal === 'whatsapp' && (
              <button onClick={abrirModelos} disabled={!negocio} className="ml-auto text-[11.5px] font-medium text-accent hover:underline disabled:opacity-50">Enviar modelo</button>
            )}
          </div>
          {modo === 'responder' && !canal ? (
            <div className="flex flex-wrap items-center gap-2 rounded-control bg-warn-soft px-3 py-2 text-[12px] text-warn">
              <AlertTriangle size={14} /> Conversa anterior à conexão dos canais: a resposta sai pela conversa atual do contato.
              {conversaAtual && <button className="font-semibold underline" onClick={() => onAbrirConversa(conversaAtual)}>Ir para a conversa atual</button>}
            </div>
          ) : modo === 'responder' && janelaFechada ? (
            <div className="flex flex-wrap items-center gap-2 rounded-control bg-warn-soft px-3 py-2 text-[12px] text-warn">
              <Clock size={14} /> O cliente não escreve há mais de 24 h: o WhatsApp só aceita um modelo aprovado.
              <button className="font-semibold underline" onClick={abrirModelos}>Enviar modelo</button>
            </div>
          ) : (
            <div className={cn('flex items-end gap-2 rounded-control border px-2 py-1.5', modo === 'nota' ? 'border-warn/40 bg-warn-soft/40' : 'border-line bg-card')}>
              {modo === 'responder' && (
                <>
                  <input ref={arquivoRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f) }} />
                  <button aria-label="Anexar arquivo" disabled={!podeResponder || enviando} onClick={() => arquivoRef.current?.click()} className="grid h-8 w-8 flex-none place-items-center rounded-control text-ink-2 hover:bg-bg disabled:opacity-40">
                    <Paperclip size={16} />
                  </button>
                </>
              )}
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                rows={1}
                placeholder={modo === 'nota' ? 'Nota para a equipe — o cliente não vê' : (negocio ? 'Escreva a resposta…' : 'Carregando…')}
                className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-[13px] outline-none placeholder:text-ink-3"
              />
              <Button size="sm" loading={enviando} disabled={!texto.trim() || (modo === 'responder' && !podeResponder)} onClick={enviar}>
                {modo === 'nota' ? 'Salvar nota' : 'Enviar'}
              </Button>
            </div>
          )}
        </div>
      </footer>

      <Modal open={modelosAbertos} onClose={() => setModelosAbertos(false)} title="Enviar modelo aprovado"
        footer={<><Button variant="ghost" onClick={() => setModelosAbertos(false)}>Cancelar</Button><Button loading={enviando} disabled={!modelo} onClick={enviarModelo}>Enviar</Button></>}>
        {modelos === null ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-3"><Loader2 size={14} className="animate-spin" /> Carregando modelos…</div>
        ) : modelos.length === 0 ? (
          <p className="text-[13px] text-ink-3">Nenhum modelo aprovado. Crie e envie para aprovação em Modelos.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Select value={modelo?.id ?? ''} onChange={(e) => { const m = modelos.find((x) => x.id === Number(e.target.value)) ?? null; setModelo(m); setParams([]) }}>
              <option value="">Escolha o modelo</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Select>
            {modelo && (modelo.corpo.match(/\{\{\d+\}\}/g) ?? []).map((_, k) => (
              <Input key={k} placeholder={`Variável {{${k + 1}}}`} value={params[k] ?? ''} onChange={(e) => setParams((p) => { const c = [...p]; c[k] = e.target.value; return c })} />
            ))}
            {modelo && <p className="whitespace-pre-wrap rounded-control bg-bg p-3 text-[12.5px] text-ink-2">{previaModelo}</p>}
          </div>
        )}
      </Modal>

      {card && (
        <LeadModal
          key={card.leadId}
          leadId={card.leadId}
          usuarios={usuarios}
          columns={colunasDoCard}
          perfil={perfil}
          motivos={motivos}
          onClose={() => setCard(null)}
          onNaoEncontrado={() => { setCard(null); notify.warn('O lead não está na loja selecionada no topo.') }}
          onUpdate={(l) => setNegocio((n) => (n && n.id === l.id ? { ...n, responsavel_id: l.responsavel_id ?? null } : n))}
        />
      )}
    </div>
  )
}

function AbaEscrita({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativa}
      className={cn('inline-flex items-center gap-1 rounded-control px-2.5 py-1 text-[11.5px] font-medium transition-colors',
        ativa ? 'bg-ink/[0.07] text-ink' : 'text-ink-3 hover:text-ink')}>
      {children}
    </button>
  )
}

/**
 * Nota interna. Quem escreveu pode editar e apagar (RLS de `eventos`, migração
 * 20261104000400); os colegas da loja só leem.
 */
function BolhaNota({ n, autor, minha, onMudou, onApagou }: {
  n: NotaInbox; autor: string | null; minha: boolean
  onMudou: (n: NotaInbox) => void; onApagou: (id: number) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(n.texto)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  async function salvar() {
    setOcupado(true)
    try {
      await editarNota(supabase, n.id, texto)
      onMudou({ ...n, texto: texto.trim(), editada_em: new Date().toISOString() })
      setEditando(false)
    } catch (e) {
      notify.bad('Não foi possível editar a nota', (e as Error).message)
    } finally {
      setOcupado(false)
    }
  }
  async function apagar() {
    setOcupado(true)
    try {
      await apagarNota(supabase, n.id)
      onApagou(n.id)
    } catch (e) {
      notify.bad('Não foi possível apagar a nota', (e as Error).message)
      setOcupado(false); setConfirmar(false)
    }
  }

  return (
    <div className="my-1 self-center rounded-control border border-warn/30 bg-warn-soft/60 px-3 py-2 text-[12.5px] text-ink sm:max-w-[80%]" data-nota-id={n.id}>
      <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warn">
        <StickyNote size={11} /> Nota interna · {autor ?? 'equipe'} · {horaCurta(n.em)}{n.editada_em ? ' · editada' : ''}
        {minha && !editando && (
          <span className="ml-auto flex gap-2 normal-case tracking-normal">
            <button className="font-medium hover:underline" onClick={() => { setTexto(n.texto); setEditando(true) }}>Editar</button>
            <button className="font-medium hover:underline" onClick={() => setConfirmar(true)}>Apagar</button>
          </span>
        )}
      </div>
      {editando ? (
        <div className="flex flex-col gap-1.5">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
            className="w-full resize-y rounded-control border border-line bg-card px-2 py-1.5 text-[12.5px] outline-none focus:border-ink/30" />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button size="sm" loading={ocupado} disabled={!texto.trim()} onClick={salvar}>Salvar</Button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap">{n.texto}</div>
      )}
      <ConfirmDialog open={confirmar} onClose={() => setConfirmar(false)} onConfirm={apagar}
        title="Apagar esta nota?" description="A nota sai da conversa para toda a equipe. Não dá para desfazer."
        confirmLabel="Apagar" tone="danger" loading={ocupado} />
    </div>
  )
}

function Bolha({ id, lado, conteudo, tipo, midia, retida, transcricao, hora, status, erro, autor }: {
  id?: number; lado: 'cliente' | 'loja'; conteudo: string | null; tipo: string; midia: string | null
  retida?: string | null; transcricao?: string | null; hora: string; status?: string | null; erro?: string | null; autor?: string | null
}) {
  const url = midia ? urlDeMidia(midia) : null
  // Mensagem de anúncio: o conteúdo é o JSON do anúncio e a mídia é a imagem dele.
  // Mesmo cartão do card do lead — nunca o JSON cru nem "Abrir arquivo".
  const anuncio = tipo === 'anuncio'
  const texto = !anuncio && conteudo && !(tipo !== 'texto' && /^\[[a-z]+\]$/.test(conteudo)) ? conteudo : null
  return (
    <div className={cn('flex', lado === 'loja' ? 'justify-end' : 'justify-start')} data-mensagem-id={id}>
      <div className={cn('max-w-[80%] rounded-card px-3 py-2 text-[13px] leading-relaxed shadow-[0_1px_1px_rgba(21,24,28,0.04)]',
        lado === 'loja' ? 'bg-accent-soft text-ink' : 'bg-card text-ink',
        status === 'falha_envio' && 'ring-1 ring-bad/40')}>
        {autor && <div className="mb-0.5 text-[10.5px] font-semibold text-accent">{autor}</div>}
        {/* URL assinada e curta (/api/midia): o otimizador de imagens não cabe aqui. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && tipo === 'imagem' && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem" className="mb-1 max-h-[260px] rounded-control" /></a>}
        {url && tipo === 'video' && <video src={url} controls className="mb-1 max-h-[260px] rounded-control" />}
        {url && tipo === 'audio' && <audio src={url} controls className="mb-1 w-[240px]" />}
        {anuncio && <AnuncioChat conteudo={conteudo ?? ''} midiaUrl={url} />}
        {url && !anuncio && !['imagem', 'video', 'audio'].includes(tipo) && <a href={url} target="_blank" rel="noreferrer" className="mb-1 block text-accent underline">Abrir arquivo</a>}
        {!url && retida && <div className="mb-1 text-[11.5px] italic text-ink-3">Arquivo retirado pela retenção de mídia.</div>}
        {transcricao && <div className="mb-1 text-[12px] italic text-ink-2">“{transcricao}”</div>}
        {texto && <div className="whitespace-pre-wrap break-words">{formatarTextoChat(texto)}</div>}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-ink-3">
          {hora}
          {lado === 'loja' && (status === 'enviando' ? <Clock size={11} />
            : status === 'lida' ? <CheckCheck size={12} className="text-accent" />
            : status === 'entregue' ? <CheckCheck size={12} />
            : status === 'falha_envio' ? <AlertTriangle size={11} className="text-bad" />
            : <Check size={12} />)}
        </div>
        {status === 'falha_envio' && erro && <div className="mt-0.5 text-[11px] text-bad">{erro}</div>}
      </div>
    </div>
  )
}
