'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Badge, Button, EmptyState, Select, Tabs, Textarea, notify } from '@/components/ui'
import { useFuso } from '@/components/fuso-provider'
import { formatarData } from '@/lib/datas'
import { cn } from '@/lib/utils'
import { ordenarChamados, situacaoDoPrazo, type resumoNps } from '@/lib/posvenda/chamados'

type Embed<T> = T | T[] | null
const um = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export interface ChamadoLinha {
  id: number; numero: number; titulo: string; descricao: string | null; prioridade: string; origem: string
  aberto_em: string; primeira_resposta_em: string | null; resolvido_em: string | null
  sla_resposta_vence: string | null; sla_resolucao_vence: string | null; responsavel_id: string; negocio_id: number | null
  contato: Embed<{ nome: string | null; telefone: string | null }>
  categoria: Embed<{ nome: string }>
  status: Embed<{ id: number; nome: string; tipo: string }>
}
interface Evento { id: number; tipo: string; de: string | null; para: string | null; texto: string | null; por: string | null; em: string }

const PRIORIDADE: Record<string, { rotulo: string; tone: 'bad' | 'warn' | 'neutro' }> = {
  urgente: { rotulo: 'Urgente', tone: 'bad' }, alta: { rotulo: 'Alta', tone: 'warn' }, normal: { rotulo: 'Normal', tone: 'neutro' }, baixa: { rotulo: 'Baixa', tone: 'neutro' },
}
const ORIGEM: Record<string, string> = { nps: 'nota baixa', manual: 'aberto pela equipe', zapintel: 'ZapIntel' }

