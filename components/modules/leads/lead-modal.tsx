'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Send, UserCheck, Trash2, UserRound, X, Paperclip, Mic, Square, Loader2, Clock, FileText, Megaphone, Instagram, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { camposFaltantesContrato } from '@/lib/cliente-contrato'
import { useEmpresa } from '@/lib/empresa-context'
import { lerReelCard, urlEmbed } from '@/lib/reel-instagram'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Lead, Usuario, type KanbanColumn, type Motivo, ganhoColId, CAMPOS_QUALIFICACAO } from './types'
import { MotivoPerdaModal } from './motivo-perda-modal'
import { PaineisDaVertical } from './paineis-vertical'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
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
  /**
   * Motivos de perda. Necessários AQUI porque agora dá para marcar Perdido pelo
   * próprio modal — antes ele recusava e mandava arrastar o card no quadro.
   */
  motivos?: Motivo[]
  onClose: () => void
  onUpdate: (lead: Lead) => void
}

/**
 * Reproduz a assinatura que sai nas mensagens — "Thomas - JM STORE:".
 *
 * Tem de seguir a MESMA regra da Edge Function (`assinaturaDe`, em
 * supabase/functions/webhook-leads): primeiro nome, loja em maiúsculas, dois
 * pontos no fim. As duas mudam juntas; se divergirem, o atendente lê uma coisa
 * na tela e o cliente recebe outra — que é o problema que isto veio resolver.
 */
function assinaturaDoChat(autor: string, empresaNome?: string | null): string {
  const primeiro = autor.trim().split(/\s+/)[0] || autor
  return empresaNome ? `${primeiro} - ${empresaNome.toUpperCase()}:` : `${primeiro}:`
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
  /**
   * Quem atendeu, nas mensagens que saíram do CRM. Null = enviada pelo celular,
   * fora do CRM. Existe porque a assinatura vai só no texto que o CLIENTE
   * recebe: sem isto, um lead que volta ao funil semanas depois não diz ao
   * próximo atendente com quem o cliente já falou.
   */
  autor?: string | null
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
const ehPlaceholderMidia = (t: string) => /^\[(imagem|video|audio|midia|documento)\]$/.test(t)
const TIPO_DB: Record<'image' | 'video' | 'audio', string> = { image: 'imagem', video: 'video', audio: 'audio' }

/**
 * Áudio da conversa.
 *
 * O WhatsApp entrega OGG/Opus, e o player nativo FALHA CALADO quando o navegador
 * não dá conta do formato: a bolha aparece, o play não faz nada, e o vendedor só
 * sabe dizer "não consigo ouvir". Aqui a falha vira texto — com o motivo — e um
 * link para abrir o arquivo fora do CRM, que é a saída que sempre funciona.
 */
const MOTIVO_MEDIA: Record<number, string> = {
  1: 'a reprodução foi interrompida',
  2: 'a rede falhou no meio do download',
  3: 'este navegador não conseguiu decodificar o áudio',
  4: 'este navegador não suporta o formato do áudio (OGG/Opus)',
}

/**
 * Card do anúncio que trouxe o cliente.
 *
 * É o mesmo bloco que ele vê no aparelho antes de escrever — e sem ele o
 * vendedor lê "Quero saber quais iPhones novos lacrados tem disponível" sem
 * saber de qual campanha veio nem o que a pessoa acabou de ler.
 */
function AnuncioChat({ conteudo, midiaUrl }: { conteudo: string; midiaUrl?: string | null }) {
  let a: { titulo?: string | null; corpo?: string | null; url?: string | null; plataforma?: string | null; anuncio_id?: string | null }
  try { a = JSON.parse(conteudo) } catch { return <span className="text-[13px] italic text-[#667781]">Veio de um anúncio</span> }

  return (
    <div className="mb-1 overflow-hidden rounded-[8px] border border-[#25d366]/30 bg-[#f7fdf9]">
      {midiaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={midiaUrl} alt="Imagem do anúncio" className="max-h-[150px] w-full object-cover" />
      )}
      <div className="px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#128c7e]">
          <Megaphone size={11} strokeWidth={2} />
          Veio de anúncio{a.plataforma ? ` · ${a.plataforma}` : ''}
        </div>
        {a.titulo && <div className="text-[12.5px] font-semibold leading-tight text-[#111b21]">{a.titulo}</div>}
        {a.corpo && <div className="mt-0.5 line-clamp-3 text-[11.5px] leading-snug text-[#667781]">{a.corpo}</div>}
        {a.url && (
          <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] font-medium text-[#128c7e] underline">
            {a.url}
          </a>
        )}
        {a.anuncio_id && <div className="mt-1 text-[10px] text-ink-3">ID da campanha: {a.anuncio_id}</div>}
      </div>
    </div>
  )
}

