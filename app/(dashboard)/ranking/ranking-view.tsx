'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button, Select, Input, Modal, Badge, EmptyState, notify } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import type { LinhaRanking } from '@/lib/ranking'
import { Trophy, Medal, ChevronLeft, ChevronRight, RefreshCw, Plus, Trash2, Target, Crown } from 'lucide-react'

export interface MetaUi { id: number; escopo: string; tipo: string; alvo: number; usuario_nome: string; realizado: number }
export interface MembroOpt { id: string; nome: string }

const TIPO_LABEL: Record<string, string> = {
  vendas: 'Vendas', fechamentos: 'Fechamentos', visitas: 'Visitas', propostas: 'Propostas', captacoes: 'Captações', faturamento: 'Faturamento',
}
const fmtMes = (p: string) => { const [a, m] = p.split('-').map(Number); return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
function shiftMes(p: string, d: number) {
  const [a, m] = p.split('-').map(Number)
  const nd = new Date(a, m - 1 + d, 1)
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`
}
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '—'

export function RankingView({ periodo, linhas, metas, membros, isAdmin }: { periodo: string; linhas: LinhaRanking[]; metas: MetaUi[]; membros: MembroOpt[]; isAdmin: boolean }) {
  const router = useRouter()
  const [aba, setAba] = useState<'ranking' | 'metas'>('ranking')
  const [recalc, setRecalc] = useState(false)
  const [novaMeta, setNovaMeta] = useState(false)

  const irPara = (p: string) => router.push(`/ranking?periodo=${p}`)
  const podio = linhas.slice(0, 3).filter((l) => l.score > 0)

  async function recalcular() {
    setRecalc(true)
    router.refresh()
    setTimeout(() => setRecalc(false), 600)
    notify.ok('Scores recalculados')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Ranking & Metas" />
      <div className="mx-auto w-full max-w-[960px] min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        {/* Cabeçalho: abas + seletor de mês */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {(['ranking', 'metas'] as const).map((id) => (
              <button key={id} onClick={() => setAba(id)}
                className={`rounded-control px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${aba === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink/[0.05]'}`}>
                {id === 'ranking' ? 'Ranking' : 'Metas'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => irPara(shiftMes(periodo, -1))} className="grid size-9 place-items-center rounded-control border border-line text-ink-2 hover:text-ink" aria-label="Mês anterior"><ChevronLeft size={16} strokeWidth={1.8} /></button>
            <span className="min-w-[130px] text-center text-[13.5px] font-semibold capitalize text-ink">{fmtMes(periodo)}</span>
            <button onClick={() => irPara(shiftMes(periodo, 1))} className="grid size-9 place-items-center rounded-control border border-line text-ink-2 hover:text-ink" aria-label="Próximo mês"><ChevronRight size={16} strokeWidth={1.8} /></button>
          </div>
        </div>

        {aba === 'ranking' ? (
          <>
            {/* Pódio */}
            {podio.length > 0 && (
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {podio.map((l, i) => <PodioCard key={l.usuario_id} linha={l} pos={i} lider={i === 0} />)}
              </div>
            )}

            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-2">Classificação completa</span>
              <Button variant="outline" icon={<RefreshCw size={14} strokeWidth={1.8} className={recalc ? 'animate-spin' : ''} />} onClick={recalcular}>Recalcular scores</Button>
            </div>

            {linhas.length === 0 ? (
              <EmptyState icon={<Trophy size={24} strokeWidth={1.6} />} title="Sem dados no período" description="Quando houver vendas, visitas e propostas no mês, o ranking aparece aqui." />
            ) : (
              <div className="overflow-x-auto rounded-card border border-line">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-card text-left text-[11px] uppercase tracking-wide text-ink-3">
                      <th className="px-3 py-2.5 font-semibold">#</th>
                      <th className="px-3 py-2.5 font-semibold">Vendedor</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Score</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Vendas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Captações</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Visitas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Propostas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Conversão</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={l.usuario_id} className="border-b border-line-soft last:border-0 hover:bg-bg">
                        <td className="px-3 py-2.5 num text-ink-3">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-ink">{l.nome}</td>
                        <td className="px-3 py-2.5 text-right"><span className="num font-semibold text-accent">{l.score}</span></td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.vendas}</td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.captacoes}</td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.visitas}</td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.propostas}</td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.conversao}%</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="num text-ink">{formatCurrency(l.faturamento)}</span>
                          {/* O que não pontuou tem de ficar visível para o vendedor
                              saber que existe uma troca para ele ir cobrar. */}
                          {l.faturamentoRetido > 0 && (
                            <div className="text-[10.5px] text-warn">
                              {formatCurrency(l.faturamentoRetido)} travado · aparelho não chegou
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-2">Metas de {fmtMes(periodo)}</span>
              {isAdmin && <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNovaMeta(true)}>Nova meta</Button>}
            </div>
            {metas.length === 0 ? (
              <EmptyState icon={<Target size={24} strokeWidth={1.6} />} title="Nenhuma meta neste mês"
                description={isAdmin ? 'Crie metas por pessoa ou para a equipe e acompanhe o progresso.' : 'O gestor ainda não definiu metas para este período.'}
                action={isAdmin ? <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNovaMeta(true)}>Nova meta</Button> : undefined} />
            ) : (
              <div className="space-y-2.5">
                {metas.map((m) => <MetaCard key={m.id} meta={m} isAdmin={isAdmin} onDelete={() => router.refresh()} />)}
              </div>
            )}
          </>
        )}
      </div>

      {novaMeta && <NovaMetaModal periodo={periodo} membros={membros} onClose={() => setNovaMeta(false)} onSaved={() => { setNovaMeta(false); router.refresh() }} />}
    </div>
  )
}

