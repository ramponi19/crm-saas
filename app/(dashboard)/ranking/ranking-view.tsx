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

/** Rótulo curto, para o crachá do cartão de meta. */
const TIPO_LABEL: Record<string, string> = {
  vendas: 'Vendas', fechamentos: 'Fechamentos', visitas: 'Visitas', propostas: 'Propostas',
  captacoes: 'Captações', imoveis_captados: 'Imóveis captados', faturamento: 'Faturamento',
}

/**
 * Tipos oferecidos ao criar meta, com o nome inteiro.
 *
 * "Captações" sozinho não diz se é cliente ou imóvel, e na imobiliária são as duas
 * metades do trabalho: "Captações de Clientes" e "Imóveis Captados" são metas
 * diferentes. `fechamentos` não aparece aqui de propósito — mede exatamente o mesmo
 * que `vendas` (ver `valorMetrica`), então eram duas opções para o mesmo número.
 * Segue no TIPO_LABEL porque meta antiga gravada com ele precisa se apresentar.
 */
const TIPOS_META: { v: string; l: string; soCaptaAtivo?: boolean }[] = [
  { v: 'vendas', l: 'Vendas (Fechamentos)' },
  { v: 'captacoes', l: 'Captações de Clientes' },
  { v: 'imoveis_captados', l: 'Imóveis Captados', soCaptaAtivo: true },
  { v: 'visitas', l: 'Visitas Realizadas' },
  { v: 'propostas', l: 'Propostas Enviadas' },
  { v: 'faturamento', l: 'Faturamento (R$)' },
]

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** "2026-08" → "Agosto 2026" (cabeçalho da seção e rodapé do modal). */
const mesAno = (p: string) => { const [a, m] = p.split('-').map(Number); return `${MESES[m - 1] ?? ''} ${a}` }

