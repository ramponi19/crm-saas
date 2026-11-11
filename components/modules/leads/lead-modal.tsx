'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Send, UserCheck, Merge, Trash2, UserRound, X, Paperclip, Mic, Square, Loader2, Clock, FileText, Instagram, Play, AudioLines, AlertTriangle, RotateCcw } from 'lucide-react'
import { AnuncioChat } from '@/components/modules/conversa/anuncio-chat'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { camposFaltantesContrato } from '@/lib/cliente-contrato'
import { useEmpresa } from '@/lib/empresa-context'
import { lerReelCard, urlEmbed } from '@/lib/reel-instagram'
import { urlDeMidia } from '@/lib/storage/midia'
import { entregarViaEdge, ehTimeoutMeta, TIPO_DB } from '@/lib/envio-edge'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { CardDoLead } from '@/lib/card-do-lead'
import { Lead, Usuario, type KanbanColumn, type Motivo, ganhoColId, CAMPOS_QUALIFICACAO } from './types'
import { MotivoPerdaModal } from './motivo-perda-modal'
import { PaineisDaVertical } from './paineis-vertical'
import type { PerfilDoLead } from '@/lib/empresa-config'
import { LeadChamadasPanel } from './lead-chamadas-panel'
import { LeadCadenciaPanel } from './lead-cadencia-panel'
import { LeadOrcamentoPanel } from './lead-orcamento-panel'
import { LeadReservaPanel } from './lead-reserva-panel'
import { ProdutoAutocomplete } from './produto-autocomplete'
import { formatarTextoChat } from '@/lib/texto-whatsapp'
import { AvisoPagamentoMeta, type AvisoPagamento } from '@/components/modules/canais/aviso-pagamento-meta'
import { EmojiPicker } from './emoji-picker'
import { LeadAcoesPanel } from './lead-acoes-panel'
import { ResponsavelPanel } from './responsavel-panel'
import { EtiquetasPanel, HistoricoNegocioPanel } from './etiquetas-panel'
import { FundirContatoModal } from './fundir-contato-modal'
import { useRouter } from 'next/navigation'
import { Input, Select, Textarea, Button, IconButton, Badge, ConfirmDialog, Modal, notify } from '@/components/ui'
import { useLockScroll, useEscape } from '@/components/ui/overlay'
import { useFuso } from '@/components/fuso-provider'
import { agora as agoraNoRelogio, formatarData, formatarDataHora, formatarDiaMes } from '@/lib/datas'