/**
 * REEL COMPARTILHADO NA CONVERSA.
 *
 * A Meta não entrega o arquivo do reel — entrega a página dele. Antes o CRM
 * guardava esse HTML e o vendedor via um "documento" que não abre; 31 dessas
 * eram cliente mandando algo que ninguém conseguiu ver.
 *
 * Agora guardamos só o código do post e mostramos o embed OFICIAL, que é
 * público e busca capa e vídeo na hora — por isso não guardamos imagem nenhuma
 * (a capa da Meta é URL de CDN e expira em dias).
 *
 * O iframe só carrega quando o vendedor pede. São scripts do Instagram na
 * máquina dele: abrir 20 conversas não deve disparar 20 embeds de terceiro, e
 * quem só está lendo o histórico não precisa assistir nada.
 */
function ReelChat({ conteudo }: { conteudo: string }) {
  const [tocando, setTocando] = useState(false)
  const reel = lerReelCard(conteudo)
  if (!reel) return <span className="text-[13px] italic text-[#667781]">Reel compartilhado</span>

  return (
    <div className="mb-1 overflow-hidden rounded-[8px] border border-[#c13584]/25 bg-[#fdf7fb]">
      {tocando ? (
        <>
          <iframe
            src={urlEmbed(reel.shortcode)}
            title={`Reel de ${reel.autor ?? 'Instagram'}`}
            className="h-[420px] w-full border-0"
            loading="lazy"
            allow="encrypted-media"
          />
          {/* Aberto, o embed come 420px da conversa. Sem isto só fechando o
              modal do lead — e quem rola o histórico passa por todos eles. */}
          <button
            type="button"
            onClick={() => setTocando(false)}
            className="flex w-full items-center justify-center gap-1 bg-[#c13584]/[0.07] py-1.5 text-[11px] font-semibold text-[#c13584] transition-colors hover:bg-[#c13584]/[0.12]"
          >
            <X size={12} strokeWidth={2.2} />
            Fechar o reel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setTocando(true)}
          className="flex w-full items-center gap-2 bg-[#c13584]/[0.07] px-2.5 py-2 text-left transition-colors hover:bg-[#c13584]/[0.12]"
        >
          <Play size={14} strokeWidth={2} className="shrink-0 text-[#c13584]" />
          <span className="text-[11.5px] font-semibold text-[#c13584]">Ver o reel aqui</span>
        </button>
      )}
      <div className="px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#c13584]">
          <Instagram size={11} strokeWidth={2} />
          Reel{reel.autor ? ` · ${reel.autor}` : ''}
        </div>
        {reel.legenda && (
          <div className="line-clamp-3 text-[11.5px] leading-snug text-[#667781]">{reel.legenda}</div>
        )}
        <a
          href={reel.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-[11px] font-medium text-[#c13584] underline"
        >
          Abrir no Instagram
        </a>
      </div>
    </div>
  )
}

/** Mídia que existiu na conversa mas cujo arquivo não temos. */
const NOME_MIDIA: Record<string, string> = {
  '[audio]': 'Áudio', '[imagem]': 'Imagem', '[video]': 'Vídeo',
  '[documento]': 'Documento', '[midia]': 'Anexo',
}

function MidiaAusente({ placeholder }: { placeholder: string }) {
  return (
    <span className="text-[13px] italic text-[#667781]">
      {NOME_MIDIA[placeholder] ?? 'Anexo'} — arquivo não disponível no CRM
    </span>
  )
}

function AudioChat({ url }: { url: string }) {
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div className="mb-0.5">
      <audio
        src={url}
        controls
        preload="metadata"
        className="audio-chat -mx-1 w-[230px]"
        onPlay={() => setErro(null)}
        onError={(e) => setErro(MOTIVO_MEDIA[e.currentTarget.error?.code ?? 0] ?? 'não foi possível tocar o áudio')}
      />
      {erro && (
        <p className="mt-0.5 text-[10.5px] leading-snug text-[#8a6d00]">
          {erro}.{' '}
          <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">
            abrir o áudio
          </a>
        </p>
      )}
    </div>
  )
}