function shiftMes(p: string, d: number) {
  const [a, m] = p.split('-').map(Number)
  const nd = new Date(a, m - 1 + d, 1)
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`
}
/** "1 visitas" no pódio era o tipo de detalhe que faz a tela parecer rascunho. */
const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '—'

/**
 * Papel escrito por extenso, ao lado do nome.
 *
 * `vendedor` cai no rótulo do segmento — "Corretor" na imobiliária, "Vendedor" na
 * loja — porque é a mesma pessoa com dois nomes de mercado.
 */
const PAPEL_LABEL: Record<string, string> = { owner: 'Proprietário', admin: 'Administrador', tecnico: 'Técnico', member: 'Membro' }
const papelDe = (papel: string | undefined, equipeLabel: string) => (papel ? PAPEL_LABEL[papel] ?? equipeLabel : equipeLabel)

export function RankingView({ periodo, linhas, metas, membros, papeis = {}, isAdmin, mostrarImoveis = false, equipeLabel = 'Vendedor' }: {
  periodo: string
  linhas: LinhaRanking[]
  metas: MetaUi[]
  membros: MembroOpt[]
  papeis?: Record<string, string>
  isAdmin: boolean
  mostrarImoveis?: boolean
  equipeLabel?: string
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'ranking' | 'metas'>('ranking')
  const [recalc, setRecalc] = useState(false)
  const [novaMeta, setNovaMeta] = useState(false)

  const irPara = (p: string) => router.push(`/ranking?periodo=${p}`)
  const podio = linhas.slice(0, 3).filter((l) => l.score > 0)

  const [anoSel, mesSel] = periodo.split('-').map(Number)
  /**
   * Anos oferecidos: os dois anteriores, o atual e o seguinte — mais o que estiver
   * no endereço, se alguém chegar por link antigo. Lista fixa em código envelhece:
   * um seletor que para em 2027 vira tela sem saída em 2028.
   */
  const anoAtual = new Date().getFullYear()
  const anos = [...new Set([anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1, anoSel])].sort((a, b) => a - b)

  async function recalcular() {
    setRecalc(true)
    router.refresh()
    setTimeout(() => setRecalc(false), 600)
    notify.ok('Scores recalculados')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Metas e Ranking" />
      <div className="mx-auto w-full max-w-[960px] min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <p className="mb-4 text-[13px] text-ink-2">Acompanhe o desempenho da equipe</p>

        {/* Cabeçalho: abas + mês e ano */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {(['ranking', 'metas'] as const).map((id) => (
              <button key={id} onClick={() => setAba(id)}
                className={`rounded-control px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${aba === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink/[0.05]'}`}>
                {id === 'ranking' ? 'Ranking' : 'Metas'}
              </button>
            ))}
          </div>
          {/*
            Mês e ano em lista, com as setas de vizinhança ao lado.
            Só as setas obrigavam doze cliques para comparar com o ano passado —
            fechamento de ano é exatamente quando se olha para trás.
          */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => irPara(shiftMes(periodo, -1))} className="grid size-9 place-items-center rounded-control border border-line text-ink-2 hover:text-ink" aria-label="Mês anterior"><ChevronLeft size={16} strokeWidth={1.8} /></button>
            <Select aria-label="Mês" value={String(mesSel)} className="min-w-[124px]"
              onChange={(e) => irPara(`${anoSel}-${String(Number(e.target.value)).padStart(2, '0')}`)}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select aria-label="Ano" value={String(anoSel)} className="min-w-[86px]"
              onChange={(e) => irPara(`${e.target.value}-${String(mesSel).padStart(2, '0')}`)}>
              {anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
            <button onClick={() => irPara(shiftMes(periodo, 1))} className="grid size-9 place-items-center rounded-control border border-line text-ink-2 hover:text-ink" aria-label="Próximo mês"><ChevronRight size={16} strokeWidth={1.8} /></button>
          </div>
        </div>

        {aba === 'ranking' ? (
          <>
            {/* Pódio: 2º | 1º | 3º, como num pódio de verdade. */}
            {podio.length > 0 && (
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {podio.map((l, i) => (
                  <PodioCard key={l.usuario_id} linha={l} pos={i} lider={i === 0} papel={papelDe(papeis[l.usuario_id], equipeLabel)} />
                ))}
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-2">Ranking Completo — {mesAno(periodo)}</span>
              <Button variant="outline" icon={<RefreshCw size={14} strokeWidth={1.8} className={recalc ? 'animate-spin' : ''} />} onClick={recalcular}>Recalcular Scores</Button>
            </div>

            {linhas.length === 0 ? (
              <EmptyState icon={<Trophy size={24} strokeWidth={1.6} />} title="Sem dados no período" description="Quando houver vendas, visitas e propostas no mês, o ranking aparece aqui." />
            ) : (
              <div className="overflow-x-auto rounded-card border border-line">
                <table className="w-full min-w-[680px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-card text-left text-[11px] uppercase tracking-wide text-ink-3">
                      <th className="px-3 py-2.5 font-semibold">#</th>
                      <th className="px-3 py-2.5 font-semibold">{equipeLabel}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Score</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Vendas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Captações</th>
                      {/* Só onde a captação de imóvel existe — coluna zerada em toda
                          linha é ruído que faz o dono duvidar do resto da tabela. */}
                      {mostrarImoveis && <th className="px-3 py-2.5 text-right font-semibold">Imóveis</th>}
                      <th className="px-3 py-2.5 text-right font-semibold">Visitas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Propostas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Conversão</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={l.usuario_id} className="border-b border-line-soft last:border-0 hover:bg-bg">
                        <td className="px-3 py-2.5 num text-ink-3">#{i + 1}</td>
                        <td className="px-3 py-2.5">
                          {/* Inicial + papel juntos: a tabela deixa de exigir que se
                              decore quem é da rua e quem é da administração. */}
                          <span className="flex items-center gap-2.5">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-[11px] font-bold text-ink-2">{iniciais(l.nome)}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">{l.nome}</span>
                              <span className="block text-[11px] text-ink-3">{papelDe(papeis[l.usuario_id], equipeLabel)}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right"><span className="num font-semibold text-accent">{l.score}</span></td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.vendas}</td>
                        <td className="px-3 py-2.5 text-right num text-ink-2">{l.captacoes}</td>
                        {mostrarImoveis && <td className="px-3 py-2.5 text-right num text-ink-2">{l.imoveisCaptados}</td>}
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
              <span className="text-[13px] font-semibold text-ink-2">Metas de {mesAno(periodo)}</span>
              {isAdmin && <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNovaMeta(true)}>Nova Meta</Button>}
            </div>
            {metas.length === 0 ? (
              <EmptyState icon={<Target size={24} strokeWidth={1.6} />} title={`Nenhuma meta cadastrada para ${mesAno(periodo)}`}
                description={isAdmin ? 'Clique em "Nova Meta" para começar — por pessoa ou para a equipe.' : 'O gestor ainda não definiu metas para este período.'}
                action={isAdmin ? <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNovaMeta(true)}>Nova Meta</Button> : undefined} />
            ) : (
              <div className="space-y-2.5">
                {metas.map((m) => <MetaCard key={m.id} meta={m} isAdmin={isAdmin} onDelete={() => router.refresh()} />)}
              </div>
            )}
          </>
        )}
      </div>

      {novaMeta && (
        <NovaMetaModal
          periodo={periodo}
          membros={membros}
          equipeLabel={equipeLabel}
          mostrarImoveis={mostrarImoveis}
          onClose={() => setNovaMeta(false)}
          onSaved={() => { setNovaMeta(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function PodioCard({ linha, pos, lider, papel }: { linha: LinhaRanking; pos: number; lider: boolean; papel: string }) {
  const cor = pos === 0 ? 'text-accent' : pos === 1 ? 'text-ink-2' : 'text-ink-3'
  const ring = pos === 0 ? 'border-accent/40 bg-accent/[0.04]' : 'border-line bg-card'
  const Icon = pos === 0 ? Trophy : Medal
  return (
    <div className={`rounded-card border p-4 ${ring} ${pos === 0 ? 'sm:order-2' : pos === 1 ? 'sm:order-1' : 'sm:order-3'}`}>
      <div className="flex items-center justify-between">
        <Icon size={20} strokeWidth={1.7} className={cor} />
        {lider && <Badge tone="acc"><Crown size={11} strokeWidth={1.9} className="mr-1 inline" />Líder do Mês</Badge>}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <div className={`grid size-9 place-items-center rounded-full text-[12px] font-bold ${pos === 0 ? 'bg-accent text-white' : 'bg-ink/[0.06] text-ink-2'}`}>{iniciais(linha.nome)}</div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink">{linha.nome}</div>
          <div className="text-[11.5px] text-ink-3">{papel} · {pos + 1}º lugar</div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-line-soft pt-2.5">
        <div><div className="num text-[22px] font-semibold text-ink">{linha.score}</div><div className="text-[10.5px] text-ink-3">pts</div></div>
        <div className="text-right text-[11px] text-ink-3">
          {plural(linha.vendas, 'venda', 'vendas')} · {plural(linha.visitas, 'visita', 'visitas')}<br />{formatCurrency(linha.faturamento)}
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

function NovaMetaModal({ periodo, membros, equipeLabel, mostrarImoveis, onClose, onSaved }: {
  periodo: string
  membros: MembroOpt[]
  equipeLabel: string
  mostrarImoveis: boolean
  onClose: () => void
  onSaved: () => void
}) {
  /**
   * UM seletor para escopo e pessoa: "Equipe Geral" é a primeira opção da lista.
   *
   * Antes eram dois campos — "Escopo" e, condicional, "Pessoa" —, e o segundo
   * aparecia e desaparecia conforme o primeiro. Meta é de alguém ou do time todo;
   * uma lista responde isso numa escolha, e é como o CRM do dono faz.
   */
  const [alvoPessoa, setAlvoPessoa] = useState('')
  const [tipo, setTipo] = useState('vendas')
  const [alvo, setAlvo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const tipos = TIPOS_META.filter((t) => !t.soCaptaAtivo || mostrarImoveis)
  const isMoney = tipo === 'faturamento'

  async function salvar() {
    const escopo = alvoPessoa ? 'pessoa' : 'equipe'
    if (!Number(alvo)) { notify.warn('Informe o valor da meta'); return }
    setSalvando(true)
    const r = await fetch('/api/ranking/metas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escopo, usuario_id: escopo === 'pessoa' ? alvoPessoa : null, tipo, alvo: Number(alvo) || 0, periodo }),
    })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Erro ao salvar', j.error); return }
    notify.ok('Meta criada'); onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Nova Meta" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button onClick={salvar} loading={salvando}>Criar Meta</Button>
    </>}>
      <div className="space-y-4">
        <Select label={equipeLabel} value={alvoPessoa} onChange={(e) => setAlvoPessoa(e.target.value)}>
          <option value="">Equipe Geral</option>
          {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </Select>
        <Select label="Tipo de Meta" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {tipos.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </Select>
        <Input
          label={isMoney ? 'Valor da Meta (R$)' : 'Valor da Meta (quantidade)'}
          type="number" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder={isMoney ? '100000' : '10'}
        />
        <p className="text-[11.5px] text-ink-3">
          Período — <strong className="font-semibold text-ink-2">{mesAno(periodo)}</strong>. Para outro mês, troque o
          seletor da tela antes de criar. O progresso sai das vendas, visitas, propostas e captações do próprio mês.
        </p>
      </div>
    </Modal>
  )
}
