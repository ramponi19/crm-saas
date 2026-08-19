'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus, Filter } from 'lucide-react'
import { Button, Select } from '@/components/ui'
import { Lead, Usuario, getKanbanColumns, ganhoColId, type KanbanColumn, type Motivo, type Funil } from './types'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { formatCurrency } from '@/lib/utils'
import { KanbanBoard } from './kanban-board'
import { LeadModal } from './lead-modal'
import { NewLeadModal } from './new-lead-modal'
import { Topbar } from '@/components/layout/topbar'
import { ScoreConfigProvider } from './score-config-context'
import { DEFAULT_SCORE_CONFIG, type ScoreConfig } from '@/lib/lead-score'

interface LeadsViewProps {
  initialLeads: Lead[]
  usuarios: Usuario[]
  empresaId: number
  segmento?: string | null
  /** Etapas vindas de funil_etapas (banco). Fallback = constante do segmento. */
  funilEtapas?: KanbanColumn[]
  /** Motivos de perda configurados da empresa (Fase 4.2). */
  motivos?: Motivo[]
  /** Funis da empresa (Fase 4.1). */
  funis?: Funil[]
  /** Config de lead scoring do dono (Sprint 2.3). Fallback = padrão. */
  scoreConfig?: ScoreConfig
  /** Restringe a ver só os próprios leads (sem permissão verLeadsOutros). */
  restringe?: boolean
  /** ID do usuário logado (usado com `restringe` no realtime). */
  meuId?: string
}

/**
 * Mais recente no topo — a mesma ordem que o servidor manda na carga inicial
 * (`ultima_mensagem_at desc`).
 *
 * Precisa ser reaplicada a cada mudança em tempo real: o realtime alterava a
 * data do lead NO LUGAR, então quem acabava de escrever continuava no fim da
 * coluna. Lead sem mensagem nenhuma cai para o fim, ordenado pela criação.
 */
function porMensagemRecente(leads: Lead[]): Lead[] {
  const quando = (l: Lead) => new Date(l.ultima_mensagem_at ?? l.created_at ?? 0).getTime()
  return [...leads].sort((a, b) => quando(b) - quando(a))
}

