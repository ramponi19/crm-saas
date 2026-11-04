'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Instagram, Loader2, MessageCircle, MessagesSquare, Search, Facebook, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useTempoReal, type EventoTR } from '@/components/layout/tempo-real-empresa'
import {
  CANAIS, aguardandoResposta, lerCanais, lerConversa, listarConversas,
  type CanalInbox, type CanalTipo, type ConversaInbox, type Cursor, type FiltrosInbox,
} from '@/lib/inbox/consultas'
import type { KanbanColumn, Motivo, Usuario } from '@/components/modules/leads/types'
import type { PerfilDoLead } from '@/lib/empresa-config'
import { ConversaPainel } from './conversa-painel'

export type EtapaDoCard = KanbanColumn

export interface InboxProps {
  empresaId: number
  meuId: string
  usuarios: Usuario[]
  etapas: EtapaDoCard[]
  funilPadrao: number | null
  motivos: Motivo[]
  perfil: PerfilDoLead
}

/** Última mensagem de cada conversa da página, para a prévia da lista. */
type Previa = { conteudo: string | null; direcao: string; tipo: string | null }

export const ICONE_CANAL: Record<CanalTipo, typeof MessageCircle> = {
  whatsapp: MessageCircle, instagram: Instagram, messenger: Facebook,
}

export function nomeDoContato(c: ConversaInbox['contato']): string {
  if (!c) return 'Contato'
  return c.nome?.trim() || c.telefone || (c.instagram ? `@${c.instagram}` : 'Contato sem nome')
}