/** CHAMADOS DO PÓS-VENDA (C7 bloco 4): lista para o celular, prazo que importa agora, mudar status, nota e repassar. */
export function ChamadosView({ chamados, status, equipe, meuId, podeRepassar, nps }: {
  chamados: ChamadoLinha[]; status: { id: number; nome: string; tipo: string }[]; equipe: { id: string; nome: string }[]
  meuId: string; podeRepassar: boolean; nps: ReturnType<typeof resumoNps>
}) {
  const [aba, setAba] = useState<'abertos' | 'resolvidos'>('abertos')
  const [aberto, setAberto] = useState<number | null>(null)
  const ordem = useMemo(() => ordenarChamados(chamados), [chamados])
  const abertos = ordem.filter((c) => !c.resolvido_em)
  const lista = aba === 'abertos' ? abertos : ordem.filter((c) => c.resolvido_em)
  const nomeDe = (id: string) => equipe.find((p) => p.id === id)?.nome ?? 'Alguém da equipe'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Pós-venda" />
      <div className="mx-auto w-full max-w-[640px] min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3 sm:px-4 scrollbar-thin">
        <div className="mb-3 flex gap-1 rounded-control border border-line bg-card p-0.5 text-[12.5px]">
          <Link href="/pos-venda" className="flex-1 rounded-[6px] px-2.5 py-1.5 text-center font-medium text-ink-2">Fila</Link>
          <span className="flex-1 rounded-[6px] bg-ink px-2.5 py-1.5 text-center font-medium text-white">Chamados{abertos.length ? ` (${abertos.length})` : ''}</span>
        </div>

        <section className="mb-3 rounded-card border border-line bg-card px-3.5 py-3" data-nps>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-ink-2">NPS · últimos 90 dias</span>
            <span className="num text-[20px] font-semibold text-ink">{nps.nps ?? '—'}</span>
          </div>
          <div className="mt-1 flex gap-3 text-[12px] text-ink-3">
            <span><span className="num font-medium text-ok">{nps.promotores}</span> promotores</span>
            <span><span className="num font-medium text-ink-2">{nps.neutros}</span> neutros</span>
            <span><span className="num font-medium text-bad">{nps.detratores}</span> detratores</span>
            <span className="ml-auto">{nps.respostas} notas</span>
          </div>
        </section>

        <Tabs className="mb-3" value={aba} onValueChange={(v) => { setAba(v as typeof aba); setAberto(null) }}
          items={[{ value: 'abertos', label: 'Abertos', badge: abertos.length || undefined }, { value: 'resolvidos', label: 'Resolvidos' }]} />

        {lista.length === 0 ? (
          <div className="pt-8"><EmptyState icon={<CheckCircle2 size={26} strokeWidth={1.6} />}
            title={aba === 'abertos' ? 'Nenhum chamado aberto' : 'Nenhum chamado resolvido ainda'}
            description="Nota baixa na pesquisa abre chamado sozinha; a equipe também abre pelo card do cliente." /></div>
        ) : (
          <ul className="flex flex-col gap-2">
            {lista.map((c) => (
              <Cartao key={c.id} c={c} status={status} equipe={equipe} podeRepassar={podeRepassar} meu={c.responsavel_id === meuId}
                responsavel={nomeDe(c.responsavel_id)} aberto={aberto === c.id} alternar={() => setAberto((a) => (a === c.id ? null : c.id))} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Cartao({ c, status, equipe, podeRepassar, meu, responsavel, aberto, alternar }: {
  c: ChamadoLinha; status: { id: number; nome: string; tipo: string }[]; equipe: { id: string; nome: string }[]
  podeRepassar: boolean; meu: boolean; responsavel: string; aberto: boolean; alternar: () => void
}) {
  const fuso = useFuso()
  const router = useRouter()
  const st = um(c.status)
  const contato = um(c.contato)
  const fmt = (iso: string) => formatarData(iso, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, '', fuso)
  const prazo = situacaoDoPrazo(c, new Date(), fmt)
  const pr = PRIORIDADE[c.prioridade] ?? PRIORIDADE.normal
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [novoStatus, setNovoStatus] = useState(String(st?.id ?? ''))
  const [texto, setTexto] = useState('')
  const [para, setPara] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function abrir() {
    alternar()
    if (!aberto && eventos === null) {
      const r = await fetch(`/api/pos-venda/chamados?id=${c.id}`)
      const j = await r.json().catch(() => ({}))
      setEventos(r.ok ? (j.eventos ?? []) : [])
    }
  }
  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/pos-venda/chamados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'mover', chamado_id: c.id, status_id: Number(novoStatus) !== st?.id ? Number(novoStatus) : null, texto, responsavel: para || null }),
    })
    const j = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível salvar'); return }
    notify.ok('Chamado atualizado'); setTexto(''); setPara(''); setEventos(null); alternar(); router.refresh()
  }
  const mudou = Number(novoStatus) !== st?.id || texto.trim() !== '' || para !== ''

  return (
    <li className="rounded-card border border-line bg-card px-3.5 py-3">
      <button type="button" onClick={abrir} className="block w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[14.5px] font-semibold text-ink"><span className="num text-ink-3">#{c.numero}</span> {c.titulo}</span>
          <Badge tone={st?.tipo === 'resolvido' ? 'ok' : st?.tipo === 'aberto' ? 'acc' : 'neutro'} className="shrink-0">{st?.nome ?? '—'}</Badge>
        </div>
        <div className="truncate text-[13px] text-ink-2">{contato?.nome ?? 'Cliente'}{um(c.categoria)?.nome ? ` · ${um(c.categoria)!.nome}` : ''}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
          <Badge tone={pr.tone}>{pr.rotulo}</Badge>
          <span className={cn(prazo.tone === 'bad' ? 'text-bad' : prazo.tone === 'warn' ? 'text-warn' : prazo.tone === 'ok' ? 'text-ok' : 'text-ink-3')}>{prazo.texto}</span>
          <span className="text-ink-3">· {meu ? 'com você' : responsavel}</span>
        </div>
      </button>
      {aberto && (
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-line-soft pt-2.5">
          <div className="text-[12px] text-ink-3">Aberto {fmt(c.aberto_em)} · {ORIGEM[c.origem] ?? c.origem}
            {c.negocio_id && <> · <Link href={`/leads?lead=${c.negocio_id}`} className="font-medium text-ink-2 underline">abrir o cliente</Link></>}
          </div>
          {c.descricao && <div className="whitespace-pre-line rounded-control border border-line-soft bg-bg p-2.5 text-[12.5px] text-ink-2">{c.descricao}</div>}
          <ol className="flex flex-col gap-1">
            {eventos === null ? <li className="text-[12px] text-ink-3"><Loader2 size={13} className="mr-1 inline animate-spin" />Carregando o histórico…</li>
              : eventos.map((e) => (
                <li key={e.id} className="text-[12px] text-ink-2">
                  <span className="num text-ink-3">{fmt(e.em)}</span> · {e.tipo === 'status' ? `${e.de ? `${e.de} → ` : ''}${e.para}` : e.tipo === 'atribuicao' ? `passou de ${e.de} para ${e.para}` : e.tipo === 'cliente_respondeu' ? 'cliente respondeu' : 'nota'}
                  {e.texto && e.texto !== 'chamado aberto' ? `: ${e.texto}` : ''}{e.por ? ` (${e.por})` : ''}
                </li>
              ))}
          </ol>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select label="Status" value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)}>
              {status.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </Select>
            {podeRepassar && (
              <Select label="Passar para" value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">{responsavel} (atual)</option>
                {equipe.filter((p) => p.id !== c.responsavel_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            )}
          </div>
          <Textarea label="Anotação (o que foi feito, o que falta)" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Button size="sm" loading={salvando} disabled={!mudou} onClick={salvar}>Salvar</Button>
        </div>
      )}
    </li>
  )
}