function PodioCard({ linha, pos, lider }: { linha: LinhaRanking; pos: number; lider: boolean }) {
  const cor = pos === 0 ? 'text-accent' : pos === 1 ? 'text-ink-2' : 'text-ink-3'
  const ring = pos === 0 ? 'border-accent/40 bg-accent/[0.04]' : 'border-line bg-card'
  const Icon = pos === 0 ? Trophy : Medal
  return (
    <div className={`rounded-card border p-4 ${ring} ${pos === 0 ? 'sm:order-2' : pos === 1 ? 'sm:order-1' : 'sm:order-3'}`}>
      <div className="flex items-center justify-between">
        <Icon size={20} strokeWidth={1.7} className={cor} />
        {lider && <Badge tone="acc"><Crown size={11} strokeWidth={1.9} className="mr-1 inline" />Líder do mês</Badge>}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <div className={`grid size-9 place-items-center rounded-full text-[12px] font-bold ${pos === 0 ? 'bg-accent text-white' : 'bg-ink/[0.06] text-ink-2'}`}>{iniciais(linha.nome)}</div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink">{linha.nome}</div>
          <div className="text-[11.5px] text-ink-3">{pos + 1}º lugar</div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-line-soft pt-2.5">
        <div><div className="num text-[22px] font-semibold text-ink">{linha.score}</div><div className="text-[10.5px] text-ink-3">score</div></div>
        <div className="text-right text-[11px] text-ink-3">
          {linha.vendas} vendas · {linha.visitas} visitas<br />{formatCurrency(linha.faturamento)}
          {linha.vendasRetidas > 0 && (
            <><br /><span className="text-warn">
              {linha.vendasRetidas} {linha.vendasRetidas === 1 ? 'venda travada' : 'vendas travadas'}
            </span></>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaCard({ meta, isAdmin, onDelete }: { meta: MetaUi; isAdmin: boolean; onDelete: () => void }) {
  const [busy, setBusy] = useState(false)
  const isMoney = meta.tipo === 'faturamento'
  const pct = meta.alvo > 0 ? Math.min(100, Math.round((meta.realizado / meta.alvo) * 100)) : 0
  const fmt = (n: number) => (isMoney ? formatCurrency(n) : String(n))

  async function excluir() {
    setBusy(true)
    const r = await fetch(`/api/ranking/metas?id=${meta.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { notify.bad('Erro ao excluir'); return }
    notify.ok('Meta removida'); onDelete()
  }

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">{meta.usuario_nome}</span>
          <Badge tone="neutro">{TIPO_LABEL[meta.tipo] ?? meta.tipo}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-[13px] text-ink-2">{fmt(meta.realizado)} / <span className="font-semibold text-ink">{fmt(meta.alvo)}</span></span>
          {isAdmin && <button onClick={excluir} disabled={busy} className="text-ink-3 hover:text-bad disabled:opacity-50" aria-label="Excluir"><Trash2 size={14} strokeWidth={1.7} /></button>}
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-right text-[11px] num text-ink-3">{pct}%</div>
    </div>
  )
}

function NovaMetaModal({ periodo, membros, onClose, onSaved }: { periodo: string; membros: MembroOpt[]; onClose: () => void; onSaved: () => void }) {
  const [escopo, setEscopo] = useState<'pessoa' | 'equipe'>('pessoa')
  const [usuarioId, setUsuarioId] = useState(membros[0]?.id ?? '')
  const [tipo, setTipo] = useState('vendas')
  const [alvo, setAlvo] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (escopo === 'pessoa' && !usuarioId) { notify.warn('Escolha a pessoa'); return }
    setSalvando(true)
    const r = await fetch('/api/ranking/metas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escopo, usuario_id: escopo === 'pessoa' ? usuarioId : null, tipo, alvo: Number(alvo) || 0, periodo }),
    })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Erro ao salvar', j.error); return }
    notify.ok('Meta criada'); onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Nova meta" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button onClick={salvar} loading={salvando}>Criar meta</Button>
    </>}>
      <div className="space-y-4">
        <Select label="Escopo" value={escopo} onChange={(e) => setEscopo(e.target.value as 'pessoa' | 'equipe')}>
          <option value="pessoa">Uma pessoa</option>
          <option value="equipe">Equipe (geral)</option>
        </Select>
        {escopo === 'pessoa' && (
          <Select label="Pessoa" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Select>
        )}
        <Select label="Tipo de meta" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label={tipo === 'faturamento' ? 'Alvo (R$)' : 'Alvo (quantidade)'} type="number" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="0" />
        <p className="text-[11px] text-ink-3">Período: {fmtMes(periodo)}. O progresso é calculado a partir das vendas/visitas/propostas do mês.</p>
      </div>
    </Modal>
  )
}