export function horaCurta(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function previaDoTexto(p: Previa | undefined): string {
  if (!p) return ''
  const t = p.tipo === 'anuncio' ? 'Veio de anúncio'
    : p.tipo && p.tipo !== 'texto' ? `[${p.tipo}]` : (p.conteudo ?? '')
  return (p.direcao === 'enviada' ? 'Você: ' : '') + t.replace(/\s+/g, ' ').slice(0, 90)
}

/** A conversa entra/sai da lista por conta própria? Só os filtros que dá para conferir aqui. */
function passaNosFiltrosLocais(c: ConversaInbox, f: FiltrosInbox): boolean {
  if (f.canal && c.canal?.tipo !== f.canal) return false
  if (f.naoLidas && !(c.nao_lidas > 0)) return false
  if (f.aguardando && !aguardandoResposta(c)) return false
  return true
}

function lerFiltrosDaUrl(p: URLSearchParams): FiltrosInbox {
  const canal = p.get('canal')
  const filtro = p.get('filtro')
  return {
    canal: CANAIS.some((c) => c.tipo === canal) ? (canal as CanalTipo) : null,
    naoLidas: filtro === 'nao_lidas',
    aguardando: filtro === 'aguardando',
    responsavel: p.get('resp'),
    busca: p.get('q') ?? '',
  }
}

/**
 * A INBOX ÚNICA (04/11/2026). Lista de conversas de todos os canais numa coluna,
 * a conversa aberta ao lado. Filtros na URL (canal, não lidas/aguardando,
 * responsável, busca) e a conversa aberta em `?c=`. O tempo real vem do hub da
 * aba (uma assinatura só, tempo-real-empresa.tsx).
 */
export function InboxView(props: InboxProps) {
  const { usuarios, meuId } = props
  const params = useSearchParams()
  const [filtros, setFiltros] = useState<FiltrosInbox>(() => lerFiltrosDaUrl(new URLSearchParams(params.toString())))
  const [busca, setBusca] = useState(filtros.busca)
  const [aberta, setAberta] = useState<number | null>(() => Number(params.get('c')) || null)
  const [canais, setCanais] = useState<CanalInbox[] | null>(null)
  const [lista, setLista] = useState<ConversaInbox[]>([])
  const [previas, setPrevias] = useState<Record<number, Previa>>({})
  const [proximo, setProximo] = useState<Cursor | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const geracao = useRef(0)
  const { assinar, aoReconectar } = useTempoReal()
  const supabase = useMemo(() => createClient(), [])

  // A URL acompanha filtros e conversa aberta (sem navegar: só troca o endereço).
  useEffect(() => {
    const p = new URLSearchParams()
    if (filtros.canal) p.set('canal', filtros.canal)
    if (filtros.naoLidas) p.set('filtro', 'nao_lidas')
    else if (filtros.aguardando) p.set('filtro', 'aguardando')
    if (filtros.responsavel) p.set('resp', filtros.responsavel)
    if (filtros.busca) p.set('q', filtros.busca)
    if (aberta) p.set('c', String(aberta))
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `/comunicacao?${qs}` : '/comunicacao')
  }, [filtros, aberta])

  // Busca com pausa: não consulta a cada letra.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.busca === busca.trim() ? f : { ...f, busca: busca.trim() })), 350)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => { lerCanais(supabase).then(setCanais) }, [supabase])

  const lerPrevias = useCallback(async (itens: ConversaInbox[]) => {
    const comMomento = itens.filter((c) => c.ultima_mensagem_at)
    if (!comMomento.length) return
    // A última mensagem é a de created_at = ultima_mensagem_at (o gatilho grava o maior).
    const { data } = await supabase.from('mensagens').select('conversa_id, conteudo, direcao, tipo, created_at')
      .in('conversa_id', comMomento.map((c) => c.id))
      .in('created_at', [...new Set(comMomento.map((c) => c.ultima_mensagem_at as string))])
    const novas: Record<number, Previa> = {}
    for (const m of (data ?? []) as (Previa & { conversa_id: number; created_at: string })[]) {
      const c = comMomento.find((x) => x.id === m.conversa_id)
      if (c && new Date(c.ultima_mensagem_at as string).getTime() === new Date(m.created_at).getTime()) {
        novas[m.conversa_id] = { conteudo: m.conteudo, direcao: m.direcao, tipo: m.tipo }
      }
    }
    setPrevias((p) => ({ ...p, ...novas }))
  }, [supabase])

  /** Sobe quando o canal da aba cai e volta: a lista é relida. */
  const [recarga, setRecarga] = useState(0)

  // Primeira página: a cada filtro, e de novo depois de uma reconexão. Só a carga
  // mais recente escreve (`geracao`): resposta atrasada de filtro velho é ignorada.
  useEffect(() => {
    if (!canais) return
    const minha = ++geracao.current
    listarConversas(supabase, filtros, canais, null)
      .then((r) => {
        if (minha !== geracao.current) return
        setLista(r.itens); setProximo(r.proximo); setErro(null)
        lerPrevias(r.itens)
      })
      .catch((e) => { if (minha === geracao.current) setErro((e as Error).message) })
      .finally(() => { if (minha === geracao.current) setCarregando(false) })
  }, [filtros, canais, recarga, supabase, lerPrevias])

  function mudarFiltros(f: Partial<FiltrosInbox>) {
    setCarregando(true)
    setFiltros((atual) => ({ ...atual, ...f }))
  }

  async function carregarMais() {
    if (!proximo || !canais) return
    setCarregandoMais(true)
    const minha = geracao.current
    try {
      const r = await listarConversas(supabase, filtros, canais, proximo)
      if (minha !== geracao.current) return
      setLista((l) => {
        const vistos = new Set(l.map((c) => c.id))
        return [...l, ...r.itens.filter((c) => !vistos.has(c.id))]
      })
      setProximo(r.proximo)
      lerPrevias(r.itens)
    } finally {
      setCarregandoMais(false)
    }
  }

  // ── Tempo real: a lista se mexe sozinha ──────────────────────────────────
  const filtrosRef = useRef(filtros)
  useEffect(() => { filtrosRef.current = filtros }, [filtros])
  const listaRef = useRef(lista)
  useEffect(() => { listaRef.current = lista }, [lista])
  const abertaRef = useRef(aberta)
  useEffect(() => { abertaRef.current = aberta }, [aberta])

  useEffect(() => assinar(async (e: EventoTR) => {
    if (e.tabela === 'mensagens' && e.tipo === 'INSERT' && e.novo.conversa_id != null) {
      const m = e.novo
      setPrevias((p) => ({ ...p, [m.conversa_id as number]: { conteudo: m.conteudo, direcao: m.direcao, tipo: m.tipo } }))
      return
    }
    if (e.tabela !== 'conversas') return
    if (e.tipo === 'DELETE') {
      const id = e.antigo?.id
      if (id != null) setLista((l) => l.filter((c) => c.id !== id))
      return
    }
    const n = e.novo
    if (!n) return
    const f = filtrosRef.current
    const naLista = listaRef.current.find((c) => c.id === n.id)
    if (naLista) {
      const atualizada: ConversaInbox = { ...naLista, ...(n as Partial<ConversaInbox>), contato: naLista.contato, canal: naLista.canal }
      setLista((l) => {
        const resto = l.filter((c) => c.id !== n.id)
        // Saiu do filtro (ex.: lida no filtro "não lidas")? Fica até a próxima carga se for a aberta.
        if (!passaNosFiltrosLocais(atualizada, f) && n.id !== abertaRef.current) return resto
        return ordenar([atualizada, ...resto])
      })
      return
    }
    // Conversa nova (ou que voltou a mexer) que não está na tela: entra no topo se cabe nos filtros.
    // Busca e responsável não dá para conferir aqui: nesses casos, só na próxima carga.
    if (f.busca || f.responsavel) return
    const topo = listaRef.current[0]?.ultima_mensagem_at
    if (topo && n.ultima_mensagem_at && ms(n.ultima_mensagem_at) < ms(topo) && listaRef.current.length >= 10) return
    const completa = await lerConversa(supabase, n.id)
    if (!completa || !passaNosFiltrosLocais(completa, f)) return
    setLista((l) => (l.some((c) => c.id === completa.id) ? l : ordenar([completa, ...l])))
  }), [assinar, supabase])

  // Caiu e voltou: recarrega a página atual da lista.
  useEffect(() => aoReconectar(() => setRecarga((n) => n + 1)), [aoReconectar])

  const conversaAberta = lista.find((c) => c.id === aberta) ?? null

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-bg">
      {/* Coluna das conversas */}
      <section className={cn(
        'flex min-h-0 w-full flex-col border-r border-line-soft bg-card md:w-[380px] md:flex-none',
        aberta ? 'hidden md:flex' : 'flex',
      )}>
        <div className="flex flex-col gap-2 border-b border-line-soft p-3">
          <label className="flex items-center gap-2 rounded-control border border-line bg-card px-2.5 py-1.5 text-[13px] focus-within:border-ink/30">
            <Search size={15} strokeWidth={1.7} className="text-ink-3" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou @instagram"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            <Chip ativo={!filtros.canal} onClick={() => mudarFiltros({ canal: null })}>Todos</Chip>
            {CANAIS.map((c) => {
              const Icone = ICONE_CANAL[c.tipo]
              return (
                <Chip key={c.tipo} ativo={filtros.canal === c.tipo} onClick={() => mudarFiltros({ canal: filtros.canal === c.tipo ? null : c.tipo })}>
                  <Icone size={12} strokeWidth={1.8} /> {c.nome}
                </Chip>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            <Select
              aria-label="Situação"
              value={filtros.naoLidas ? 'nao_lidas' : filtros.aguardando ? 'aguardando' : ''}
              onChange={(e) => mudarFiltros({ naoLidas: e.target.value === 'nao_lidas', aguardando: e.target.value === 'aguardando' })}
              className="h-8 flex-1 text-[12px]"
            >
              <option value="">Todas as conversas</option>
              <option value="nao_lidas">Não lidas</option>
              <option value="aguardando">Aguardando resposta</option>
            </Select>
            <Select
              aria-label="Responsável"
              value={filtros.responsavel ?? ''}
              onChange={(e) => mudarFiltros({ responsavel: e.target.value || null })}
              className="h-8 flex-1 text-[12px]"
            >
              <option value="">Qualquer responsável</option>
              <option value={meuId}>Meus</option>
              <option value="nenhum">Sem responsável</option>
              {usuarios.filter((u) => u.id !== meuId).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin" data-lista-conversas>
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-3"><Loader2 size={15} className="animate-spin" /> Carregando conversas…</div>
          ) : erro ? (
            <div className="px-5 py-8 text-center text-[13px] text-bad">Não foi possível carregar: {erro}</div>
          ) : lista.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-ink-3">
              {filtros.busca || filtros.canal || filtros.naoLidas || filtros.aguardando || filtros.responsavel
                ? 'Nenhuma conversa com esses filtros.'
                : 'Nenhuma conversa nesta loja ainda.'}
            </div>
          ) : (
            <>
              {lista.map((c) => {
                const Icone = c.canal ? ICONE_CANAL[c.canal.tipo] : History
                const naoLidas = c.nao_lidas > 0
                return (
                  <button
                    key={c.id}
                    data-conversa-id={c.id}
                    onClick={() => setAberta(c.id)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-line-soft px-3.5 py-3 text-left transition-colors',
                      aberta === c.id ? 'bg-accent-soft/60' : 'hover:bg-raised',
                    )}
                  >
                    <span className={cn('mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full text-[13px] font-semibold',
                      naoLidas ? 'bg-accent text-white' : 'bg-ink/[0.06] text-ink-2')}>
                      {nomeDoContato(c.contato).trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('truncate text-[13.5px]', naoLidas ? 'font-semibold text-ink' : 'font-medium text-ink')}>{nomeDoContato(c.contato)}</span>
                        <span className="ml-auto flex-none text-[11px] text-ink-3">{horaCurta(c.ultima_mensagem_at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <Icone size={12} strokeWidth={1.8} className="flex-none text-ink-3" aria-label={c.canal ? c.canal.tipo : 'anterior aos canais'} />
                        <span className={cn('truncate text-[12px]', naoLidas ? 'text-ink-2' : 'text-ink-3')}>
                          {previaDoTexto(previas[c.id]) || (c.canal ? '' : 'Conversa anterior aos canais')}
                        </span>
                        {naoLidas && (
                          <span className="num ml-auto flex-none rounded-full bg-accent px-1.5 text-[10px] font-bold text-white" data-nao-lidas={c.nao_lidas}>
                            {c.nao_lidas > 99 ? '99+' : c.nao_lidas}
                          </span>
                        )}
                        {!naoLidas && aguardandoResposta(c) && (
                          <span className="ml-auto flex-none text-[10.5px] font-medium text-warn">aguardando</span>
                        )}
                      </span>
                    </span>
                  </button>
                )
              })}
              {proximo && (
                <div className="p-3">
                  <Button variant="outline" size="sm" className="w-full" loading={carregandoMais} onClick={carregarMais}>Carregar mais</Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Conversa aberta */}
      <section className={cn('min-h-0 min-w-0 flex-1 flex-col', aberta ? 'flex' : 'hidden md:flex')}>
        {aberta ? (
          <ConversaPainel
            key={aberta}
            conversaId={aberta}
            inicial={conversaAberta}
            {...props}
            onVoltar={() => setAberta(null)}
            onAbrirConversa={(id) => setAberta(id)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[13px] text-ink-3">
            <MessagesSquare size={28} strokeWidth={1.4} />
            Escolha uma conversa.
          </div>
        )}
      </section>
    </main>
  )
}

/** Data como número: o Realtime e o PostgREST escrevem o mesmo instante em formatos diferentes. */
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0)

function ordenar(l: ConversaInbox[]): ConversaInbox[] {
  return [...l].sort((a, b) => ms(b.ultima_mensagem_at) - ms(a.ultima_mensagem_at) || b.id - a.id)
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
        ativo ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:bg-bg',
      )}
    >
      {children}
    </button>
  )
}
