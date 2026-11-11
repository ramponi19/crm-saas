'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Filter } from 'lucide-react'
import { Button, Select, notify } from '@/components/ui'
import { Lead, Usuario, getKanbanColumns, ganhoColId, type KanbanColumn, type Motivo, type Funil } from './types'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { formatCurrency } from '@/lib/utils'
import { KanbanBoard } from './kanban-board'
import { AutomatizeBarra, AutomatizeEtapa, useAutomatize } from './automatize'
import { LeadModal } from './lead-modal'
import { NewLeadModal } from './new-lead-modal'
import { Topbar } from '@/components/layout/topbar'
import { ScoreConfigProvider } from './score-config-context'
import { EsperandoProvider } from './esperando-contexto'
import { SelecaoProvider } from './selecao-contexto'
import { EscolherEtiqueta, FiltroEtiquetasBotao, aplicarEtiqueta } from '@/components/modules/etiquetas/etiquetas'
import { FILTRO_ETIQUETAS_VAZIO, type Etiqueta, type FiltroEtiquetas } from '@/lib/etiquetas'
import { MAPA_VAZIO, lerEsperando, type MapaEsperando } from '@/lib/esperando'
import { DEFAULT_SCORE_CONFIG, type ScoreConfig } from '@/lib/lead-score'
import type { PerfilDoLead } from '@/lib/empresa-config'
import {
  aberturaDoQuadro, contagensDoQuadro, leadsPorId, maisDaEtapa, ordenarQuadro,
  type Contagens, type FiltrosDoQuadro,
} from '@/lib/quadro'

interface LeadsViewProps {
  usuarios: Usuario[]
  empresaId: number
  /** O que o card do lead mostra além do comum (lib/empresa-config.ts → perfilDoLead). */
  perfil: PerfilDoLead
  /** Etapas vindas de funil_etapas (banco). Fallback = funil padrão. */
  funilEtapas?: KanbanColumn[]
  /** Motivos de perda configurados da empresa (Fase 4.2). */
  motivos?: Motivo[]
  /** Funis da empresa (Fase 4.1). */
  funis?: Funil[]
  /** Config de lead scoring do dono (Sprint 2.3). Fallback = padrão. */
  scoreConfig?: ScoreConfig
  /** Restringe a ver só os próprios leads (sem permissão verLeadsOutros). */
  restringe?: boolean
  /** ID do usuário logado (usado com `restringe`). */
  meuId?: string
  /**
   * Como ESTA empresa chama quem atende. Padrão "Vendedor".
   * Vem de fora porque a palavra é da empresa, não desta tela: o mesmo caminho
   * que o Ranking já usa.
   */
  equipeLabel?: string
  /** Instante (ms) em que o servidor desenhou: base dos tempos relativos no 1º desenho. */
  agora: number
}

/** Lead do quadro: o de sempre, mais o contato (o tempo real acha o lead pela conversa). */
type LeadDoQuadro = Lead & { contato_id?: number }

const SEM_CONTAGENS: Contagens = { etapas: {}, esteira: 0 }

/**
 * O QUADRO DE LEADS (04/11/2026: lê o core, 50 por etapa).
 *
 * Os números do topo e de cada coluna vêm de uma consulta agregada sobre a base
 * inteira (quadro_contagens) — não do que está na tela, que é só o começo de cada
 * coluna. Cada coluna traz 50 e "carrega mais" de 50 em 50.
 */
