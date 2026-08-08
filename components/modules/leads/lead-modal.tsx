'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Send, UserCheck, Trash2, UserRound, X, Paperclip, Mic, Square, Loader2, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { useEmpresa } from '@/lib/empresa-context'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Lead, Usuario, type KanbanColumn, ganhoColId, CAMPOS_QUALIFICACAO } from './types'
import { LeadMatchPanel } from './lead-match-panel'
import { LeadInteressePanel } from './lead-interesse-panel'
import { LeadFinanciamentoPanel } from './lead-financiamento-panel'
import { LeadChamadasPanel } from './lead-chamadas-panel'
import { LeadCadenciaPanel } from './lead-cadencia-panel'
import { LeadOrcamentoPanel } from './lead-orcamento-panel'
import { LeadReservaPanel } from './lead-reserva-panel'
import { ProdutoAutocomplete } from './produto-autocomplete'
import { formatarTextoChat } from '@/lib/texto-whatsapp'
import { EmojiPicker } from './emoji-picker'
import { LeadAcoesPanel } from './lead-acoes-panel'
import { ResponsavelPanel } from './responsavel-panel'
import { useRouter } from 'next/navigation'
import { Input, Select, Textarea, Button, IconButton, Badge, ConfirmDialog, Modal, notify } from '@/components/ui'
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

// ⚠️ Zona sensível (Meta). Entrega real acontece na Edge Function, pela Graph API.
// NÃO alterar a lógica abaixo sem alinhamento — impacta a aprovação de API da Meta.
const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook-leads`

// Manda o token da SESSÃO, não a anon key. A anon key é pública (vai no bundle do
// front), então antes qualquer pessoa que a copiasse conseguia disparar mensagem
// pela conta do cliente. A Edge agora exige este token e confere se o usuário
// pertence à empresa dona do lead.
async function entregarViaEdge(
  supabase: ReturnType<typeof createClient>,
  action: 'send' | 'send_meta' | 'send_template',
  payload: Record<string, unknown>,
) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Entre novamente para enviar.')

  const res = await fetch(`${FUNCTIONS_URL}?action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok || (data as { error?: string }).error) {
    throw new Error((data as { error?: string }).error ?? 'Falha ao enviar a mensagem')
  }
}

interface ChatMsg {
  from: 'cliente' | 'loja'; text: string; time: string; tipo?: string; midiaUrl?: string | null
  /** Marca de tempo crua — usada para calcular a janela de 24h. */
  iso?: string
  /** Confirmação da Meta (só em mensagem enviada): enviada | entregue | lida | falhou. */
  status?: string | null
  erro?: string | null
  /** id da Meta — é por ele que a confirmação de entrega encontra a bolha. */
  externalId?: string | null
}

const ROTULO_ENTREGA: Record<string, string> = {
  enviada: 'Enviada', entregue: 'Entregue no aparelho', lida: 'Lida pelo cliente', falhou: 'Não enviada',
}

/** Linha de lead_mensagens como ela chega pelo realtime. */
type LinhaMsg = {
  id: number; direcao: string; conteudo: string | null; created_at: string
  lida: boolean | null; tipo: string | null; midia_url: string | null
  status_entrega?: string | null; erro_envio?: string | null; external_id?: string | null
}

// Placeholder textual gravado junto com mídia — não renderiza quando a mídia aparece.
const ehPlaceholderMidia = (t: string) => /^\[(imagem|video|audio|midia)\]$/.test(t)
const TIPO_DB: Record<'image' | 'video' | 'audio', string> = { image: 'imagem', video: 'video', audio: 'audio' }