export function LeadsView({ initialLeads, usuarios, empresaId, segmento, funilEtapas, motivos, funis, scoreConfig = DEFAULT_SCORE_CONFIG, restringe = false, meuId }: LeadsViewProps) {
  const [leads,          setLeads]          = useState<Lead[]>(initialLeads)
  const [selectedLead,   setSelectedLead]   = useState<Lead | null>(null)
  const [showNewLead,    setShowNewLead]    = useState(false)
  const [sla,            setSla]            = useState({ verde: 15, amarelo: 30, vermelho: 60 })

  const funilPadrao = funis?.find(f => f.padrao)?.id ?? funis?.[0]?.id
  const [funilId, setFunilId] = useState<number | undefined>(funilPadrao)
  const [soEsteira, setSoEsteira] = useState(false)
  /** '' = todos os corretores. Filtro de quem gerencia a equipe. */
  const [corretorId, setCorretorId] = useState('')

  const columns = useMemo(() => {
    const doFunil = (funilEtapas ?? []).filter(c => funilId == null || c.funilId === funilId)
    return doFunil.length > 0 ? doFunil : getKanbanColumns(segmento)
  }, [funilEtapas, segmento, funilId])

  const leadsDoFunilBase = useMemo(
    () => (funilId == null ? leads : leads.filter(l => (l.funil_id ?? funilPadrao) === funilId)),
    [leads, funilId, funilPadrao],
  )
  const esteiraCount = useMemo(() => leadsDoFunilBase.filter(l => !l.responsavel_id && l.ativo !== false).length, [leadsDoFunilBase])
  /**
   * Esteira e corretor são EXCLUSIVOS: esteira é "sem dono", corretor é "dono é
   * este". Ligar os dois devolveria quadro vazio sempre, e quadro vazio por
   * combinação de filtro parece sistema sem lead. Os botões também se desligam.
   */
  const leadsDoFunil = useMemo(() => {
    if (soEsteira) return leadsDoFunilBase.filter(l => !l.responsavel_id)
    if (corretorId) return leadsDoFunilBase.filter(l => l.responsavel_id === corretorId)
    return leadsDoFunilBase
  }, [leadsDoFunilBase, soEsteira, corretorId])

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

  const stats = useMemo(() => {
    const ganhoId   = ganhoColId(columns)
    const negocIds  = columns.filter(c => c.tipo === 'negociacao').map(c => c.id)
    const ativos    = leadsDoFunil.filter(l => l.ativo !== false)
    const conv      = ativos.filter(l => l.kanban_status === ganhoId).length
    const taxa      = ativos.length > 0 ? Math.round((conv / ativos.length) * 100) : 0
    const negoc     = ativos
      .filter(l => negocIds.includes(l.kanban_status ?? ''))
      .reduce((s, l) => s + (l.valor_estimado ?? 0), 0)
    const precisam  = ativos.filter(l => (l.msgs_nao_lidas ?? 0) > 0).length
    return { ativos: ativos.length, taxa, negoc, precisam }
  }, [leadsDoFunil, columns])

  // Realtime: novas mensagens recebidas incrementam o badge do card,
  // e leads novos (conversas que ainda não estão na tela) entram sozinhos.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('kanban_msgs')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_mensagens' },
        (payload: RealtimePostgresChangesPayload<{ direcao: string; lead_id: number; created_at: string }>) => {
          const m = payload.new as { direcao: string; lead_id: number; created_at: string }
          if (m.direcao !== 'recebida') return
          // REORDENA. A lista chega do servidor por ultima_mensagem_at desc, mas
          // atualizar a data no lugar deixava o card parado onde estava: quem
          // acabou de escrever continuava no fim da coluna, que é justamente
          // onde ninguém olha. Ordenar aqui devolve o card para o topo na hora.
          setLeads(prev => porMensagemRecente(prev.map(l =>
            l.id === m.lead_id
              ? { ...l, msgs_nao_lidas: (l.msgs_nao_lidas ?? 0) + 1, ultima_mensagem_at: m.created_at }
              : l
          )))
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          const novo = payload.new as Lead
          if (novo.ativo === false) return
          // Lead SEM dono é da esteira e aparece para todos. Sem o `!= null` o
          // vendedor não via chegar lead novo nenhum: todo lead nasce sem
          // responsável, e ele só apareceria depois de recarregar a página.
          if (restringe && novo.responsavel_id != null && novo.responsavel_id !== meuId) return
          setLeads(prev =>
            prev.some(l => l.id === novo.id)
              ? prev
              : porMensagemRecente([{ ...novo, msgs_nao_lidas: novo.msgs_nao_lidas ?? 0 }, ...prev]))
        })
      // Lead atualizado: reflete na hora; se foi desativado (excluído), some da lista
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          const l = payload.new as Lead
          // Some só quando foi para OUTRA pessoa. Voltar para a esteira
          // (responsável nulo) deixa o lead livre — e livre é de todos, então
          // ele continua na tela para quem quiser pegar.
          if (restringe && l.responsavel_id != null && l.responsavel_id !== meuId) {
            setLeads(prev => prev.filter(x => x.id !== l.id))
            return
          }
          setLeads(prev => {
            if (l.ativo === false) return prev.filter(x => x.id !== l.id)
            // ENTRA na lista se ainda não estava. O tratador só sabia ALTERAR o
            // que já estava na tela: um lead que era de outro vendedor — e por
            // isso nem tinha sido carregado — voltava para a esteira e não
            // aparecia para ninguém até alguém recarregar a página. Justamente
            // o caso em que a pressa importa, porque o lead está sem dono.
            if (!prev.some(x => x.id === l.id)) {
              return porMensagemRecente([{ ...l, msgs_nao_lidas: l.msgs_nao_lidas ?? 0 }, ...prev])
            }
            return porMensagemRecente(prev.map(x => x.id === l.id ? { ...x, ...l } : x))
          })
        })
      // Lead removido do banco: some da lista na hora
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'leads' },
        (payload: RealtimePostgresChangesPayload<{ id: number }>) => {
          const old = payload.old as { id: number }
          setLeads(prev => prev.filter(x => x.id !== old.id))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function handleLeadUpdate(updated: Lead) {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    if (selectedLead?.id === updated.id) setSelectedLead(updated)
  }

  function handleLeadCreate(created: Lead) {
    setLeads(prev => [created, ...prev])
    setShowNewLead(false)
  }

  const fmtK = (v: number) =>
    v >= 1000
      ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')}k`
      : formatCurrency(v)

  return (
    <ScoreConfigProvider value={scoreConfig}>
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
                    onClick={() => setFunilId(f.id)}
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
            Com `restringe`, o servidor já mandou apenas os leads dele: o filtro
            não teria o que filtrar e sugeriria acesso que ele não tem.
          */}
          {!restringe && usuarios.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter size={15} strokeWidth={1.8} className="shrink-0 text-ink-3" />
              <Select
                aria-label="Filtrar por corretor"
                value={corretorId}
                onChange={e => { setCorretorId(e.target.value); if (e.target.value) setSoEsteira(false) }}
                className="min-w-[190px]"
              >
                <option value="">Todos os corretores</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || 'Sem nome'}</option>)}
              </Select>
            </div>
          )}
          <button
            onClick={() => { setSoEsteira(v => !v); setCorretorId('') }}
            className={`whitespace-nowrap rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${soEsteira ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-card text-ink-2 hover:text-ink'}`}
          >
            Esteira{esteiraCount > 0 ? ` (${esteiraCount})` : ''}
          </button>
          <div className="num text-[13px] text-ink-2">
            {stats.ativos} em aberto
            {' · '}<span className="font-semibold text-ink">{fmtK(stats.negoc)}</span> em negociação
            {' · '}conversão {stats.taxa}%
            {stats.precisam > 0 && (
              <span className="font-semibold text-bad"> · {stats.precisam} aguardando resposta</span>
            )}
          </div>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setShowNewLead(true)}>
          Novo lead
        </Button>
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <KanbanBoard
          leads={leadsDoFunil}
          usuarios={usuarios}
          columns={columns}
          onLeadClick={setSelectedLead}
          onLeadUpdate={handleLeadUpdate}
          sla={sla}
          motivos={motivos}
        />
      </div>

      {/* Modais */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          usuarios={usuarios}
          columns={columns}
          segmento={segmento}
          // Sem esta lista o modal de perda abriria vazio ("nenhum motivo
          // cadastrado") justamente onde agora se marca Perdido — e sem erro
          // algum na tela, que é o pior jeito de faltar dado.
          motivos={motivos}
          onClose={() => setSelectedLead(null)}
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
    </ScoreConfigProvider>
  )
}
