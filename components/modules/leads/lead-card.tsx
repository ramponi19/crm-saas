'use client'

import { useSyncExternalStore } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Lead, Usuario } from './types'
import { formatCurrency } from '@/lib/utils'
import { calcularScore } from '@/lib/lead-score'
import { aguardandoResposta } from '@/lib/esteira'
import { useScoreConfig } from './score-config-context'
import { useEsperando } from './esperando-contexto'
import { assinarRelogio, instanteDoRelogio } from './relogio'
import { OrigemIcon } from '@/components/modules/conversa/canal-icone'
import { EtiquetasDoContato } from '@/components/modules/etiquetas/etiquetas'
import { useSelecao } from './selecao-contexto'
import { Check } from 'lucide-react'

const TIER_CHIP: Record<string, { label: string; cls: string }> = {
  quente: { label: 'Quente', cls: 'bg-accent-soft text-accent' },
  morno: { label: 'Morno', cls: 'bg-warn-soft text-warn' },
  frio: { label: 'Frio', cls: 'bg-ink/[0.06] text-ink-3' },
}

interface LeadCardProps {
  lead: Lead
  usuarios: Usuario[]
  onClick: () => void
  isDragging?: boolean
  /** Cor (hex) da etapa — usada só como dado, no dot da coluna. */
  barColor?: string
  sla?: { verde: number; amarelo: number; vermelho: number }
  /** Instante do 1º desenho (o mesmo no servidor e no navegador). Sem ele, o relógio do navegador. */
  agora?: number
}

const getInitials = (nome: string) => nome.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()

const CANAL_FALLBACK: Record<string, string> = {
  whatsapp: 'Contato do WhatsApp', instagram: 'Contato do Instagram',
  messenger: 'Contato do Messenger', manual: 'Novo contato',
}

const DEFAULT_SLA = { verde: 15, amarelo: 30, vermelho: 60 }
type SlaTone = 'ok' | 'warn' | 'bad' | 'neutro'

function getSlaTone(date: string | null, agora: number, sla = DEFAULT_SLA): SlaTone {
  if (!date) return 'neutro'
  const min = (agora - new Date(date).getTime()) / 60_000
  if (min < sla.verde) return 'ok'
  if (min < sla.amarelo) return 'warn'
  return 'bad' // lead esfriando
}
const SLA_CLASS: Record<SlaTone, string> = {
  ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutro: 'text-ink-3',
}

/**
 * Desde quando ESTE lead está esperando resposta — null quando não está.
 *
 * O relógio contava desde a última mensagem qualquer, inclusive a resposta do
 * próprio vendedor: ele respondia e o cartão continuava cobrando. Aqui vale a
 * mesma regra da esteira (`marcoDeCobranca`): só o cliente falando por último
 * gera dívida. Respondeu, o relógio zera e sai da tela.
 */
function aguardandoDesde(lead: { ultima_recebida_at?: string | null; ultima_enviada_at?: string | null }): string | null {
  return aguardandoResposta(lead) ? lead.ultima_recebida_at ?? null : null
}