export function LeadModal({ lead, usuarios, columns, segmento, onClose, onUpdate }: LeadModalProps) {
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  useLockScroll(true)
  useEscape(true, onClose)

  const responsavelInicial = lead.responsavel_id ?? '' // guarda o ID (não o nome)
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

  /**
   * Lead livre abre já com o nome de quem abriu no campo Responsável — mas SÓ
   * na tela. A posse só é gravada quando a pessoa responde (`assumirSeLivre`).
   * Assim quem espiou e fechou no X deixa o lead livre para o próximo, e quem
   * atendeu não precisa lembrar de se atribuir.
   */
  useEffect(() => {
    if (lead.responsavel_id) return
    let cancel = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancel || !data.user) return
      setForm((f) => (f.responsavel ? f : { ...f, responsavel: data.user!.id }))
    })
    return () => { cancel = true }
  }, [lead.responsavel_id, supabase])

  // Valores como estão no banco. Comparar contra eles (e não contra um "sujo"
  // qualquer) é o que faz o botão DESAPARECER quando o funcionário desfaz a
  // edição — apagar o que digitou volta ao estado original e nada fica pendente.
  const original: Record<string, string> = {
    nome: lead.nome ?? '',
    tel: lead.telefone ?? '',
    ig: lead.instagram ?? '',
    produto: lead.produto_interessado ?? '',
    status: lead.kanban_status ?? 'novo',
    responsavel: lead.responsavel_id ?? '',
    obs: lead.observacoes ?? '',
  }
  const mudou = (campo: string) =>
    (form[campo as keyof typeof form] ?? '') !== (original[campo] ?? '')
  const algoMudou = Object.keys(original).some(mudou)

  /**
   * Botão de salvar logo abaixo do campo alterado. Existe para o vendedor não
   * precisar rolar até o fim da coluna — o motivo é operacional: informação
   * digitada e não salva é informação perdida.
   * Salva TODAS as alterações pendentes, não só a do campo (evita salvar metade).
   */
  const salvarAqui = (campo: string) =>
    mudou(campo) ? (
      <div className="-mt-1 flex items-center gap-2">
        <Button size="sm" onClick={handleSave} loading={saving}>Salvar</Button>
        <span className="text-[11px] text-warn">alteração não salva</span>
      </div>
    ) : null
  const [abaMobile, setAbaMobile] = useState<'dados' | 'conversa'>('conversa') // mobile: mostra uma coluna por vez

  const [chat, setChat] = useState<ChatMsg[]>([])
  const [loadingChat, setLoadingChat] = useState(true)
  const [fotoQuebrada, setFotoQuebrada] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // A janela de 24h vale só para o WhatsApp: Instagram e Messenger não têm essa
  // restrição, e avisar onde não se aplica seria ruído.
  const ultimaDoCliente = [...chat].reverse().find((m) => m.from === 'cliente' && m.iso)?.iso
  const janelaFechada =
    lead.origem === 'whatsapp' &&
    chat.length > 0 &&
    (!ultimaDoCliente || Date.now() - new Date(ultimaDoCliente).getTime() > 24 * 60 * 60 * 1000)

  // Retomada por modelo aprovado — só carrega a lista quando o vendedor pede.
  type ModeloAprovado = { id: number; nome: string; idioma: string; corpo: string }
  const [modelosAbertos, setModelosAbertos] = useState(false)
  const [carregandoModelos, setCarregandoModelos] = useState(false)
  const [modelosAprovados, setModelosAprovados] = useState<ModeloAprovado[]>([])
  const [modeloEscolhido, setModeloEscolhido] = useState<ModeloAprovado | null>(null)
  const [paramsModelo, setParamsModelo] = useState<string[]>([])
  const [enviandoModelo, setEnviandoModelo] = useState(false)

  // Prévia com as variáveis já trocadas — é este texto que fica no histórico.
  const previaModelo = modeloEscolhido
    ? modeloEscolhido.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => paramsModelo[Number(n) - 1] || `{{${n}}}`)
    : ''

  async function abrirModelos() {
    setModelosAbertos(true)
    setModeloEscolhido(null)
    setCarregandoModelos(true)
    try {
      const r = await fetch('/api/modelos')
      const j = await r.json()
      setModelosAprovados(
        ((j.modelos ?? []) as (ModeloAprovado & { status: string })[]).filter((m) => m.status === 'aprovado'),
      )
    } catch {
      notify.bad('Não foi possível carregar os modelos.')
    } finally {
      setCarregandoModelos(false)
    }
  }

  async function enviarModelo() {
    if (!modeloEscolhido) return
    const faltam = (modeloEscolhido.corpo.match(/\{\{\d+\}\}/g) ?? []).length
    if (paramsModelo.filter((p) => p?.trim()).length < faltam) {
      return notify.warn('Preencha todas as variáveis do modelo.')
    }
    setEnviandoModelo(true)
    try {
      await entregarViaEdge(supabase, 'send_template', {
        leadId: lead.id, number: lead.telefone, modelo: modeloEscolhido.nome,
        idioma: modeloEscolhido.idioma, parametros: paramsModelo, previa: previaModelo,
      })
      setChat((p) => [...p, { from: 'loja', text: previaModelo, time: 'agora', status: 'enviada' }])
      setModelosAbertos(false)
      notify.ok('Modelo enviado. A conversa reabre quando o cliente responder.')
    } catch (e) {
      notify.bad((e as Error).message)
    } finally {
      setEnviandoModelo(false)
    }
  }

  useEffect(() => {
    let cancel = false
    async function load() {
      setLoadingChat(true)
      const { data } = await supabase
        .from('lead_mensagens')
        .select('direcao, conteudo, created_at, tipo, midia_url, status_entrega, erro_envio, external_id')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })
      if (cancel) return
      type MsgRow = {
        direcao: string | null; conteudo: string | null; created_at: string
        tipo: string | null; midia_url: string | null
        status_entrega: string | null; erro_envio: string | null; external_id: string | null
      }
      const msgs: ChatMsg[] = ((data ?? []) as MsgRow[]).map((m) => ({
        from: m.direcao === 'enviada' ? 'loja' : 'cliente',
        text: m.conteudo ?? '',
        time: new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        tipo: m.tipo ?? 'texto',
        midiaUrl: m.midia_url,
        status: m.status_entrega,
        erro: m.erro_envio,
        externalId: m.external_id,
        iso: m.created_at,
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
        (payload: RealtimePostgresChangesPayload<LinhaMsg>) => {
          const m = payload.new as LinhaMsg
          setChat((prev) => {
            const novaMsg: ChatMsg = {
              from: m.direcao === 'enviada' ? 'loja' : 'cliente',
              text: m.conteudo ?? '',
              time: new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              tipo: m.tipo ?? 'texto',
              midiaUrl: m.midia_url,
              status: m.status_entrega ?? null,
              erro: m.erro_envio ?? null,
              externalId: m.external_id ?? null,
              iso: m.created_at,
            }
            if (novaMsg.from === 'loja') {
              // Substitui a bolha otimista ("agora"): mídia casa pela URL, texto pelo conteúdo.
              const idx = prev.findIndex((x) => x.from === 'loja' && x.time === 'agora' && (x.midiaUrl ? x.midiaUrl === novaMsg.midiaUrl : x.text === novaMsg.text))
              if (idx >= 0) { const copy = [...prev]; copy[idx] = novaMsg; return copy }
            }
            return [...prev, novaMsg]
          })
          if (m.direcao === 'recebida' && !m.lida) {
            supabase.from('lead_mensagens').update({ lida: true }).eq('id', m.id)
          }
        })
      // A confirmação de entrega chega DEPOIS, como alteração da linha. Sem
      // escutar UPDATE, o tique nunca mudaria sem recarregar a conversa.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lead_mensagens', filter: `lead_id=eq.${lead.id}` },
        (payload: RealtimePostgresChangesPayload<LinhaMsg>) => {
          const m = payload.new as LinhaMsg
          if (!m.external_id && !m.status_entrega) return
          setChat((prev) => prev.map((x) =>
            x.externalId && x.externalId === m.external_id
              ? { ...x, status: m.status_entrega ?? x.status, erro: m.erro_envio ?? x.erro, text: m.conteudo ?? x.text, midiaUrl: m.midia_url ?? x.midiaUrl, tipo: m.tipo ?? x.tipo }
              : x,
          ))
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
        await entregarViaEdge(supabase, 'send_meta', { leadId: lead.id, texto: t, canal })
      } else if (canal === 'whatsapp') {
        if (!lead.telefone) throw new Error('Lead sem telefone para envio no WhatsApp')
        await entregarViaEdge(supabase, 'send', { number: lead.telefone, text: t, leadId: lead.id })
      } else {
        if (!empresa?.id) throw new Error('Empresa não encontrada')
        const { error } = await supabase.from('lead_mensagens').insert({
          empresa_id: empresa.id, lead_id: lead.id, direcao: 'enviada',
          conteudo: t, origem: canal, lida: true,
        })
        if (error) throw new Error(error.message)
      }
      await supabase.from('leads').update({ ultima_mensagem_at: new Date().toISOString() }).eq('id', lead.id)
      await assumirSeLivre()
    } catch (e) {
      rollback()
      notify.bad('Erro ao enviar', e instanceof Error ? e.message : 'Tente novamente.')
    }
  }

  /**
   * Assume o lead ao RESPONDER, não ao abrir.
   *
   * Abrir a conversa só preenche o campo na tela (ver `form.responsavel`): quem
   * espiou e fechou no X não pode levar o lead embora da esteira. Só quando o
   * cliente é respondido a posse é gravada.
   *
   * O `.is('responsavel_id', null)` resolve dois vendedores abrindo o mesmo lead
   * livre: quem responder primeiro fica com ele, e o segundo é avisado em vez de
   * roubar a conversa sem ninguém perceber.
   */
  async function assumirSeLivre() {
    if (lead.responsavel_id) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('leads')
      .update({ responsavel_id: user.id, responsavel_desde: new Date().toISOString() })
      .eq('id', lead.id).is('responsavel_id', null)
      .select('id')
    if (data?.length) {
      setForm((f) => ({ ...f, responsavel: user.id }))
      onUpdate({ ...lead, responsavel_id: user.id })
      notify.ok('Lead é seu', 'Você assumiu o atendimento ao responder.')
      return
    }
    // Perdeu a corrida: alguém respondeu primeiro.
    const { data: atual } = await supabase.from('leads')
      .select('responsavel_id').eq('id', lead.id).maybeSingle()
    const dono = usuarios.find((u) => u.id === atual?.responsavel_id)?.nome
    if (atual?.responsavel_id) {
      notify.warn('Este lead já tem dono', dono ? `${dono} assumiu o atendimento primeiro.` : 'Outro vendedor assumiu primeiro.')
      onUpdate({ ...lead, responsavel_id: atual.responsavel_id as string })
    }
  }

  // ── Mídia (imagem/vídeo/áudio) ────────────────────────────────────────────
  // Fluxo: upload p/ /api/chat/upload (bucket chat-midia) → Edge envia ao canal
  // com a URL pública → o insert da Edge chega via realtime e substitui a bolha
  // otimista. Canal "manual" grava direto no banco.
  const [enviandoMidia, setEnviandoMidia] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function sendMedia(file: File) {
    const canal = lead.origem ?? 'manual'
    setEnviandoMidia(true)
    let bolhaUrl: string | null = null
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/chat/upload', { method: 'POST', body: fd })
      const up = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) throw new Error((up as { error?: string }).error ?? 'Falha ao subir o arquivo')
      const { url, tipoMidia } = up as { url: string; tipoMidia: 'image' | 'video' | 'audio' }
      const tipoDb = TIPO_DB[tipoMidia]
      bolhaUrl = url
      setChat((prev) => [...prev, { from: 'loja', text: `[${tipoDb}]`, time: 'agora', tipo: tipoDb, midiaUrl: url }])

      if (canal === 'instagram' || canal === 'messenger') {
        await entregarViaEdge(supabase, 'send_meta', { leadId: lead.id, canal, midiaUrl: url, tipoMidia })
      } else if (canal === 'whatsapp') {
        if (!lead.telefone) throw new Error('Lead sem telefone para envio no WhatsApp')
        await entregarViaEdge(supabase, 'send', { number: lead.telefone, leadId: lead.id, midiaUrl: url, tipoMidia })
      } else {
        if (!empresa?.id) throw new Error('Empresa não encontrada')
        const { error } = await supabase.from('lead_mensagens').insert({
          empresa_id: empresa.id, lead_id: lead.id, direcao: 'enviada',
          conteudo: `[${tipoDb}]`, origem: canal, lida: true, tipo: tipoDb, midia_url: url,
        })
        if (error) throw new Error(error.message)
      }
      await supabase.from('leads').update({ ultima_mensagem_at: new Date().toISOString() }).eq('id', lead.id)
    } catch (e) {
      if (bolhaUrl) setChat((prev) => {
        const idx = prev.findIndex((x) => x.from === 'loja' && x.time === 'agora' && x.midiaUrl === bolhaUrl)
        if (idx < 0) return prev
        const copy = [...prev]; copy.splice(idx, 1); return copy
      })
      notify.bad('Erro ao enviar mídia', e instanceof Error ? e.message : 'Tente novamente.')
    } finally {
      setEnviandoMidia(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Gravação de áudio (MediaRecorder). Prefere audio/mp4 (aceito por WhatsApp
  // e Instagram); webm/opus é o fallback de navegadores antigos.
  const [gravando, setGravando] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelGravacaoRef = useRef(false)

  useEffect(() => () => {
    cancelGravacaoRef.current = true
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }, [])

  async function toggleGravacao() {
    if (gravando) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      cancelGravacaoRef.current = false
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setGravando(false)
        if (cancelGravacaoRef.current) return
        const tipoBase = mime.split(';')[0]
        const blob = new Blob(chunksRef.current, { type: tipoBase })
        if (blob.size > 0) sendMedia(new File([blob], `audio.${tipoBase === 'audio/mp4' ? 'm4a' : 'webm'}`, { type: tipoBase }))
      }
      recRef.current = rec
      rec.start()
      setGravando(true)
    } catch {
      notify.bad('Microfone indisponível', 'Permita o acesso ao microfone para gravar áudio.')
    }
  }

  /**
   * Orçamento salvo dentro da conversa → o lead anda para a etapa de orçamento
   * sozinho, sem fechar o chat.
   *
   * Procura a etapa pelo slug 'orcamento'; se o funil da empresa não tiver uma,
   * cai na etapa de NEGOCIAÇÃO, que é o que um orçamento enviado significa. Sem
   * nenhuma das duas, não inventa movimento — só não move.
   */
  async function moverParaOrcamento() {
    const alvo = columns.find((c) => c.id === 'orcamento') ?? columns.find((c) => c.tipo === 'negociacao')
    if (!alvo || (lead.kanban_status ?? 'novo') === alvo.id) return

    // Mesma trava de qualificação do quadro: mover automático não pode furar
    // uma regra que o arrastar respeita.
    const faltando = (alvo.camposObrigatorios ?? []).filter((campo) => {
      const v = (lead as unknown as Record<string, unknown>)[campo]
      return v == null || v === '' || (campo === 'valor_estimado' && !Number(v))
    })
    if (faltando.length > 0) {
      const nomes = faltando.map((c) => CAMPOS_QUALIFICACAO.find((x) => x.key === c)?.label ?? c)
      notify.warn(`Orçamento salvo, mas o lead não foi para "${alvo.label}"`, `Preencha: ${nomes.join(', ')}.`)
      return
    }

    const r = await fetch('/api/leads/mover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, kanban_status: alvo.id }),
    })
    if (!r.ok) { notify.warn('Orçamento salvo, mas não consegui mover a etapa'); return }
    setForm((f) => ({ ...f, status: alvo.id }))
    onUpdate({ ...lead, kanban_status: alvo.id })
    notify.ok(`Lead movido para ${alvo.label}`)
  }

  async function handleSave() {
    const statusKey = form.status || lead.kanban_status || 'novo'
    const respId = form.responsavel || null // Select agora guarda o ID; '' = sem responsável
    const mudouEtapa = statusKey !== (lead.kanban_status ?? 'novo')
    const alvo = columns.find((c) => c.id === statusKey)

    // Marcar como "Perdido" exige motivo → só pelo quadro (kanban), não pelo modal.
    if (mudouEtapa && alvo?.tipo === 'perdido') {
      notify.warn('Para marcar como Perdido, arraste o lead no quadro (é preciso informar o motivo da perda).')
      return
    }

    setSaving(true)
    // Campos editáveis (sem a etapa — a etapa vai pelo endpoint que dispara as automações).
    const { error } = await supabase.from('leads').update({
      nome: form.nome.trim() || null,
      telefone: form.tel.trim() || null,
      instagram: form.ig.trim() || null,
      produto_interessado: form.produto.trim() || null,
      responsavel_id: respId,
      // Só remarca o início da responsabilidade quando o dono MUDA — salvar
      // outro campo não pode zerar o relógio do prazo de resposta.
      ...(respId !== (lead.responsavel_id ?? null)
        ? { responsavel_desde: respId ? new Date().toISOString() : null }
        : {}),
      observacoes: form.obs.trim() || null,
    }).eq('id', lead.id)
    if (error) { setSaving(false); notify.bad('Erro ao salvar'); return }

    // Mudança de etapa → /api/leads/mover (motivo de perda já barrado acima;
    // aqui dispara automações, cadência por etapa e orçamento de negociação).
    if (mudouEtapa) {
      const r = await fetch('/api/leads/mover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, kanban_status: statusKey }),
      })
      if (!r.ok) { setSaving(false); notify.bad('Erro ao mover de etapa'); return }
    }

    setSaving(false)
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

    const empresaId = await empresaAtualId(supabase)
    if (!empresaId) { notify.bad('Empresa não encontrada'); setSaving(false); return }

    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert({
        empresa_id: empresaId,
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 p-0 sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden border border-line bg-card shadow-[0_30px_70px_-20px_rgba(21,24,28,0.4)] sm:h-[620px] sm:max-h-[92vh] sm:w-[1000px] sm:max-w-[96vw] sm:rounded-modal">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-3.5">
          {/* Foto do contato quando existe. Instagram e Messenger fornecem;
              WhatsApp não expõe foto por privacidade, então ali cai no ícone.
              onError volta para o ícone se a imagem falhar. */}
          {lead.foto_url && !fotoQuebrada ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={lead.foto_url}
              alt={form.nome || 'Contato'}
              className="h-9 w-9 flex-none rounded-full object-cover"
              onError={() => setFotoQuebrada(true)}
            />
          ) : (
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-white">
              <UserRound size={19} strokeWidth={1.7} />
            </span>
          )}
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

        {/* Abas — só no mobile (no desktop as 2 colunas aparecem juntas) */}
        <div className="flex border-b border-line-soft lg:hidden">
          {(['dados', 'conversa'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAbaMobile(t)}
              className={'flex-1 py-2.5 text-[13px] font-semibold transition-colors ' + (abaMobile === t ? 'border-b-2 border-accent text-accent' : 'text-ink-3')}
            >
              {t === 'dados' ? 'Dados' : 'Conversa'}
            </button>
          ))}
        </div>

        {/* Body: 2 colunas no desktop; 1 aba por vez no mobile */}
        <div className="grid flex-1 overflow-hidden lg:[grid-template-columns:340px_1fr]">

          {/* Esquerda: formulário */}
          <div className={'flex-col gap-3 overflow-y-auto border-r border-line-soft p-5 scrollbar-thin lg:flex ' + (abaMobile === 'dados' ? 'flex' : 'hidden')}>
            <Input label="Nome" value={form.nome} onChange={(e) => set('nome', e.target.value)} />
            {salvarAqui('nome')}
            <Input label="Telefone / WhatsApp" value={form.tel} onChange={(e) => set('tel', e.target.value)} className="num" />
            {salvarAqui('tel')}
            <Input label="Instagram" value={form.ig} onChange={(e) => set('ig', e.target.value)} placeholder="@usuario" />
            {salvarAqui('ig')}
            {segmento === 'concessionaria' || segmento === 'imobiliaria' ? (
              <Input label={segmento === 'concessionaria' ? 'Veículo interessado' : 'Imóvel interessado'} value={form.produto} onChange={(e) => set('produto', e.target.value)} />
            ) : (
              <ProdutoAutocomplete label="Produto interessado" value={form.produto} onChange={(v) => set('produto', v)} onSelect={(p) => set('produto', p.nome)} />
            )}
            {salvarAqui('produto')}
            <Select label="Status no funil" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            {salvarAqui('status')}
            <Select label="Responsável" value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)}>
              <option value="">Sem responsável</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
            {salvarAqui('responsavel')}
            <Textarea label="Observações" rows={3} value={form.obs} onChange={(e) => set('obs', e.target.value)} placeholder="Contexto, anotações…" />
            {salvarAqui('obs')}

            {empresa?.id && <LeadAcoesPanel leadId={lead.id} empresaId={empresa.id} segmento={segmento} />}
            <ResponsavelPanel
              leadId={lead.id}
              usuarios={usuarios}
              responsavelInicial={lead.responsavel_id}
              onChange={(id) => { setForm((f) => ({ ...f, responsavel: id ?? '' })); onUpdate({ ...lead, responsavel_id: id }) }}
            />
            {segmento === 'imobiliaria' && <LeadMatchPanel leadId={lead.id} />}
            {segmento === 'concessionaria' && <LeadInteressePanel leadId={lead.id} />}
            {segmento === 'concessionaria' && <LeadFinanciamentoPanel leadId={lead.id} />}
            <LeadReservaPanel leadId={lead.id} onReservado={(descricao) => set('produto', descricao)} />
            <LeadChamadasPanel leadId={lead.id} />
            <LeadOrcamentoPanel leadId={lead.id} leadNome={lead.nome} leadTelefone={lead.telefone} onSalvo={moverParaOrcamento} />
            <LeadCadenciaPanel leadId={lead.id} />
            {/* Continua existindo para quem já rolou até aqui, mas agora reflete o
                estado: sem alteração pendente não há o que salvar. */}
            <Button
              className="mt-1 w-full"
              onClick={handleSave}
              loading={saving}
              disabled={!algoMudou}
            >
              {algoMudou ? 'Salvar alterações' : 'Nada a salvar'}
            </Button>
          </div>

          {/* Direita: chat */}
          <div className={'flex-col overflow-hidden bg-bg lg:flex ' + (abaMobile === 'conversa' ? 'flex' : 'hidden')}>
            <div className="border-b border-line-soft px-5 py-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Histórico de mensagens
            </div>
            {/* Fundo do chat: padrão repetido sobre a cor de base, como o
                WhatsApp faz. O desenho vai no ::before com opacidade própria
                para o texto das bolhas não brigar com ele — e para o tema
                escuro poder baixar a opacidade sem trocar de imagem. */}
            <div className="chat-fundo flex flex-1 flex-col gap-2.5 overflow-y-auto p-5 scrollbar-thin">
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
                  <div key={i} className={`relative flex ${isLoja ? 'justify-end' : 'justify-start'}`}>
                    {/* Cores do WhatsApp: verde para o que a loja manda, branco
                        para o que o cliente manda. A sombra leve é o que separa
                        a bolha do padrão do fundo. */}
                    <div className={`max-w-[72%] rounded-[12px] px-3.5 py-2.5 text-[13px] shadow-[0_1px_1px_rgba(11,20,26,0.13)] ${isLoja ? 'rounded-br-[3px] bg-[#d9fdd3] text-[#111b21]' : 'rounded-bl-[3px] bg-white text-[#111b21]'}`}>
                      {m.midiaUrl && m.tipo === 'imagem' && (
                        <a href={m.midiaUrl} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.midiaUrl} alt="Imagem da conversa" className="mb-1 max-h-[240px] w-auto max-w-full rounded-[8px]" />
                        </a>
                      )}
                      {m.midiaUrl && m.tipo === 'video' && (
                        <video src={m.midiaUrl} controls preload="metadata" className="mb-1 max-h-[240px] w-auto max-w-full rounded-[8px]" />
                      )}
                      {m.midiaUrl && m.tipo === 'audio' && (
                        <audio src={m.midiaUrl} controls preload="metadata" className="audio-chat -mx-1 mb-0.5 w-[230px]" />
                      )}
                      {!(m.midiaUrl && ehPlaceholderMidia(m.text)) && formatarTextoChat(m.text)}
                      {/* Hora à DIREITA, como no WhatsApp — estava à esquerda. */}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-[#667781]">
                        <span>{m.time}</span>
                        {/* Confirmação da Meta: um tique saiu, dois chegou, dois
                            claros foi lido. Falha aparece com o motivo no title. */}
                        {isLoja && m.status && (
                          m.status === 'falhou'
                            ? <span className="text-[10px] text-bad" title={m.erro ?? 'Falha no envio'}>não enviada</span>
                            : <span
                                // Lida ganha o azul do WhatsApp, que todo mundo já
                                // entende sem legenda.
                                className={m.status === 'lida' ? 'font-semibold text-[#53BDEB]' : ''}
                                title={ROTULO_ENTREGA[m.status]}
                              >
                                {m.status === 'enviada' ? '✓' : '✓✓'}
                              </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Janela de atendimento do WhatsApp: passadas 24h da última mensagem
                do cliente, a Meta só aceita modelo aprovado. Avisar ANTES é o que
                evita o vendedor escrever, tomar erro e não entender o motivo. */}
            {janelaFechada && (
              <div className="flex items-start gap-2 border-t border-warn/25 bg-warn-soft px-3 py-2.5 sm:px-5">
                <Clock size={14} strokeWidth={1.8} className="mt-0.5 flex-none text-warn" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-relaxed text-ink-2">
                    <strong className="text-ink">Faz mais de 24h que o cliente não escreve.</strong>{' '}
                    O WhatsApp só permite retomar por <strong className="text-ink">modelo aprovado</strong> pela Meta —
                    mensagem livre vai ser recusada.
                  </p>
                  <button
                    type="button"
                    onClick={abrirModelos}
                    className="mt-1.5 text-[11.5px] font-semibold text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                  >
                    Retomar com um modelo aprovado
                  </button>
                </div>
              </div>
            )}

            {/* Escolha do modelo + preenchimento das variáveis, sem sair da conversa. */}
            <Modal open={modelosAbertos} onClose={() => setModelosAbertos(false)} title="Retomar a conversa" size="sm">
              {carregandoModelos ? (
                <div className="flex items-center gap-2 py-6 text-[13px] text-ink-3">
                  <Loader2 size={15} className="animate-spin" /> Buscando modelos aprovados…
                </div>
              ) : modelosAprovados.length === 0 ? (
                <div className="py-2 text-[13px] text-ink-2">
                  <p className="font-semibold text-ink">Nenhum modelo aprovado ainda.</p>
                  <p className="mt-1">
                    Modelos são criados em <strong>Sistema → Modelos</strong> e passam por análise da Meta.
                    Enquanto não houver um aprovado, a única forma de reabrir a conversa é o cliente escrever
                    — ou você ligar para ele.
                  </p>
                </div>
              ) : modeloEscolhido ? (
                <div className="flex flex-col gap-3">
                  <p className="rounded-control bg-raised p-3 text-[12.5px] text-ink-2">{previaModelo}</p>
                  {(modeloEscolhido.corpo.match(/\{\{\d+\}\}/g) ?? []).map((_, idx) => (
                    <Input
                      key={idx}
                      label={`Variável ${idx + 1}`}
                      value={paramsModelo[idx] ?? ''}
                      onChange={(e) => {
                        const novo = [...paramsModelo]; novo[idx] = e.target.value; setParamsModelo(novo)
                      }}
                    />
                  ))}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setModeloEscolhido(null)} disabled={enviandoModelo}>Voltar</Button>
                    <Button onClick={enviarModelo} loading={enviandoModelo}>Enviar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {modelosAprovados.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setModeloEscolhido(m); setParamsModelo([]) }}
                      className="rounded-control border border-line bg-raised px-3 py-2.5 text-left hover:border-accent"
                    >
                      <span className="block font-mono text-[12px] font-semibold text-ink">{m.nome}</span>
                      <span className="mt-0.5 block whitespace-pre-wrap text-[12px] text-ink-2">{m.corpo}</span>
                    </button>
                  ))}
                </div>
              )}
            </Modal>

            <div className="flex items-center gap-1.5 border-t border-line-soft px-3 py-3.5 sm:gap-2 sm:px-5">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMedia(f) }}
              />
              <IconButton aria-label="Anexar imagem ou vídeo" onClick={() => fileRef.current?.click()} disabled={enviandoMidia || gravando}>
                {enviandoMidia ? <Loader2 size={16} strokeWidth={1.7} className="animate-spin" /> : <Paperclip size={16} strokeWidth={1.7} />}
              </IconButton>
              <IconButton
                aria-label={gravando ? 'Parar e enviar áudio' : 'Gravar áudio'}
                variant={gravando ? 'danger' : undefined}
                onClick={toggleGravacao}
                disabled={enviandoMidia}
              >
                {gravando ? <Square size={15} strokeWidth={1.7} className="animate-pulse" /> : <Mic size={16} strokeWidth={1.7} />}
              </IconButton>
              <EmojiPicker disabled={gravando} onEscolher={(e) => setDraft((d) => d + e)} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
                placeholder={gravando ? 'Gravando áudio…' : 'Digite uma mensagem…'}
                disabled={gravando}
                className="h-10 min-w-0 flex-1 rounded-control border border-line bg-card px-3 text-base text-ink placeholder:text-ink-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 disabled:opacity-60 sm:h-9 sm:text-[13px]"
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