interface LeadModalProps {
  /**
   * O card busca o próprio lead no core (GET /api/leads/[id]/card, 03/11/2026):
   * antes ele recebia a linha da view `leads` que a lista do quadro carregava.
   */
  leadId: number
  usuarios: Usuario[]
  columns: KanbanColumn[]
  /** O que este card mostra além do comum (lib/empresa-config.ts → perfilDoLead). */
  perfil: PerfilDoLead
  /**
   * Motivos de perda. Necessários AQUI porque agora dá para marcar Perdido pelo
   * próprio modal — antes ele recusava e mandava arrastar o card no quadro.
   */
  motivos?: Motivo[]
  onClose: () => void
  onUpdate: (lead: Lead) => void
  /** O lead não existe ou é de outra loja (404): quem abriu decide o que dizer. */
  onNaoEncontrado?: () => void
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

// Envio pela Edge (entregarViaEdge, ErroEnvio, ehTimeoutMeta): lib/envio-edge.ts — o mesmo da Inbox.

interface ChatMsg {
  from: 'cliente' | 'loja'; text: string; time: string; tipo?: string; midiaUrl?: string | null
  /**
   * id da linha. A confirmação de entrega acha a bolha por ele quando o
   * `externalId` muda — o envio que estourou o prazo é gravado com uma marca
   * provisória, trocada pelo id da Meta quando o status chega.
   */
  id?: number
  /**
   * Quando a RETENCAO retirou o arquivo desta mensagem.
   *
   * Sem isto, `midiaUrl` nulo significa duas coisas opostas: "nunca chegou"
   * (a Meta nao entregou) e "chegou, ficou a janela inteira e saiu porque o
   * bucket tem 1 GB". A tela precisa dizer qual das duas — senao chama de
   * indisponivel o arquivo que a propria loja decidiu nao guardar.
   */
  retidaEm?: string | null
  /** Marca de tempo crua — usada para calcular a janela de 24h. */
  iso?: string
  /** Confirmação da Meta (só em mensagem enviada): enviada | entregue | lida | falhou. */
  status?: string | null
  erro?: string | null
  /** id da Meta — é por ele que a confirmação de entrega encontra a bolha. */
  externalId?: string | null
  /**
   * O que foi DITO no áudio, transcrito pela máquina.
   *
   * Nunca se mistura com `text`: vai em tipografia própria e rotulada, porque
   * transcrição automática erra ("no prato" por "preto", "a salva de bateria"
   * por "a saúde") e ninguém pode confundi-la com o que a pessoa escreveu.
   */
  transcricao?: string | null
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
  falha_envio: 'A Meta não respondeu a tempo — pode ter chegado; confira antes de tentar de novo',
}

/** Linha de mensagens como ela chega pelo realtime. */
type LinhaMsg = {
  id: number; direcao: string; conteudo: string | null; created_at: string; filial_id?: number | null
  lida: boolean | null; tipo: string | null; midia_url: string | null
  status_entrega?: string | null; erro_envio?: string | null; external_id?: string | null
}

// Placeholder textual gravado junto com mídia — não renderiza quando a mídia aparece.
const ehPlaceholderMidia = (t: string) => /^\[(imagem|video|audio|midia|documento)\]$/.test(t)

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

/**
 * A mensagem diz que havia um anexo, e o arquivo não existe aqui.
 *
 * ══ POR QUE "PARA O CRM", E NÃO "NO CRM" ═══════════════════════════════════
 *
 * Era "arquivo não disponível NO CRM", e o Lucas apontou em 13/10/2026 que a
 * preposição põe a culpa no lugar errado: "no CRM" soa como limitação nossa.
 * Medido, não é — das 955 mensagens assim na JM:
 *
 *   632  a Meta mandou o histórico SEM a mídia. No sync ela entrega o arquivo
 *        só das mensagens dos últimos 14 dias; o resto vem como
 *        `media_placeholder`. A mais antiga é de 08/05, três meses antes de
 *        este webhook existir.
 *   259  anexo de Instagram cuja URL da Meta já tinha expirado quando fomos
 *        buscar (fica registrado como `anexo_meta_sem_arquivo`).
 *   178  resíduo do primeiro período de uso, todas até 12/08 — o dia em que o
 *        eco do celular passou a baixar mídia. Não acontece mais.
 *
 * Em quase tudo, **queríamos ter e a origem não entregou**. "Indisponível para
 * o CRM" diz isso; "não disponível no CRM" dizia o contrário.
 *
 * ⚠ Não confundir com "Foto enviada pelo celular", que é escolha nossa de não
 * guardar o arquivo. Ali sabemos o que era e optamos por não ter.
 */
function MidiaAusente({ placeholder, retidaEm }: { placeholder: string; retidaEm?: string | null }) {
  const fuso = useFuso()
  /**
   * DUAS AUSENCIAS QUE PARECEM A MESMA, E NAO SAO.
   *
   * Sem arquivo, a tela dizia sempre "indisponivel para o CRM". Isso e
   * verdade quando a Meta nunca entregou a midia ou o download falhou — e e
   * MENTIRA quando o arquivo chegou, ficou a janela inteira e saiu pela
   * retencao: ali ele esteve disponivel, e a loja decidiu nao guardar.
   *
   * A diferenca importa para quem abre a conversa meses depois procurando a
   * foto do comprovante: "nunca chegou" manda a pessoa cobrar o cliente de
   * novo; "guardamos 7 dias" explica o que houve.
   */
  if (retidaEm) {
    const dia = formatarDiaMes(retidaEm, '', fuso)
    return (
      <span className="text-[13px] italic text-[#667781]">
        {NOME_MIDIA[placeholder] ?? 'Anexo'} — não guardado (retirado em {dia})
      </span>
    )
  }
  return (
    <span className="text-[13px] italic text-[#667781]">
      {NOME_MIDIA[placeholder] ?? 'Anexo'} — indisponível para o CRM
    </span>
  )
}

/**
 * O QUE FOI DITO NO ÁUDIO — e por que não pode parecer texto digitado.
 *
 * Requisito do Lucas, em 13/10/2026: *"vc vai trazer com tipografia diferente
 * e informação que trata-se de transcrição de áudio para não parecer que
 * escreveu"*.
 *
 * Ele tem razão, e a medição dá o motivo: no teste com 10 áudios reais da loja
 * a máquina escreveu "no prato" onde era "preto", "a salva de bateria" onde
 * era "a saúde", e "Defesa do Pestruidor". Passável para entender a conversa,
 * inaceitável como citação do que alguém disse.
 *
 * Daí as três marcas: fonte diferente da bolha, cor mais apagada e o rótulo
 * fixo. Quem bate o olho sabe que é máquina falando, não a pessoa.
 *
 * ⚠ `audioGuardado` existe porque o arquivo não fica para sempre. Áudio é 48%
 * do bucket, e o plano é guardá-lo por uma janela curta — 98,5% das conversas
 * que voltam, voltam em até 7 dias. Passada a janela, o som some e **o texto
 * fica**; a tela precisa dizer isso em vez de mostrar um player quebrado.
 */
function TranscricaoAudio({ texto, audioGuardado }: { texto: string; audioGuardado: boolean }) {
  return (
    <div className="mt-1 border-l-2 border-[#8696a0]/40 pl-2">
      <div className="mb-0.5 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#8696a0]">
        <AudioLines size={11} strokeWidth={2} />
        transcrição automática
        {!audioGuardado && <span className="font-normal normal-case">· áudio não guardado</span>}
      </div>
      {/* Serifada e um pouco menor: nenhuma outra coisa na conversa é assim,
          então a diferença se lê antes mesmo do rótulo. */}
      <p className="font-serif text-[12.5px] italic leading-relaxed text-[#54656f]">
        {texto}
      </p>
    </div>
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

async function buscarCard(leadId: number): Promise<{ card: CardDoLead | null; erro: string; status: number }> {
  const r = await fetch(`/api/leads/${leadId}/card`, { cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  return r.ok ? { card: j as CardDoLead, erro: '', status: r.status } : { card: null, erro: j.error ?? 'Não foi possível abrir o lead', status: r.status }
}

/**
 * O CARD DO LEAD. Busca o que mostra no core, pelo id — e só isso (~1 KB, contra
 * a lista inteira de leads que o quadro carregava para abrir um). Enquanto chega,
 * a mesma moldura do modal com "Carregando". O conteúdo só monta com o lead do
 * banco em mãos, então o formulário nasce igual ao que está gravado e nada
 * aparece como "alteração não salva" ao abrir.
 */
export function LeadModal({ leadId, onUpdate, onClose, onNaoEncontrado, ...resto }: LeadModalProps) {
  const [card, setCard] = useState<CardDoLead | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useLockScroll(true)
  useEscape(!card, onClose)

  const recarregar = useCallback(async (): Promise<CardDoLead | null> => {
    const r = await buscarCard(leadId)
    if (r.card) setCard(r.card)
    return r.card
  }, [leadId])
  // Outro lead = outro componente (o quadro passa `key`), então o estado já nasce vazio.
  useEffect(() => {
    let vivo = true
    buscarCard(leadId).then((r) => {
      if (!vivo) return
      if (r.card) setCard(r.card)
      else if (r.status === 404 && onNaoEncontrado) onNaoEncontrado()
      else setErro(r.erro)
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o aviso é de quem abriu; o lead é o que importa
  }, [leadId])

  const atualizar = useCallback((l: Lead) => {
    setCard((c) => (c ? { ...c, lead: l } : c))
    onUpdate(l)
  }, [onUpdate])

  if (!card) {
    if (typeof document === 'undefined') return null
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 p-0 sm:p-6"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-3 overflow-hidden border border-line bg-card text-[13px] text-ink-3 shadow-[0_30px_70px_-20px_rgba(21,24,28,0.4)] sm:h-[620px] sm:max-h-[92vh] sm:w-[1000px] sm:max-w-[96vw] sm:rounded-modal">
          {erro ? (
            <>
              <span>{erro}</span>
              <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
            </>
          ) : (
            <><Loader2 size={18} className="animate-spin" /> Carregando o lead…</>
          )}
        </div>
      </div>,
      document.body,
    )
  }
  return <LeadModalCarregado card={card} recarregar={recarregar} onUpdate={atualizar} onClose={onClose} {...resto} />
}

function LeadModalCarregado({ card, recarregar, usuarios, columns, perfil, motivos = [], onClose, onUpdate }: Omit<LeadModalProps, 'leadId'> & {
  card: CardDoLead
  recarregar: () => Promise<CardDoLead | null>
}) {
  const lead = card.lead
  /*
   * O perfil chega pronto — o modal não pergunta quem a empresa é.
   *
   * Antes havia cinco comparações aqui (rótulo do campo de interesse e três
   * painéis próprios). Acrescentar um tipo de negócio exigia editar este arquivo,
   * que é o mais disputado do projeto: em 13/08 duas frentes colidiram nele.
   */
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const fuso = useFuso()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  /** Sobe a cada mudança feita no card (etiqueta, responsável): o histórico do negócio relê. */
  const [versaoHist, setVersaoHist] = useState(0)
  /**
   * Os funis da empresa, para TROCAR o lead de funil (15/10/2026). Antes só se
   * mudava a etapa dentro do funil atual — um funil novo (ex.: "Equipe", marcado
   * como interno para as conversas da equipe saírem do ZapIntel) não tinha como
   * receber lead. Só aparece quando há mais de um funil.
   */
  const [funis, setFunis] = useState<{ id: number; nome: string; padrao: boolean; interno: boolean }[]>([])
  const [trocandoFunil, setTrocandoFunil] = useState(false)
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
  const [fundindo, setFundindo] = useState(false)
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
   * Lead livre abre com o Responsável VAZIO e assim fica até alguém escolher
   * (decisão do Lucas, 03/11/2026). Antes o campo vinha preenchido com quem
   * abriu — só na tela —, e o card abria marcado "alteração não salva" sem
   * ninguém ter mexido. Responder continua assumindo o lead (`assumirSeLivre`).
   */

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

  /**
   * Campos personalizados da empresa (Configurações → campos), só os de módulo
   * ligado — o card os traz prontos (lib/card-do-lead.ts). Chave: "entidade.chave".
   */
  const [camposForm, setCamposForm] = useState<Record<string, string>>(
    () => Object.fromEntries(card.campos.map((c) => [`${c.entidade}.${c.chave}`, c.valor])),
  )
  /** Dono e admin trocam de loja; o vendedor vê só a dele. */
  const gereLojas = ['owner', 'admin'].includes(usuarios.find((u) => u.id === meuId)?.role ?? '')
  const camposMudados = card.campos.filter((c) => (camposForm[`${c.entidade}.${c.chave}`] ?? '') !== c.valor)
  const algoMudou = Object.keys(original).some(mudou) || camposMudados.length > 0

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
  const [avisosPagamento, setAvisosPagamento] = useState<AvisoPagamento[]>([])
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
      // Só o aprovado NO NÚMERO que envia pela loja deste negócio (11/11/2026: a Meta aprova por
      // WABA) + o aviso de conta sem forma de pagamento desse número.
      setAvisosPagamento([])
      const r = await fetch(`/api/modelos?negocio=${lead.id}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      const aprovados = new Set<number>((j.envio?.aprovados ?? []) as number[])
      setModelosAprovados(((j.modelos ?? []) as ModeloAprovado[]).filter((m) => aprovados.has(m.id)))
      setAvisosPagamento((j.envio?.avisosPagamento ?? []) as AvisoPagamento[])
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

  /**
   * A CONVERSA LÊ `mensagens` DIRETO (03/11/2026): as do contato NA LOJA deste
   * negócio — a mesma regra da view `lead_mensagens` —, as 200 mais recentes.
   * A maior conversa da JM tem 4.765 mensagens (1,7 MB) e abrir o card trazia
   * todas; as anteriores vêm sob pedido, 200 por vez ("ver anteriores").
   */
  const POR_PAGINA = 200
  const COLUNAS_MSG = 'id, direcao, conteudo, created_at, tipo, midia_url, status_entrega, erro_envio, external_id, usuario_id, transcricao, midia_retida_em'
  const [temAnteriores, setTemAnteriores] = useState(false)
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false)
  /** Mensagens antigas entram por cima: a conversa não pode pular para o fim. */
  const semRolarAteOFim = useRef(false)
  type MsgRow = {
    id: number; direcao: string | null; conteudo: string | null; created_at: string
    tipo: string | null; midia_url: string | null
    status_entrega: string | null; erro_envio: string | null; external_id: string | null
    usuario_id: string | null; transcricao: string | null
    midia_retida_em: string | null
  }
  const paraChat = (m: MsgRow): ChatMsg => ({
    id: m.id,
    from: m.direcao === 'enviada' ? 'loja' : 'cliente',
    text: m.conteudo ?? '',
    time: formatarDataHora(m.created_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, '', fuso),
    tipo: m.tipo ?? 'texto',
    midiaUrl: m.midia_url,
    retidaEm: m.midia_retida_em,
    transcricao: m.transcricao,
    status: m.status_entrega,
    erro: m.erro_envio,
    externalId: m.external_id,
    iso: m.created_at,
    // Quem atendeu. Nulo = saiu do celular, fora do CRM.
    autor: m.usuario_id ? (usuarios.find((u) => u.id === m.usuario_id)?.nome ?? 'Atendente') : null,
  })
  /** As mensagens do contato na loja do negócio, das mais novas para as mais antigas. */
  function mensagensDaConversa(antesDe?: string) {
    let q = supabase.from('mensagens').select(COLUNAS_MSG).eq('contato_id', card.contatoId)
    q = card.filialId == null ? q.is('filial_id', null) : q.eq('filial_id', card.filialId)
    if (antesDe) q = q.lt('created_at', antesDe)
    return q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(POR_PAGINA + 1)
  }

  async function carregarAnteriores() {
    const maisAntiga = chat.find((m) => m.iso)?.iso
    if (!maisAntiga) return
    setCarregandoAnteriores(true)
    const { data } = await mensagensDaConversa(maisAntiga)
    const linhas = (data ?? []) as unknown as MsgRow[]
    setTemAnteriores(linhas.length > POR_PAGINA)
    semRolarAteOFim.current = true
    setChat((prev) => [...linhas.slice(0, POR_PAGINA).reverse().map(paraChat), ...prev])
    setCarregandoAnteriores(false)
  }

  useEffect(() => {
    let cancel = false
    async function load() {
      setLoadingChat(true)
      const { data } = await mensagensDaConversa()
      if (cancel) return
      const linhas = (data ?? []) as unknown as MsgRow[]
      setTemAnteriores(linhas.length > POR_PAGINA)
      setChat(linhas.slice(0, POR_PAGINA).reverse().map(paraChat))
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
       * Quem abriu a conversa leu o que estava nela — TODA ela, não só as 200
       * da tela. O contador de `conversas` é espelho: o gatilho o recalcula a
       * partir desta escrita.
       */
      let marcar = supabase.from('mensagens').update({ lida: true }, { count: 'exact' })
        .eq('contato_id', card.contatoId).eq('lida', false).eq('direcao', 'recebida')
      marcar = card.filialId == null ? marcar.is('filial_id', null) : marcar.eq('filial_id', card.filialId)
      const { count } = await marcar
      if (count || (lead.msgs_nao_lidas ?? 0) > 0) onUpdate({ ...lead, msgs_nao_lidas: 0 })
    }
    load()

    // Mensagens do contato (o filtro do realtime aceita uma condição só); as de
    // outra loja do mesmo contato ficam de fora aqui.
    const daLoja = (m: LinhaMsg) => (m.filial_id ?? null) === (card.filialId ?? null)
    const channel = supabase.channel(`lead_msgs_${lead.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `contato_id=eq.${card.contatoId}` },
        (payload: RealtimePostgresChangesPayload<LinhaMsg>) => {
          const m = payload.new as LinhaMsg
          if (!daLoja(m)) return
          setChat((prev) => {
            const novaMsg: ChatMsg = {
              id: m.id,
              from: m.direcao === 'enviada' ? 'loja' : 'cliente',
              text: m.conteudo ?? '',
              time: formatarDataHora(m.created_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, '', fuso),
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
            supabase.from('mensagens').update({ lida: true }).eq('id', m.id)
          }
        })
      // A confirmação de entrega chega DEPOIS, como alteração da linha. Sem
      // escutar UPDATE, o tique nunca mudaria sem recarregar a conversa.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mensagens', filter: `contato_id=eq.${card.contatoId}` },
        (payload: RealtimePostgresChangesPayload<LinhaMsg>) => {
          const m = payload.new as LinhaMsg
          if (!daLoja(m) || (!m.external_id && !m.status_entrega)) return
          // Pelo id primeiro: a bolha de um envio que estourou o prazo tem a marca
          // provisória, e o UPDATE já chega com o id da Meta no lugar dela.
          setChat((prev) => prev.map((x) =>
            (x.id != null && x.id === m.id) || (x.externalId && x.externalId === m.external_id)
              ? { ...x, externalId: m.external_id ?? x.externalId, status: m.status_entrega ?? x.status, erro: m.erro_envio ?? null, text: m.conteudo ?? x.text, midiaUrl: m.midia_url ?? x.midiaUrl, tipo: m.tipo ?? x.tipo }
              : x,
          ))
        })
      /**
       * O PRÓPRIO LEAD TAMBÉM MUDA ENQUANTO A CONVERSA ESTÁ ABERTA: outro
       * vendedor move de etapa, o admin troca o responsável, a esteira devolve
       * para o pool. Nada disso aparecia sem F5 — a tela mostrava um estado que
       * já não existia, e salvar por cima desfazia a mudança do colega.
       *
       * O card é relido do core (~1 KB). Só campos de ESTADO vão para o
       * formulário: nome, telefone e observações ficam como a pessoa os está
       * digitando — sobrescrever seria pior que ficar desatualizado.
       */
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'negocios', filter: `id=eq.${lead.id}` },
        async () => {
          const novo = await recarregar()
          if (!novo || cancel) return
          setForm((f) => ({
            ...f,
            status: novo.lead.kanban_status ?? f.status,
            responsavel: novo.lead.responsavel_id ?? '',
          }))
          onUpdate(novo.lead)
        })
      .subscribe()

    return () => { cancel = true; supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  useEffect(() => {
    if (semRolarAteOFim.current) { semRolarAteOFim.current = false; return }
    if (!loadingChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.length, loadingChat])

  /** `reenvio`: o texto de uma bolha "Tentar de novo" — não mexe no campo de digitação. */
  async function sendMsg(reenvio?: unknown) {
    const ehReenvio = typeof reenvio === 'string'
    const t = (ehReenvio ? reenvio : draft).trim(); if (!t) return
    const canal = lead.origem ?? 'manual'
    if (!ehReenvio) {
      setDraft('')
      setRascunhoRestaurado(false)
      // Enviou: deixou de ser rascunho. O `rollback` abaixo devolve o texto ao
      // campo se o envio falhar, e o efeito de gravação salva de novo — então não
      // há risco de perder a mensagem por limpar aqui.
      if (chaveRascunho) { try { window.localStorage.removeItem(chaveRascunho) } catch {} }
    }
    setChat((prev) => [...prev, { from: 'loja', text: t, time: 'agora' }])

    const rollback = () => {
      setChat((prev) => {
        const idx = prev.findIndex((x) => x.from === 'loja' && x.text === t && x.time === 'agora')
        if (idx < 0) return prev
        const copy = [...prev]; copy.splice(idx, 1); return copy
      })
      if (!ehReenvio) setDraft(t)
    }
    // Timeout da Meta: a mensagem foi gravada como falha_envio. A bolha fica, com o
    // aviso — se a linha gravada já chegou pelo realtime, ela já substituiu esta.
    const marcarSemResposta = (erro: string) => {
      setChat((prev) => prev.map((x) =>
        x.from === 'loja' && x.text === t && x.time === 'agora' ? { ...x, status: 'falha_envio', erro } : x))
    }

    try {
      if (canal === 'instagram' || canal === 'messenger') {
        await entregarViaEdge(supabase, 'send_meta', { leadId: lead.id, texto: t, canal })
      } else if (canal === 'whatsapp') {
        if (!lead.telefone) throw new Error('Lead sem telefone para envio no WhatsApp')
        await entregarViaEdge(supabase, 'send', { number: lead.telefone, text: t, leadId: lead.id })
      } else {
        // Canal sem integração (anotação de atendimento presencial): grava pelo
        // servidor, com o autor, igual aos canais que passam pela Edge.
        await registrarSemCanal({ conteudo: t, origem: canal })
      }
      // (Saiu o `leads.update({ ultima_mensagem_at })` daqui: na view essa coluna
      // vem de `conversas` e o gatilho a ignorava — a gravação não fazia nada.)
      await assumirSeLivre()
    } catch (e) {
      if (ehTimeoutMeta(e)) {
        marcarSemResposta((e as Error).message)
        notify.warn('A Meta não respondeu', (e as Error).message)
        return
      }
      rollback()
      notify.bad('Erro ao enviar', e instanceof Error ? e.message : 'Tente novamente.')
    }
  }

  /**
   * Mensagem de canal sem integração (manual, site, indicação): /api/leads/[id]/mensagem,
   * que grava pela mensagem_registrar com o autor. Era o insert na view lead_mensagens.
   */
  async function registrarSemCanal(m: { conteudo: string; origem: string; tipo?: string; midia_url?: string }) {
    const r = await fetch(`/api/leads/${lead.id}/mensagem`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m),
    })
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Falha ao gravar a mensagem')
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
    const r = await fetch(`/api/leads/${lead.id}/card`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assumir: true }),
    })
    const j = await r.json().catch(() => ({})) as { assumido?: boolean; responsavelId?: string | null }
    if (!r.ok) return
    if (j.assumido && j.responsavelId) {
      setForm((f) => ({ ...f, responsavel: j.responsavelId! }))
      onUpdate({ ...lead, responsavel_id: j.responsavelId })
      notify.ok('Lead é seu', 'Você assumiu o atendimento ao responder.')
      return
    }
    // Perdeu a corrida: alguém respondeu primeiro.
    if (j.responsavelId) {
      const dono = usuarios.find((u) => u.id === j.responsavelId)?.nome
      notify.warn('Este lead já tem dono', dono ? `${dono} assumiu o atendimento primeiro.` : 'Outro vendedor assumiu primeiro.')
      setForm((f) => ({ ...f, responsavel: j.responsavelId! }))
      onUpdate({ ...lead, responsavel_id: j.responsavelId })
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
        await registrarSemCanal({ conteudo: `[${tipoDb}]`, origem: canal, tipo: tipoDb, midia_url: url })
      }
    } catch (e) {
      if (ehTimeoutMeta(e)) {
        // Gravada como falha_envio: a bolha fica, com o aviso (ver sendMsg).
        if (bolhaUrl) setChat((prev) => prev.map((x) =>
          x.from === 'loja' && x.time === 'agora' && x.midiaUrl === bolhaUrl ? { ...x, status: 'falha_envio', erro: (e as Error).message } : x))
        notify.warn('A Meta não respondeu', (e as Error).message)
        return
      }
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
  useEffect(() => {
    if (!empresa?.id) return
    let vivo = true
    supabase.from('funis').select('id, nome, padrao, interno').eq('empresa_id', empresa.id)
      .order('padrao', { ascending: false }).order('nome')
      .then(({ data }) => { if (vivo && data) setFunis(data) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o cliente do Supabase é recriado a cada render; a empresa é o que importa
  }, [empresa?.id])
  const funilAtual = lead.funil_id ?? funis.find((f) => f.padrao)?.id ?? null

  async function mudarFunil(id: number) {
    if (id === funilAtual) return
    const destino = funis.find((f) => f.id === id)
    setTrocandoFunil(true)
    try {
      const r = await fetch('/api/leads/mover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, funilId: id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'Falha ao trocar de funil')
      onUpdate({ ...lead, funil_id: id, kanban_status: j.kanban_status })
      notify.ok('Lead movido', destino?.interno ? `${destino.nome} — fora das métricas do ZapIntel` : destino?.nome)
      // As etapas deste modal são do funil antigo: fecha para o quadro mostrar o novo.
      onClose()
    } catch (e) {
      notify.bad('Não foi possível trocar de funil', e instanceof Error ? e.message : undefined)
    } finally {
      setTrocandoFunil(false)
    }
  }

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
      const quando = formatarData(agoraNoRelogio(), undefined, '', fuso)

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
    // Campos editáveis (sem a etapa nem o responsável — cada um tem seu caminho),
    // gravados direto no core pela rota do card (contatos + negocios.dados).
    const campos: { contato: Record<string, string>; negocio: Record<string, string> } = { contato: {}, negocio: {} }
    for (const c of camposMudados) campos[c.entidade][c.chave] = camposForm[`${c.entidade}.${c.chave}`] ?? ''
    const rSalvar = await fetch(`/api/leads/${lead.id}/card`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome, telefone: form.tel, instagram: form.ig,
        produto_interessado: form.produto, observacoes: form.obs,
        ...(camposMudados.length ? { campos } : {}),
      }),
    })
    if (!rSalvar.ok) {
      const j = await rSalvar.json().catch(() => ({}))
      setSaving(false); notify.bad('Erro ao salvar', j.error); return
    }

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

    // Relê do banco: o que ficou gravado (telefone normalizado, campos) passa a
    // ser o "original" — e o aviso de alteração pendente some.
    const novo = await recarregar()
    setSaving(false)
    notify.ok('Lead atualizado')
    onUpdate(novo?.lead ?? {
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

    // Pela camada de clientes (lib/clientes.ts): o contato do lead vira o cliente (pelo telefone ou,
    // sem telefone, pelo `lead_id`) — o lead que só tem Instagram não ganha um segundo contato.
    const rCli = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: form.nome.trim(), telefone: form.tel.trim() || null, instagram: form.ig.trim() || null, ativo: true, lead_id: lead.id }),
    })
    const jCli = await rCli.json().catch(() => ({})) as { cliente?: { id: number }; error?: string }
    const cliente = jCli.cliente
    if (!rCli.ok || !cliente) { notify.bad('Erro ao converter', jCli.error); setSaving(false); return }

    // Etapa de ganho pela mesma rota do quadro (automações e cadências disparam
    // igual) e a marca de conversão no negócio, pela rota do card.
    // As duas respostas são conferidas (04/11/2026): UPDATE barrado pela RLS volta
    // 403 e a tela diz o que não foi gravado, em vez de comemorar.
    const rMover = await fetch('/api/leads/mover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, kanban_status: ganhoColId(columns) }),
    })
    const rMarca = await fetch(`/api/leads/${lead.id}/card`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ convertido_em: cliente.id }),
    })

    setSaving(false)
    if (!rMover.ok || !rMarca.ok) {
      const j = await (rMover.ok ? rMarca : rMover).json().catch(() => ({})) as { error?: string }
      notify.bad('Cliente criado, mas o lead não foi marcado como convertido', j.error)
      return
    }
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
    // Excluir é desativar (dados._lead.ativo = false), como sempre foi pela view.
    const r = await fetch(`/api/leads/${lead.id}/card`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: false }),
    })
    setSaving(false)
    if (!r.ok) { notify.bad('Erro ao excluir'); return }
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
              src={urlDeMidia(lead.foto_url) ?? undefined}
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
          {/* O mesmo contato tem negócio na outra loja. Quem vê as duas lojas
              abre por aqui; o vendedor só fica sabendo (a RLS não mostra a outra). */}
          {card.outrasLojas.map((o) => {
            const rotulo = `também em ${o.loja.replace(/^.*·\s*/, '')}`
            const titulo = `Este contato também tem um negócio em ${o.loja}`
            const estilo = 'rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2'
            return gereLojas
              ? <a key={o.filialId} href={`/leads?lead=${o.leadId}`} title={titulo} className={`${estilo} hover:text-ink`}>{rotulo}</a>
              : <span key={o.filialId} title={titulo} className={estilo}>{rotulo}</span>
          })}
          {/* Respondeu a uma transmissão: a origem DESTA conversa (o canal do contato não muda). */}
          {card.transmissao && (
            <a href={`/transmissao?id=${card.transmissao.id}`} data-transmissao-card={card.transmissao.id}
              title={`Respondeu à transmissão "${card.transmissao.nome}"`}
              className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2 hover:text-ink">
              origem: transmissão · {card.transmissao.nome}
            </a>
          )}
          <div className="flex-1" />
          {gereLojas && (
            <Button variant="ghost" size="sm" onClick={() => setFundindo(true)} disabled={saving} icon={<Merge size={15} strokeWidth={1.7} />}>
              Fundir contato
            </Button>
          )}
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
            {/* O rótulo e o TIPO de campo vêm do perfil, não de um `if` na tela.
                Quem vende do catálogo do CRM ganha o autocomplete de produto;
                quem tem o item em tabela própria (imóvel, veículo) recebe texto livre. */}
            {perfil.textoLivre ? (
              <Input label={perfil.interesse} value={form.produto} onChange={(e) => set('produto', e.target.value)} />
            ) : (
              <ProdutoAutocomplete label={perfil.interesse} value={form.produto} onChange={(v) => set('produto', v)} onSelect={(p) => set('produto', p.nome)} />
            )}
            {salvarAqui('produto')}
            {/* Escolher a etapa MOVE o card na hora — não espera "Salvar".
                Trocar o status é uma ação, não a edição de um texto: quem escolhe
                "Negociando" quer que o quadro mostre isso agora. */}
            {funis.length > 1 && funilAtual != null && (
              <Select label="Funil" value={String(funilAtual)} onChange={(e) => mudarFunil(Number(e.target.value))} disabled={trocandoFunil}>
                {funis.map((f) => <option key={f.id} value={String(f.id)}>{f.nome}{f.interno ? ' (interno)' : ''}</option>)}
              </Select>
            )}
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

            {/* Campos personalizados da empresa — só os de módulo ligado. */}
            {card.campos.map((c) => {
              const k = `${c.entidade}.${c.chave}`
              const v = camposForm[k] ?? ''
              const mudar = (valor: string) => setCamposForm((p) => ({ ...p, [k]: valor }))
              const sujo = v !== c.valor
              const campo = c.tipo === 'booleano' ? (
                <Select label={c.rotulo} value={v} onChange={(e) => mudar(e.target.value)}>
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </Select>
              ) : c.tipo === 'opcao' && c.opcoes.length > 0 ? (
                <Select label={c.rotulo} value={v} onChange={(e) => mudar(e.target.value)}>
                  <option value="">—</option>
                  {c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : (
                <Input
                  label={c.rotulo}
                  type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' || c.tipo === 'moeda' ? 'number' : 'text'}
                  value={c.tipo === 'data' ? v.slice(0, 10) : v}
                  placeholder={c.tipo === 'multi' ? 'Separe por vírgula' : undefined}
                  onChange={(e) => mudar(e.target.value)}
                />
              )
              return (
                <div key={k} className="flex flex-col gap-1.5">
                  {campo}
                  {sujo && (
                    <div className="-mt-1 flex items-center gap-2">
                      <Button size="sm" onClick={handleSave} loading={saving}>Salvar</Button>
                      <span className="text-[11px] text-warn">alteração não salva</span>
                    </div>
                  )}
                </div>
              )
            })}

            <EtiquetasPanel negocioId={lead.id} ids={lead.etiqueta_ids ?? []}
              onMudou={(ids) => { onUpdate({ ...lead, etiqueta_ids: ids }); setVersaoHist((v) => v + 1) }} />
            {empresa?.id && <LeadAcoesPanel leadId={lead.id} empresaId={empresa.id} agendaVisitas={perfil.agendaVisitas} />}
            <ResponsavelPanel
              leadId={lead.id}
              usuarios={usuarios}
              responsavel={lead.responsavel_id}
              onChange={(id) => { setForm((f) => ({ ...f, responsavel: id ?? '' })); onUpdate({ ...lead, responsavel_id: id }); setVersaoHist((v) => v + 1) }}
            />
            <HistoricoNegocioPanel negocioId={lead.id} usuarios={usuarios} versao={versaoHist} />
            {/* Painéis próprios, na ordem que o perfil declara. Acrescentar um
                painel não abre mais este arquivo. */}
            <PaineisDaVertical nomes={perfil.paineis} leadId={lead.id} />
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
              {!loadingChat && temAnteriores && (
                <button
                  type="button"
                  onClick={carregarAnteriores}
                  disabled={carregandoAnteriores}
                  className="mx-auto rounded-full border border-line bg-card px-3 py-1 text-[11.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-60"
                >
                  {carregandoAnteriores ? 'Carregando…' : 'Ver mensagens anteriores'}
                </button>
              )}
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
                        <a href={urlDeMidia(m.midiaUrl) ?? undefined} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={urlDeMidia(m.midiaUrl) ?? undefined} alt="Imagem da conversa" className="mb-1 max-h-[240px] w-auto max-w-full rounded-[8px]" />
                        </a>
                      )}
                      {m.midiaUrl && m.tipo === 'video' && (
                        <video src={urlDeMidia(m.midiaUrl) ?? undefined} controls preload="metadata" className="mb-1 max-h-[240px] w-auto max-w-full rounded-[8px]" />
                      )}
                      {m.midiaUrl && m.tipo === 'audio' && (
                        <AudioChat url={urlDeMidia(m.midiaUrl) ?? m.midiaUrl} />
                      )}
                      {/* Midia retirada pela retencao numa mensagem que TEM
                          legenda: o ramo do placeholder la embaixo so cobre a
                          bolha sem texto, e sem isto o anexo sumiria sem
                          deixar rastro no meio da conversa. */}
                      {!m.midiaUrl && m.retidaEm && !ehPlaceholderMidia(m.text)
                        && (m.tipo === 'imagem' || m.tipo === 'video') && (
                        <div className="mb-1">
                          <MidiaAusente placeholder={`[${m.tipo}]`} retidaEm={m.retidaEm} />
                        </div>
                      )}
                      {/* O texto do áudio aparece com ou sem o arquivo: passada
                          a janela de retenção o som some e a transcrição fica. */}
                      {m.tipo === 'audio' && m.transcricao && (
                        <TranscricaoAudio texto={m.transcricao} audioGuardado={!!m.midiaUrl} />
                      )}
                      {/* Documento (PDF de comprovante, nota, boleto): o valor está
                          no NOME e no download, não em prévia. */}
                      {m.midiaUrl && m.tipo === 'documento' && (
                        <a
                          href={urlDeMidia(m.midiaUrl) ?? undefined}
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
                        ? (!m.midiaUrl && <MidiaAusente placeholder={m.text} retidaEm={m.retidaEm} />)
                        : formatarTextoChat(m.text)}
                      {/* Hora à DIREITA, como no WhatsApp — estava à esquerda. */}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-[#667781]">
                        <span>{m.time}</span>
                        {/* Confirmação da Meta: um tique saiu, dois chegou, dois
                            claros foi lido. Falha aparece com o motivo no title. */}
                        {isLoja && m.status && (
                          m.status === 'falhou'
                            ? <span className="text-[10px] text-bad" title={m.erro ?? 'Falha no envio'}>não enviada</span>
                            : m.status === 'falha_envio'
                            // A Meta não respondeu no prazo: pode ter chegado. O botão
                            // reenvia o texto (mídia volta a ser anexada à mão); se a
                            // confirmação da Meta chegar depois, a bolha vira ✓✓ sozinha.
                            ? <span className="inline-flex items-center gap-1.5 text-[10px] text-bad" title={ROTULO_ENTREGA.falha_envio}>
                                <AlertTriangle size={11} strokeWidth={2} aria-hidden />
                                sem confirmação
                                {(!m.tipo || m.tipo === 'texto') && m.text && m.time !== 'agora' && (
                                  <button type="button" onClick={() => sendMsg(m.text)}
                                    className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accent/80">
                                    <RotateCcw size={10} strokeWidth={2} aria-hidden />
                                    Tentar de novo
                                  </button>
                                )}
                              </span>
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
              {!carregandoModelos && <AvisoPagamentoMeta avisos={avisosPagamento} className="mb-3" />}
              {carregandoModelos ? (
                <div className="flex items-center gap-2 py-6 text-[13px] text-ink-3">
                  <Loader2 size={15} className="animate-spin" /> Buscando modelos aprovados…
                </div>
              ) : modelosAprovados.length === 0 ? (
                <div className="py-2 text-[13px] text-ink-2">
                  <p className="font-semibold text-ink">Nenhum modelo aprovado no WhatsApp desta loja.</p>
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

      {/* Fundir com outro contato (classe 2 dos duplicados). Depois da fusão a
          página recarrega no mesmo lead: a conversa e o quadro passam a ter o
          que veio do contato que saiu. */}
      {fundindo && (
        <FundirContatoModal
          contatoId={card.contatoId}
          nomeAtual={form.nome || lead.nome || 'este contato'}
          onClose={() => setFundindo(false)}
          onFundido={() => { window.location.assign(new URL(`/leads?lead=${lead.id}`, window.location.origin).toString()) }}
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