/** "agora", "há 5 min", "há 3h", "há 2 dias" — para "cliente há X" e "você respondeu há Y". */
function haQuanto(date: string | null | undefined, agora: number): string {
  if (!date) return ''
  const min = Math.floor((agora - new Date(date).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d} ${d > 1 ? 'dias' : 'dia'}`
}

export function LeadCard({ lead, usuarios, onClick, isDragging = false, sla, agora: agoraInicial }: LeadCardProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: lead.id, data: { leadId: lead.id } })

  const style = { transform: CSS.Transform.toString(transform), transition }

  const responsavel = usuarios.find((u) => u.id === lead.responsavel_id)
  const temMsgs = (lead.msgs_nao_lidas ?? 0) > 0
  // A regra única do banco quando o quadro a fornece; fora do quadro, a comparação de antes.
  const mapaEsperando = useEsperando()
  const esperandoDesde = mapaEsperando ? (mapaEsperando.porNegocio.get(lead.id) ?? null) : aguardandoDesde(lead)
  const scoreCfg = useScoreConfig()

  /**
   * Tudo o que depende do relógio, num texto só: o cartão se redesenha apenas
   * quando ele muda — não a cada tique. No servidor e na hidratação vale o
   * instante do servidor (o 1º desenho sai igual nos dois lados); depois, o
   * relógio compartilhado da página (./relogio).
   */
  const doTempo = (agora: number) => {
    const { score, tier } = calcularScore(lead, scoreCfg, agora)
    return `${getSlaTone(esperandoDesde, agora, sla)}|${score}|${tier}|${haQuanto(lead.ultima_recebida_at, agora)}|${haQuanto(lead.ultima_enviada_at, agora)}`
  }
  const [tom, scoreTxt, tier, cliente, voce] = useSyncExternalStore(
    assinarRelogio,
    () => doTempo(instanteDoRelogio(agoraInicial)),
    () => doTempo(agoraInicial ?? instanteDoRelogio()),
  ).split('|')
  const slaTone = tom as SlaTone
  const score = Number(scoreTxt)
  const chip = TIER_CHIP[tier]
  // Modo de seleção do quadro (etiquetar em lote): o clique marca o cartão em vez de abrir.
  const selecao = useSelecao()
  const selecionado = !!selecao?.has(lead.id)

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} data-lead-id={lead.id}
      data-selecionado={selecao ? String(selecionado) : undefined} className="cursor-grab select-none active:cursor-grabbing">
      <div
        className={`rounded-[10px] border bg-card p-3 transition-all hover:border-accent hover:shadow-[0_4px_12px_-6px_rgba(46,92,230,0.25)] ${selecionado ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}
        style={{ opacity: isSortableDragging || isDragging ? 0.4 : 1 }}
      >
        {/* Nome + origem + valor */}
        <div className="flex items-center gap-2">
          {selecao && (
            <span aria-hidden className={`grid h-4 w-4 flex-none place-items-center rounded border ${selecionado ? 'border-accent bg-accent text-white' : 'border-line bg-card'}`}>
              {selecionado && <Check size={11} strokeWidth={2.4} />}
            </span>
          )}
          <OrigemIcon origem={lead.origem ?? 'manual'} size={16} />
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${lead.nome ? 'font-semibold text-ink' : 'font-medium text-ink-3'}`}>
            {lead.nome || CANAL_FALLBACK[lead.origem ?? 'manual'] || 'Novo contato'}
          </span>
          {lead.valor_estimado ? (
            <span className="num flex-none text-[12px] font-semibold text-ink-2">{formatCurrency(lead.valor_estimado)}</span>
          ) : null}
        </div>

        {/* Produto */}
        <div className="mt-1 mb-2.5 truncate text-[11px] text-ink-3">
          {lead.produto_interessado || 'Sem produto definido'}
        </div>

        {/* Etiquetas do contato (11/11/2026) */}
        <EtiquetasDoContato ids={lead.etiqueta_ids} className="-mt-1 mb-2" />

        {/* Rodapé: (avatar + tier) à esquerda · (não-lidas + SLA) à direita */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {responsavel ? (
              <span title={responsavel.nome} className="grid h-[19px] w-[19px] flex-none place-items-center rounded-full bg-ink text-[8px] font-bold text-white">
                {getInitials(responsavel.nome)}
              </span>
            ) : (
              <span title="Na esteira — sem dono" className="grid h-[19px] w-[19px] flex-none place-items-center rounded-full border border-dashed border-warn/60 text-[8px] font-bold text-warn">?</span>
            )}
            <span title={`Score ${score}/100`} className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${chip.cls}`}>{chip.label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {temMsgs && (
              <span title={`${lead.msgs_nao_lidas} nova(s) mensagem(ns)`} className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {(lead.msgs_nao_lidas ?? 0) > 99 ? '99+' : lead.msgs_nao_lidas}
              </span>
            )}
          </div>
        </div>

        {/*
          * O QUE ORDENA O CARTÃO, À VISTA (06/11/2026): o quadro sobe pela última mensagem
          * do cliente; "você respondeu" não mexe na posição. Esperando resposta, o
          * "cliente há X" ganha a cor do SLA (como o relógio de antes).
          */}
        {(cliente || voce) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10px] leading-tight">
            {cliente && (
              <span data-tempo="cliente" title={esperandoDesde ? 'Cliente esperando resposta' : 'Última mensagem do cliente'}
                className={esperandoDesde ? `whitespace-nowrap font-semibold ${SLA_CLASS[slaTone]}` : 'whitespace-nowrap text-ink-3'}>
                cliente {cliente}
              </span>
            )}
            {voce && <span data-tempo="voce" className="whitespace-nowrap text-ink-3">{cliente ? '· ' : ''}você respondeu {voce}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