export function LeadsView({ usuarios, empresaId, perfil, funilEtapas, motivos, funis, scoreConfig = DEFAULT_SCORE_CONFIG, restringe = false, meuId, equipeLabel = 'Vendedor', agora }: LeadsViewProps) {
  const [leads,          setLeads]          = useState<LeadDoQuadro[]>([])
  const [contagens,      setContagens]      = useState<Contagens>(SEM_CONTAGENS)
  /** Quem espera resposta (regra única do banco): os cartões leem daqui. */
  const [esperando,      setEsperando]      = useState<MapaEsperando>(MAPA_VAZIO)
  const [carregando,     setCarregando]     = useState(true)
  const [carregandoMais, setCarregandoMais] = useState<Record<string, boolean>>({})
  const [selectedId,     setSelectedId]     = useState<number | null>(null)
  const [showNewLead,    setShowNewLead]    = useState(false)
  const [sla,            setSla]            = useState({ verde: 15, amarelo: 30, vermelho: 60 })

  /**
   * `/leads?lead=123` abre a conversa daquele lead — direto pelo id: o card busca
   * o próprio lead, então ele abre mesmo fora dos 50 que a coluna mostra.
   * O parâmetro é limpo ao fechar o modal, senão a mesma conversa reabriria a
   * cada re-render e o botão Voltar ficaria preso nela.
   */
  const router = useRouter()
  const params = useSearchParams()
  const leadNaUrl = params.get('lead')

  const funilPadrao = funis?.find(f => f.padrao)?.id ?? funis?.[0]?.id
  const [funilId, setFunilId] = useState<number | undefined>(funilPadrao)
  const [soEsteira, setSoEsteira] = useState(false)
  // Automatize: mostra o que cada etapa faz sozinha (04/11/2026).
  const [automatize, setAutomatize] = useState(false)
  const auto = useAutomatize(funilId, automatize)
  /** '' = toda a equipe. Filtro de quem gerencia a equipe. */
  const [responsavelId, setResponsavelId] = useState('')
  /** Filtro por etiqueta do contato: contém / não contém (11/11/2026). */
  const [filtroEtiquetas, setFiltroEtiquetas] = useState<FiltroEtiquetas>(FILTRO_ETIQUETAS_VAZIO)
  /** Seleção para etiquetar em lote. Nulo = fora do modo (clique abre o lead). */
  const [selecao, setSelecao] = useState<Set<number> | null>(null)
  const [loteOcupado, setLoteOcupado] = useState(false)

  /**
   * O lead do endereço que o usuário não vê (outra loja, arquivado). A tela diz
   * por quê e, para dono e admin, oferece abrir na Rede (lead 1710, 15/10/2026).
   */
  const [foraDaLoja, setForaDaLoja] = useState<string | null>(null)
  const [trocandoLoja, setTrocandoLoja] = useState<'' | 'indo' | 'negado'>('')

  useEffect(() => {
    if (!leadNaUrl) return
    const id = Number(leadNaUrl)
    if (Number.isInteger(id) && id > 0) { setSelectedId(id); setForaDaLoja(null) }
  }, [leadNaUrl])

  /** Passa o CRM para "Rede (todas as lojas)" e abre o lead lá. Só dono e admin. */
  async function abrirNaRede() {
    if (!foraDaLoja) return
    setTrocandoLoja('indo')
    const r = await fetch('/api/filial/selecionar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filialId: null }),
    })
    if (!r.ok) { setTrocandoLoja('negado'); return }
    // Recarga inteira, como o seletor do topo: a loja é lida pela RLS.
    window.location.assign(new URL(`/leads?lead=${foraDaLoja}`, window.location.origin))
  }

  const columns = useMemo(() => {
    const doFunil = (funilEtapas ?? []).filter(c => funilId == null || c.funilId === funilId)
    return doFunil.length > 0 ? doFunil : getKanbanColumns()
  }, [funilEtapas, funilId])

  /**
   * Esteira e responsável são EXCLUSIVOS: esteira é "sem dono", responsável é "o
   * dono é este". Ligar os dois devolveria quadro vazio sempre, e quadro vazio por
   * combinação de filtro parece sistema sem lead. Os botões também se desligam.
   */
  const filtros: FiltrosDoQuadro = useMemo(() => ({
    funilId: funilId ?? null,
    responsavelId: soEsteira ? null : responsavelId || null,
    esteira: soEsteira,
    soMeus: restringe ? meuId ?? null : null,
    etiquetas: filtroEtiquetas,
  }), [funilId, soEsteira, responsavelId, restringe, meuId, filtroEtiquetas])
  const filtrosRef = useRef(filtros)
  useEffect(() => { filtrosRef.current = filtros }, [filtros])

  // ── Carga: contagens (base inteira) + os 50 mais recentes de cada etapa ──
  useEffect(() => {
    let vivo = true
    const db = createClient()
    Promise.all([contagensDoQuadro(db, filtros), aberturaDoQuadro(db, filtros), lerEsperando(db).catch(() => MAPA_VAZIO)])
      .then(([c, l, e]) => { if (vivo) { setContagens(c); setLeads(l); setEsperando(e); setCarregando(false) } })
      .catch((e) => { if (vivo) { setCarregando(false); notify.bad('Não foi possível carregar o funil', (e as Error).message) } })
    return () => { vivo = false }
  }, [filtros])

  /** Contagens de novo, sem pressa (depois de mover, de mensagem nova…). */
  const recontar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pedirRecontagem = useCallback(() => {
    if (recontar.current) clearTimeout(recontar.current)
    recontar.current = setTimeout(() => {
      const db = createClient()
      contagensDoQuadro(db, filtrosRef.current).then(setContagens).catch(() => {})
      // O selo "cliente há X" de cada cartão segue a mesma regra do contador do topo.
      lerEsperando(db).then(setEsperando).catch(() => {})
    }, 600)
  }, [])

  const carregarMais = useCallback(async (etapa: string) => {
    const daEtapa = ordenarQuadro(leads.filter(l => (l.kanban_status ?? 'novo') === etapa))
    const ultimo = daEtapa.at(-1)
    if (!ultimo) return
    setCarregandoMais(p => ({ ...p, [etapa]: true }))
    try {
      const novos = await maisDaEtapa(createClient(), filtros, etapa, ultimo)
      setLeads(prev => {
        const ja = new Set(prev.map(l => l.id))
        return [...prev, ...novos.filter(l => !ja.has(l.id))]
      })
    } catch (e) {
      notify.bad('Não foi possível carregar mais', (e as Error).message)
    } finally {
      setCarregandoMais(p => ({ ...p, [etapa]: false }))
    }
  }, [leads, filtros])

  /** Quantos de cada etapa ainda não estão na tela. */
  const restam = useMemo(() => {
    const naTela: Record<string, number> = {}
    for (const l of leads) { const s = l.kanban_status ?? 'novo'; naTela[s] = (naTela[s] ?? 0) + 1 }
    return Object.fromEntries(columns.map(c => [c.id, Math.max(0, (contagens.etapas[c.id]?.total ?? 0) - (naTela[c.id] ?? 0))]))
  }, [leads, contagens, columns])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'sla_atendimento').maybeSingle()
      .then(({ data }) => {
        if (data?.valor && typeof data.valor === 'object') {
          const v = data.valor as { verde?: number; amarelo?: number; vermelho?: number }
          setSla({ verde: v.verde ?? 15, amarelo: v.amarelo ?? 30, vermelho: v.vermelho ?? 60 })
        }
      })
  }, [empresaId])

  // Os números do topo, da base inteira (quadro_contagens), não dos cartões na tela.
  const stats = useMemo(() => {
    const ganhoId  = ganhoColId(columns)
    const negocIds = columns.filter(c => c.tipo === 'negociacao').map(c => c.id)
    const e = contagens.etapas
    const ativos   = Object.values(e).reduce((s, x) => s + x.total, 0)
    const conv     = e[ganhoId]?.total ?? 0
    const taxa     = ativos > 0 ? Math.round((conv / ativos) * 100) : 0
    const negoc    = negocIds.reduce((s, id) => s + (e[id]?.valor ?? 0), 0)
    const precisam = Object.values(e).reduce((s, x) => s + x.aguardando, 0)
    return { ativos, taxa, negoc, precisam }
  }, [contagens, columns])

  /**
   * TEMPO REAL. Uma mudança em negócio, conversa (mensagem nova, não lidas) ou
   * contato (nome) relê só os leads tocados (quadro_pagina por id), já com os
   * filtros da tela: quem volta entra ou se atualiza no lugar certo; quem não volta
   * saiu do quadro (arquivado, outro funil, outra loja, outro dono). As contagens
   * são pedidas de novo logo depois.
   *
   * Lead sem dono é da esteira e aparece para todos — inclusive para quem só vê os
   * próprios: o filtro do banco já sabe disso (`soMeus`).
   */
  const leadsRef = useRef(leads)
  useEffect(() => { leadsRef.current = leads }, [leads])
  useEffect(() => {
    const supabase = createClient()
    async function reler(ids: number[]) {
      const unicos = [...new Set(ids)].filter(Boolean)
      if (!unicos.length) return
      const voltaram = await leadsPorId(supabase, filtrosRef.current, unicos).catch(() => null)
      if (!voltaram) return
      const porId = new Map(voltaram.map(l => [l.id, l]))
      setLeads(prev => {
        const fora = prev.filter(l => !unicos.includes(l.id))
        const dentro = unicos.map(id => {
          const novo = porId.get(id)
          const antes = prev.find(l => l.id === id)
          return novo ? { ...antes, ...novo } : null
        }).filter(Boolean) as LeadDoQuadro[]
        return [...fora, ...dentro]
      })
      pedirRecontagem()
    }
    const doContato = (contatoId: unknown) =>
      leadsRef.current.filter(l => l.contato_id === contatoId).map(l => l.id)

    const channel = supabase
      .channel('kanban_core')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'negocios' },
        (p: RealtimePostgresChangesPayload<{ id: number }>) => { reler([(p.new as { id: number }).id]) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'negocios' },
        (p: RealtimePostgresChangesPayload<{ id: number }>) => { reler([(p.new as { id: number }).id]) })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'negocios' },
        (p: RealtimePostgresChangesPayload<{ id: number }>) => {
          const id = (p.old as { id: number }).id
          setLeads(prev => prev.filter(x => x.id !== id))
          pedirRecontagem()
        })
      // Mensagem nova e não lidas mexem em `conversas`; o nome, em `contatos`.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' },
        (p: RealtimePostgresChangesPayload<{ contato_id: number }>) => {
          const ids = doContato((p.new as { contato_id?: number })?.contato_id)
          if (ids.length) reler(ids); else pedirRecontagem()
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contatos' },
        (p: RealtimePostgresChangesPayload<{ id: number }>) => { reler(doContato((p.new as { id: number }).id)) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pedirRecontagem])

  /** Do card aberto ou do arraste: o lead muda na tela na hora; as contagens, logo depois. */
  function handleLeadUpdate(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
    pedirRecontagem()
  }

  /** Clique no cartão: no modo de seleção marca/desmarca; fora dele, abre o lead. */
  function clicarNoCartao(l: Lead) {
    if (!selecao) { setSelectedId(l.id); return }
    setSelecao(prev => {
      const s = new Set(prev ?? [])
      if (s.has(l.id)) s.delete(l.id); else s.add(l.id)
      return s
    })
  }

  /** Etiquetar / tirar a etiqueta dos cartões selecionados (o banco grava o histórico). */
  async function etiquetarLote(e: Etiqueta, aplicar: boolean) {
    const ids = [...(selecao ?? [])]
    if (!ids.length) { notify.bad('Selecione pelo menos um lead'); return }
    setLoteOcupado(true)
    const r = await aplicarEtiqueta(ids, e.id, aplicar)
    setLoteOcupado(false)
    if (!r.ok) { notify.bad('Não foi possível etiquetar', r.erro); return }
    // Na tela na hora: a etiqueta é do contato, então vale para todo cartão dele.
    const contatos = new Set(r.contatos)
    setLeads(prev => prev.map(l => {
      if (l.contato_id == null || !contatos.has(l.contato_id)) return l
      const atual = l.etiqueta_ids ?? []
      return { ...l, etiqueta_ids: aplicar ? [...new Set([...atual, e.id])].sort((a, b) => a - b) : atual.filter(x => x !== e.id) }
    }))
    const fora = r.pedidos - r.alcancados
    notify.ok(`${aplicar ? 'Etiqueta aplicada' : 'Etiqueta tirada'}: ${e.nome}`,
      `${r.contatos.length} contato${r.contatos.length === 1 ? '' : 's'} mudaram${fora > 0 ? ` · ${fora} lead${fora === 1 ? '' : 's'} fora do seu alcance` : ''}`)
    setSelecao(null)
    // Com filtro de etiqueta ligado, quem deixou de passar sai da coluna.
    if (filtroEtiquetas.com.length || filtroEtiquetas.sem.length) { setCarregando(true); setFiltroEtiquetas(f => ({ ...f })) }
    pedirRecontagem()
  }

  function handleLeadCreate(created: Lead) {
    setLeads(prev => [created, ...prev])
    setShowNewLead(false)
    pedirRecontagem()
  }

  const fmtK = (v: number) =>
    v >= 1000
      ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')}k`
      : formatCurrency(v)

  return (
    <ScoreConfigProvider value={scoreConfig}>
    <EsperandoProvider value={esperando}>
    <SelecaoProvider value={selecao}>
    <div className="flex flex-col h-full min-h-0">

      <Topbar title="Leads" />

      {/* Header — subtítulo de stats + ação (o título "Leads" vem do Topbar) */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          {funis && funis.length > 1 && (
            <div className="flex w-max max-w-full items-center gap-0.5 overflow-x-auto rounded-control border border-line bg-card p-0.5">
              {funis.map(f => {
                const ativo = f.id === funilId
                return (
                  <button
                    key={f.id}
                    onClick={() => { if (f.id !== funilId) { setCarregando(true); setFunilId(f.id) } }}
                    className={`whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${ativo ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink/[0.04]'}`}
                  >
                    {f.nome}
                  </button>
                )
              })}
            </div>
          )}
          {/*
            Filtro por corretor — só para quem pode ver o lead do colega.
            NÃO condicionar a "ter mais de um corretor": recurso que aparece sozinho
            quando o segundo usuário entra é recurso que ninguém descobre.
          */}
          {!restringe && (
            <div className="flex items-center gap-1.5">
              <Filter size={15} strokeWidth={1.8} className="shrink-0 text-ink-3" />
              <Select
                aria-label={`Filtrar por ${equipeLabel.toLowerCase()}`}
                value={responsavelId}
                onChange={e => { setCarregando(true); setResponsavelId(e.target.value); if (e.target.value) setSoEsteira(false) }}
                className="min-w-[190px]"
              >
                {/* "Toda a equipe": a lista tem o dono e os admins também. */}
                <option value="">Toda a equipe</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || 'Sem nome'}</option>)}
              </Select>
            </div>
          )}
          <button
            onClick={() => { setCarregando(true); setSoEsteira(v => !v); setResponsavelId('') }}
            className={`whitespace-nowrap rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${soEsteira ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-card text-ink-2 hover:text-ink'}`}
          >
            Esteira{contagens.esteira > 0 ? ` (${contagens.esteira})` : ''}
          </button>
          <FiltroEtiquetasBotao valor={filtroEtiquetas} onChange={(f) => { setCarregando(true); setFiltroEtiquetas(f) }} />
          <button
            data-selecionar-cartoes
            onClick={() => setSelecao(s => s ? null : new Set())}
            aria-pressed={!!selecao}
            className={`whitespace-nowrap rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${selecao ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-2 hover:text-ink'}`}
          >
            Selecionar
          </button>
          <button
            onClick={() => setAutomatize((v) => !v)}
            aria-pressed={automatize}
            className={`whitespace-nowrap rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${automatize ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-2 hover:text-ink'}`}
          >
            Automatize
          </button>
          <div className="num text-[13px] text-ink-2">
            {stats.ativos} em aberto
            {' · '}<span className="font-semibold text-ink">{fmtK(stats.negoc)}</span> em negociação
            {' · '}conversão {stats.taxa}%
            {stats.precisam > 0 && (
              <span className="font-semibold text-bad" title="Última mensagem do cliente nas últimas 72 h, sem resposta da loja (a mesma regra do ZapIntel, da Comunicação e do Assistente)"> · {stats.precisam} esperando resposta</span>
            )}
          </div>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setShowNewLead(true)}>
          Novo lead
        </Button>
      </div>

      {foraDaLoja && (
        <div className="mx-6 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-ink-2">
          <span className="flex-1 min-w-[220px]">
            O lead #{foraDaLoja} não está na loja selecionada no topo — ou foi arquivado.
            {trocandoLoja === 'negado' && <strong className="text-ink"> Só o dono ou um admin troca de loja.</strong>}
          </span>
          {trocandoLoja !== 'negado' && (
            <Button size="sm" variant="outline" loading={trocandoLoja === 'indo'} onClick={abrirNaRede}>
              {trocandoLoja === 'indo' ? 'Abrindo…' : 'Abrir na Rede (todas as lojas)'}
            </Button>
          )}
          <button className="text-ink-3 hover:text-ink" onClick={() => { setForaDaLoja(null); setTrocandoLoja('') }}>Fechar</button>
        </div>
      )}

      {selecao && (
        <div data-barra-lote className="mx-6 mb-2 flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] text-ink-2">
          <span className="num font-semibold text-ink">{selecao.size} selecionado{selecao.size === 1 ? '' : 's'}</span>
          <span className="text-ink-3">Clique nos cartões para marcar.</span>
          <button type="button" className="font-medium text-accent hover:underline"
            onClick={() => setSelecao(new Set(leads.map(l => l.id)))}>
            Marcar os {leads.length} da tela
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <EscolherEtiqueta rotulo="Etiquetar" alinhar="direita" desabilitado={loteOcupado || selecao.size === 0} onEscolher={(e) => etiquetarLote(e, true)} />
            <EscolherEtiqueta rotulo="Tirar etiqueta" alinhar="direita" desabilitado={loteOcupado || selecao.size === 0} onEscolher={(e) => etiquetarLote(e, false)} />
            <Button size="sm" variant="ghost" onClick={() => setSelecao(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {automatize && <AutomatizeBarra dados={auto.dados} recarregar={auto.recarregar} />}

      {/* Kanban */}
      <div className={`flex-1 min-h-0 overflow-hidden transition-opacity ${carregando ? 'opacity-50' : ''}`}>
        <KanbanBoard
          leads={leads}
          usuarios={usuarios}
          columns={columns}
          onLeadClick={clicarNoCartao}
          onLeadUpdate={handleLeadUpdate}
          sla={sla}
          motivos={motivos}
          agora={agora}
          contagens={contagens.etapas}
          restam={restam}
          carregandoMais={carregandoMais}
          onCarregarMais={carregarMais}
          rodapeDaColuna={automatize && auto.dados
            ? (etapa, label) => <AutomatizeEtapa slug={etapa} label={label} dados={auto.dados!} recarregar={auto.recarregar} />
            : undefined}
        />
      </div>

      {/* Modais */}
      {selectedId != null && (
        <LeadModal
          key={selectedId}
          leadId={selectedId}
          usuarios={usuarios}
          columns={columns}
          perfil={perfil}
          // Sem esta lista o modal de perda abriria vazio ("nenhum motivo
          // cadastrado") justamente onde agora se marca Perdido.
          motivos={motivos}
          onClose={() => { setSelectedId(null); if (leadNaUrl) router.replace('/leads') }}
          onNaoEncontrado={() => {
            if (leadNaUrl) { setForaDaLoja(leadNaUrl); router.replace('/leads') }
            setSelectedId(null)
          }}
          onUpdate={handleLeadUpdate}
        />
      )}
      {showNewLead && (
        <NewLeadModal
          usuarios={usuarios}
          columns={columns}
          funilId={funilId}
          onClose={() => setShowNewLead(false)}
          onCreate={handleLeadCreate}
        />
      )}
    </div>
    </SelecaoProvider>
    </EsperandoProvider>
    </ScoreConfigProvider>
  )
}