export function LeadModal({ lead, usuarios, columns, segmento, motivos = [], onClose, onUpdate }: LeadModalProps) {
  /**
   * O que ESTE segmento pede — em vez de o modal testar quem ele é.
   *
   * Antes havia cinco comparações aqui (rótulo do campo de interesse e três
   * painéis de vertical). Acrescentar uma vertical exigia editar este arquivo, que
   * é o mais disputado do projeto: em 13/08 duas frentes colidiram nele.
   */
  const cfgSegmento = SEGMENTOS[normalizarSegmento(segmento)]
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  // Relógio congelado no mount: a janela de 24h do WhatsApp era calculada com
  // `Date.now()` a cada render, o que deixa o componente impuro.
  const [agora] = useState(() => Date.now())
  const [draft, setDraft] = useState('')
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const [meuId, setMeuId] = useState<string | null>(null)
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * RASCUNHO POR CONVERSA — como no celular.
   *
   * O vendedor escreve meia mensagem, o cliente do balcão chama, ele fecha o
   * chat e perde tudo. Agora o texto fica guardado e volta quando ele reabre a
   * conversa.
   *
   * FICA NO NAVEGADOR, não no banco: rascunho é intenção, não mensagem. Guardar
   * no servidor faria texto não enviado sobre um cliente virar registro
   * permanente da empresa, visível em backup e auditoria — e ninguém escreve
   * rascunho contando com isso.
   *
   * A CHAVE INCLUI O USUÁRIO porque na loja dois vendedores usam o mesmo
   * computador. Sem isso, um leria o texto que o outro deixou pela metade.
   */
  const chaveRascunho = meuId ? `crm_rascunho_${meuId}_lead_${lead.id}` : null

  useEffect(() => {
    if (!chaveRascunho) return
    try {
      const cru = window.localStorage.getItem(chaveRascunho)
      if (!cru) return
      const r = JSON.parse(cru) as { texto?: string; em?: number; dono?: string | null }

      /**
       * O LEAD MUDOU DE MÃO → o rascunho morre.
       *
       * Guardo quem era o responsável quando o texto foi escrito. Se o lead voltou
       * para a esteira (devolução por falta de resposta) ou outro vendedor assumiu,
       * o rascunho é apagado — foi o combinado: quem perde o lead não deixa
       * mensagem pendurada nele. Lead que estava livre e continua livre mantém o
       * texto, senão quem atende antes de assumir perderia o que digitou.
       */
      if ((r.dono ?? null) !== (lead.responsavel_id ?? null)) {
        window.localStorage.removeItem(chaveRascunho)
        return
      }
      // Higiene: rascunho de uma semana atrás não é mais intenção, é lixo.
      if (r.em && Date.now() - r.em > 7 * 24 * 60 * 60 * 1000) {
        window.localStorage.removeItem(chaveRascunho)
        return
      }
      if (r.texto?.trim()) { setDraft(r.texto); setRascunhoRestaurado(true) }
    } catch { /* localStorage cheio ou bloqueado: rascunho é conforto, não pode quebrar o chat */ }
  }, [chaveRascunho, lead.responsavel_id])

  // Grava com folga entre teclas: escrever no localStorage a cada caractere é
  // trabalho à toa num campo em que a pessoa digita rápido.
  useEffect(() => {
    if (!chaveRascunho) return
    const id = setTimeout(() => {
      try {
        if (draft.trim()) {
          window.localStorage.setItem(chaveRascunho, JSON.stringify({
            texto: draft, em: Date.now(), dono: lead.responsavel_id ?? null,
          }))
        } else {
          window.localStorage.removeItem(chaveRascunho)
        }
      } catch { /* sem espaço: segue sem rascunho */ }
    }, 400)
    return () => clearTimeout(id)
  }, [draft, chaveRascunho, lead.responsavel_id])

  // O campo cresce com o texto e volta ao tamanho de uma linha ao esvaziar. Sem
  // isto, ou ele fica alto de propósito comendo a conversa, ou some com o que
  // não caber em uma linha — e a pessoa digita sem ver o que escreveu.
  useEffect(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [draft])
  const [confirmDel, setConfirmDel] = useState(false)
  const [movendoEtapa, setMovendoEtapa] = useState(false)
  /** Etapa de perda escolhida, esperando motivo + justificativa. */
  const [perdaPendente, setPerdaPendente] = useState<string | null>(null)
  const [salvandoPerda, setSalvandoPerda] = useState(false)

  /**
   * Config da assinatura do atendente. A bolha do CRM mostra a MESMA linha que
   * o cliente recebe, então precisa obedecer ao mesmo interruptor: se o dono
   * desligar "incluir o nome da loja", a tela mudaria junto — senão o atendente
   * leria uma coisa aqui e o cliente outra no aparelho.
   */
  const [incluirEmpresa, setIncluirEmpresa] = useState(true)
  useEffect(() => {
    if (!empresa?.id) return
    let cancel = false
    supabase.from('configuracoes_sistema').select('valor')
      .eq('empresa_id', empresa.id).eq('chave', 'assinatura_atendente').maybeSingle()
      .then(({ data }) => {
        if (cancel) return
        const v = (data?.valor ?? {}) as { incluir_empresa?: boolean }
        setIncluirEmpresa(v.incluir_empresa !== false)
      })
    return () => { cancel = true }
  }, [empresa?.id, supabase])

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
    (!ultimaDoCliente || agora - new Date(ultimaDoCliente).getTime() > 24 * 60 * 60 * 1000)

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
        .select('direcao, conteudo, created_at, tipo, midia_url, status_entrega, erro_envio, external_id, usuario_id')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })
      if (cancel) return
      type MsgRow = {
        direcao: string | null; conteudo: string | null; created_at: string
        tipo: string | null; midia_url: string | null
        status_entrega: string | null; erro_envio: string | null; external_id: string | null
        usuario_id: string | null
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
        // Quem atendeu. Nulo = saiu do celular, fora do CRM.
        autor: m.usuario_id ? (usuarios.find((u) => u.id === m.usuario_id)?.nome ?? 'Atendente') : null,
      }))
      setChat(msgs)
      setLoadingChat(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
      /**
       * MARCA COMO LIDA SEM PERGUNTAR AO CONTADOR.
       *
       * Isto era `if ((lead.msgs_nao_lidas ?? 0) > 0)`, e a condição criava um
       * poço sem saída: com o contador errado para baixo — o que acontecia,
       * porque ele era somado à mão em três lugares — abrir a conversa não
       * marcava nada, as mensagens ficavam não lidas para sempre e o cliente
       * seguia esperando resposta sem ninguém ver. Medido em 01/09/2026: 15
       * leads presos assim, 17 mensagens invisíveis.
       *
       * Quem abriu a conversa leu o que estava nela; é a verdade, não uma
       * dedução a partir de um número que pode estar torto. O contador agora é
       * espelho: o gatilho `nao_lidas_sincroniza` o recalcula a partir desta
       * própria escrita, então não é preciso zerá-lo aqui.
       */
      const { count } = await supabase
        .from('lead_mensagens')
        .update({ lida: true }, { count: 'exact' })
        .eq('lead_id', lead.id).eq('lida', false).eq('direcao', 'recebida')
      if (count || (lead.msgs_nao_lidas ?? 0) > 0) onUpdate({ ...lead, msgs_nao_lidas: 0 })
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
      /**
       * O PRÓPRIO LEAD TAMBÉM MUDA ENQUANTO A CONVERSA ESTÁ ABERTA: outro
       * vendedor move de etapa, o admin troca o responsável, a esteira devolve
       * para o pool. Nada disso aparecia sem F5 — a tela mostrava um estado que
       * já não existia, e salvar por cima desfazia a mudança do colega.
       *
       * Só campos de ESTADO são adotados. Nome, telefone e observações ficam de
       * fora de propósito: sobrescrever o que a pessoa está digitando seria pior
       * que ficar desatualizado.
       */
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${lead.id}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const l = payload.new as {
            kanban_status?: string | null; responsavel_id?: string | null
            funil_id?: number | null; valor_estimado?: number | null
          }
          setForm((f) => ({
            ...f,
            status: l.kanban_status ?? f.status,
            responsavel: l.responsavel_id ?? '',
          }))
          onUpdate({ ...lead, ...(payload.new as object) })
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
    setRascunhoRestaurado(false)
    // Enviou: deixou de ser rascunho. O `rollback` abaixo devolve o texto ao
    // campo se o envio falhar, e o efeito de gravação salva de novo — então não
    // há risco de perder a mensagem por limpar aqui.
    if (chaveRascunho) { try { window.localStorage.removeItem(chaveRascunho) } catch {} }
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
        // Canal sem integração (anotação de atendimento presencial): grava
        // direto, e com o autor, igual aos canais que passam pela Edge.
        const { data: { user: autor } } = await supabase.auth.getUser()
        const { error } = await supabase.from('lead_mensagens').insert({
          empresa_id: empresa.id, lead_id: lead.id, direcao: 'enviada',
          conteudo: t, origem: canal, lida: true, usuario_id: autor?.id ?? null,
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

  /**
   * Troca de etapa pelo modal, com efeito imediato.
   *
   * Antes o modal RECUSAVA marcar Perdido: mandava fechar e arrastar o card no
   * quadro, porque a perda exige motivo e o motivo só existia no fluxo do
   * arraste. Pedir para o vendedor repetir o gesto noutro lugar é empurrar
   * trabalho para quem está no meio do atendimento — o modal agora pede o motivo
   * ali mesmo.
   *
   * As etapas normais movem na hora (otimista, com reversão se o servidor
   * recusar). A rota é a MESMA do quadro, então automação, cadência por etapa e
   * orçamento de negociação continuam disparando igual.
   */
  async function mudarEtapa(novo: string) {
    if (novo === (form.status || lead.kanban_status || 'novo')) return
    const alvo = columns.find((c) => c.id === novo)

    // Perdido: não move nada até saber o motivo. Se o vendedor cancelar, o
    // select volta para a etapa real — nada de card em limbo.
    if (alvo?.tipo === 'perdido') { setPerdaPendente(novo); return }

    const anterior = form.status
    setForm((f) => ({ ...f, status: novo }))
    setMovendoEtapa(true)
    try {
      const r = await fetch('/api/leads/mover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, kanban_status: novo }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Falha ao mover')
      onUpdate({ ...lead, kanban_status: novo })
      notify.ok('Etapa alterada', alvo?.label ?? novo)
    } catch (e) {
      setForm((f) => ({ ...f, status: anterior }))
      notify.bad('Não foi possível mover', e instanceof Error ? e.message : undefined)
    } finally {
      setMovendoEtapa(false)
    }
  }

  /**
   * Perda confirmada no modal: grava ETAPA + MOTIVO + JUSTIFICATIVA de uma vez.
   *
   * A justificativa vai para `observacoes` (é onde ela sempre morou e onde o
   * vendedor a lê depois), com rótulo e data — o mesmo lead pode ser perdido,
   * voltar e ser perdido de novo, e sem carimbo ninguém sabe de qual vez é o
   * texto.
   */
  async function confirmarPerda(motivoId: number, justificativa: string) {
    if (!perdaPendente) return
    setSalvandoPerda(true)
    try {
      const quando = new Date().toLocaleDateString('pt-BR')
      const obsNova = justificativa
        ? (form.obs ? form.obs + '\n' : '') + `Justificativa da perda (${quando}): ${justificativa}`
        : form.obs

      const r = await fetch('/api/leads/mover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          kanban_status: perdaPendente,
          motivo_perda_id: motivoId,
          perdido_em: new Date().toISOString(),
          ...(justificativa ? { observacoes: obsNova } : {}),
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Falha ao registrar a perda')

      setForm((f) => ({ ...f, status: perdaPendente, obs: obsNova }))
      onUpdate({ ...lead, kanban_status: perdaPendente, motivo_perda_id: motivoId, observacoes: obsNova })
      notify.ok('Lead marcado como perdido', motivos.find((m) => m.id === motivoId)?.label)
      setPerdaPendente(null)
    } catch (e) {
      notify.bad('Não foi possível registrar a perda', e instanceof Error ? e.message : undefined)
    } finally {
      setSalvandoPerda(false)
    }
  }

  async function handleSave() {
    const statusKey = form.status || lead.kanban_status || 'novo'
    const respId = form.responsavel || null // Select agora guarda o ID; '' = sem responsável

    /**
     * A ETAPA NÃO É SALVA AQUI. O próprio select já moveu o lead (ver
     * `mudarEtapa`), inclusive no caminho da perda, que pede motivo antes.
     *
     * Antes este ponto recusava marcar Perdido e mandava o vendedor fechar o
     * modal e arrastar o card no quadro — o gesto duas vezes, no meio do
     * atendimento.
     */
    setSaving(true)
    // Campos editáveis (sem a etapa nem o responsável — cada um tem seu caminho).
    const { error } = await supabase.from('leads').update({
      nome: form.nome.trim() || null,
      telefone: form.tel.trim() || null,
      instagram: form.ig.trim() || null,
      produto_interessado: form.produto.trim() || null,
      observacoes: form.obs.trim() || null,
    }).eq('id', lead.id)
    if (error) { setSaving(false); notify.bad('Erro ao salvar'); return }

    /**
     * TROCA DE DONO vai pela rota, nunca pelo client.
     *
     * A proteção de carteira e a regra de quem pode transferir vivem em
     * /api/leads/atribuir. Gravar `responsavel_id` daqui contornava as duas em um
     * clique — e ainda zerava `responsavel_desde`, reiniciando a carência.
     */
    const donoAtual = lead.responsavel_id ?? null
    if (respId !== donoAtual) {
      const acao = !respId ? 'devolver' : (!donoAtual && respId === meuId ? 'pegar' : 'atribuir')
      const r = await fetch('/api/leads/atribuir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, acao, paraResponsavel: respId }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setSaving(false)
        // O resto já foi salvo; devolve o select ao dono real para a tela não
        // mostrar uma troca que o servidor recusou.
        setForm((f) => ({ ...f, responsavel: donoAtual ?? '' }))
        notify.bad('Responsável não alterado', j.error ?? 'Tente novamente.')
        return
      }
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
    /**
     * Diz o que FALTOU, em vez de comemorar um cadastro pela metade.
     *
     * A conversão grava nome, telefone e Instagram — é o que o lead tem. Só que o
     * cliente nasce sem CPF, endereço, estado civil: os campos que o CONTRATO usa.
     * O cadastro manual pede tudo isso com asterisco; este caminho não pedia nada e
     * ainda respondia "convertido em cliente!", como se estivesse completo. Foi
     * assim que a JM ficou com clientes sem CPF — e o contrato saiu em branco.
     *
     * Não bloqueia: o vendedor está com o cliente na frente e pode não ter o CPF
     * ainda. Mas sai daqui sabendo o que buscar, e onde.
     */
    const faltando = camposFaltantesContrato({
      nome: form.nome, telefone: form.tel,
    })
    if (faltando.length) {
      notify.warn(
        'Cliente criado com cadastro incompleto',
        `Falta para o contrato: ${faltando.join(', ')}. Complete em Clientes.`,
      )
    } else {
      notify.ok('Lead convertido em cliente!')
    }
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
            {/* O rótulo e o TIPO de campo vêm do contrato, não de um `if` por
                segmento. Vertical com catálogo no CRM (varejo, assistência) ganha
                o autocomplete de produto; vertical cujo item vive em tabela
                própria (imóvel, veículo) recebe texto livre. */}
            {cfgSegmento.paineisDoLead.length > 0 ? (
              <Input label={cfgSegmento.interesseLabel} value={form.produto} onChange={(e) => set('produto', e.target.value)} />
            ) : (
              <ProdutoAutocomplete label={cfgSegmento.interesseLabel} value={form.produto} onChange={(v) => set('produto', v)} onSelect={(p) => set('produto', p.nome)} />
            )}
            {salvarAqui('produto')}
            {/* Escolher a etapa MOVE o card na hora — não espera "Salvar".
                Trocar o status é uma ação, não a edição de um texto: quem escolhe
                "Negociando" quer que o quadro mostre isso agora. */}
            <Select label="Status no funil" value={form.status} onChange={(e) => mudarEtapa(e.target.value)} disabled={movendoEtapa}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            {movendoEtapa && <p className="text-[11.5px] text-ink-3">movendo…</p>}
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
            {/* Painéis da vertical, na ordem que o segmento declarou. Acrescentar
                uma vertical não abre mais este arquivo. */}
            <PaineisDaVertical nomes={cfgSegmento.paineisDoLead} leadId={lead.id} />
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
                    {/* `whitespace-pre-wrap`: a mensagem chega com as quebras que
                        a pessoa digitou, e sem isto uma tabela de preços de
                        quatro linhas era exibida achatada numa só — inclusive as
                        que já estavam no histórico. `break-words` porque link
                        longo sem espaço estourava a bolha. */}
                    <div className={`max-w-[72%] whitespace-pre-wrap break-words rounded-[12px] px-3.5 py-2.5 text-[13px] shadow-[0_1px_1px_rgba(11,20,26,0.13)] ${isLoja ? 'rounded-br-[3px] bg-[#d9fdd3] text-[#111b21]' : 'rounded-bl-[3px] bg-white text-[#111b21]'}`}>
                      {/* Quem respondeu. No WhatsApp de grupo o nome vem assim,
                          acima da mensagem — e é o que permite ao próximo
                          atendente saber com quem o cliente já falou. */}
                      {/* A MESMA linha que o cliente recebe — primeiro nome,
                          loja em maiúsculas, negrito-itálico — para o atendente
                          não ler uma coisa na tela e o cliente outra no
                          aparelho. Em preto: cor por pessoa foi descartada pelo
                          dono.

                          Só quando SABEMOS quem foi: mensagem anterior à coluna
                          de autoria tem autor nulo, e rotulá-la seria inventar
                          história sobre conversa que já aconteceu. */}
                      {isLoja && m.autor && (
                        <div className="mb-0.5 text-[12.5px] font-semibold italic leading-tight text-[#111b21]">
                          {assinaturaDoChat(m.autor, incluirEmpresa ? empresa?.nome : null)}
                        </div>
                      )}
                      {m.tipo === 'anuncio' && <AnuncioChat conteudo={m.text} midiaUrl={m.midiaUrl} />}
                      {m.tipo === 'reel' && <ReelChat conteudo={m.text} />}
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
                        <AudioChat url={m.midiaUrl} />
                      )}
                      {/* Documento (PDF de comprovante, nota, boleto): o valor está
                          no NOME e no download, não em prévia. */}
                      {m.midiaUrl && m.tipo === 'documento' && (
                        <a
                          href={m.midiaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mb-1 flex items-center gap-2 rounded-[8px] bg-black/[0.06] px-2 py-1.5 text-[12.5px] font-medium text-[#111b21] transition-colors hover:bg-black/10"
                        >
                          <FileText size={16} strokeWidth={1.8} className="shrink-0 text-[#54656f]" />
                          <span className="max-w-[190px] truncate">
                            {ehPlaceholderMidia(m.text) ? 'Documento' : m.text}
                          </span>
                        </a>
                      )}
                      {m.tipo === 'anuncio' || m.tipo === 'reel' ? null
                        : m.midiaUrl && m.tipo === 'documento' ? null : ehPlaceholderMidia(m.text)
                        // Placeholder SEM arquivo: até 12/08/2026 o eco do celular
                        // não baixava a mídia, e a bolha exibia o texto cru
                        // "[audio]" — que não diz nada a quem lê a conversa.
                        ? (!m.midiaUrl && <MidiaAusente placeholder={m.text} />)
                        : formatarTextoChat(m.text)}
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

            {/* `items-end`: o campo cresce com as linhas, e os botões precisam
                ficar rentes à base — centralizados, eles subiriam junto. */}
            {/* Avisa que o texto no campo veio de antes. Sem isso, reabrir a
                conversa e encontrar palavras já escritas assusta: o vendedor não
                sabe se aquilo foi enviado ao cliente ou não. Sai no primeiro
                toque de tecla. */}
            {rascunhoRestaurado && (
              <div className="flex items-center gap-1.5 border-t border-line-soft px-3 pt-2 text-[11.5px] text-ink-3 sm:px-5">
                <Clock size={12} strokeWidth={1.8} className="shrink-0" />
                Rascunho salvo — esta mensagem <strong className="font-semibold text-ink-2">não foi enviada</strong>.
              </div>
            )}

            <div className="flex items-end gap-1.5 border-t border-line-soft px-3 py-3.5 sm:gap-2 sm:px-5">
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
              {/* Enter envia, SHIFT+ENTER quebra linha — igual ao WhatsApp Web.
                  Era um <input> de uma linha: para mandar preço em lista o
                  vendedor tinha que emendar tudo com " - " numa linha só. */}
              <textarea
                ref={draftRef}
                rows={1}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setRascunhoRestaurado(false) }}
                onKeyDown={(e) => {
                  // isComposing: no Mac o acento é composto com dead key, e enviar
                  // no meio da composição corta a palavra.
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
                  e.preventDefault()
                  sendMsg()
                }}
                placeholder={gravando ? 'Gravando áudio…' : 'Digite uma mensagem…  (Shift+Enter pula linha)'}
                disabled={gravando}
                className="max-h-[132px] min-h-[40px] min-w-0 flex-1 resize-none overflow-y-auto rounded-control border border-line bg-card px-3 py-[9px] text-base leading-snug text-ink scrollbar-thin placeholder:text-ink-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 disabled:opacity-60 sm:min-h-[36px] sm:py-[8px] sm:text-[13px]"
              />
              <IconButton aria-label="Enviar mensagem" variant="primary" onClick={sendMsg}>
                <Send size={16} strokeWidth={1.7} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      {/* Perda pedida pelo select: motivo + justificativa antes de mover.
          Cancelar devolve o select à etapa real — o lead não fica em limbo. */}
      {perdaPendente && (
        <MotivoPerdaModal
          leadNome={form.nome || lead.nome || ''}
          motivos={motivos}
          loading={salvandoPerda}
          onConfirm={confirmarPerda}
          onCancel={() => setPerdaPendente(null)}
        />
      )}

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
