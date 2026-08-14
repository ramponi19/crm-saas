'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronUp, ChevronDown, Plus, Archive, RotateCcw, Trash2, GripVertical } from 'lucide-react'
import { Card, Button, IconButton, Input, Select, Badge, Modal, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { CAMPOS_QUALIFICACAO } from '@/components/modules/leads/types'

export interface EtapaEdit {
  id?: number
  slug?: string
  label: string
  cor: string
  tipo: string
  ativo: boolean
  ordem?: number
  probabilidade?: number
  camposObrigatorios?: string[]
}

const TIPOS = [
  { v: 'normal', label: 'Normal' },
  { v: 'negociacao', label: 'Negociação' },
  { v: 'ganho', label: 'Ganho' },
  { v: 'perdido', label: 'Perdido' },
]

interface Funil { id: number; nome: string; padrao: boolean }

/** Etapa marcada para sair, com o destino escolhido para os leads dela. */
interface Exclusao { id: number; label: string; moverPara: string | null; leads: number }

export function FunilView({ initial, funilId, funis = [], leadsPorEtapa = {} }: {
  initial: EtapaEdit[]
  funilId?: number
  funis?: Funil[]
  /** Quantos leads ativos há em cada etapa, por slug. */
  leadsPorEtapa?: Record<string, number>
}) {
  const router = useRouter()
  const [etapas, setEtapas] = useState<EtapaEdit[]>(initial.length ? initial : [])
  const [saving, setSaving] = useState(false)
  const [excluir, setExcluir] = useState<Exclusao[]>([])
  /** Etapa que tem leads e está esperando o dono dizer para onde eles vão. */
  const [perguntandoDestino, setPerguntandoDestino] = useState<{ indice: number; etapa: EtapaEdit; leads: number } | null>(null)
  const [destino, setDestino] = useState('')

  const set = (i: number, patch: Partial<EtapaEdit>) => setEtapas((e) => e.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const move = (i: number, dir: -1 | 1) => setEtapas((e) => {
    const j = i + dir
    if (j < 0 || j >= e.length) return e
    const copy = [...e];[copy[i], copy[j]] = [copy[j], copy[i]]; return copy
  })
  // Sem probabilidade: o servidor deriva do tipo da etapa (ver /api/funil).
  const add = () => setEtapas((e) => [...e, { label: 'Nova etapa', cor: '#9199A3', tipo: 'normal', ativo: true }])

  /**
   * Arrastar com o mouse — a ordem do funil é visual, e clicar em seta 6 vezes
   * para mover uma etapa do fim para o começo é trabalho que o gesto resolve.
   *
   * As SETAS FICAM. Não são redundância: no celular a lista rola no mesmo eixo do
   * arraste, e teclado precisa de um caminho que não seja o ponteiro.
   */
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function aoSoltar(evento: DragEndEvent) {
    const { active, over } = evento
    if (!over || active.id === over.id) return
    setEtapas((e) => {
      const de = e.findIndex((x, i) => (x.id ?? `novo-${i}`) === active.id)
      const para = e.findIndex((x, i) => (x.id ?? `novo-${i}`) === over.id)
      return de < 0 || para < 0 ? e : arrayMove(e, de, para)
    })
  }

  /**
   * Pedido de exclusão. Três caminhos, porque as consequências são diferentes:
   *  - etapa nova (sem id): só sai da lista, nada existe no banco;
   *  - etapa vazia: sai direto, sem cerimônia;
   *  - etapa COM LEADS: pergunta para onde eles vão. Nunca apago o lead junto —
   *    a etapa é organização da loja, o lead é o cliente.
   */
  function pedirExclusao(i: number) {
    const e = etapas[i]
    if (!e.id) { setEtapas((lista) => lista.filter((_, k) => k !== i)); return }

    const ativas = etapas.filter((x) => x.ativo && x.id !== e.id).length
    if (ativas === 0) {
      notify.warn('O funil não pode ficar sem etapas', 'Crie outra etapa antes de excluir esta.')
      return
    }

    const leads = leadsPorEtapa[e.slug ?? ''] ?? 0
    if (leads > 0) { setPerguntandoDestino({ indice: i, etapa: e, leads }); setDestino(''); return }

    setExcluir((x) => [...x, { id: e.id!, label: e.label, moverPara: null, leads: 0 }])
    setEtapas((lista) => lista.filter((_, k) => k !== i))
  }

  function confirmarDestino() {
    if (!perguntandoDestino) return
    if (!destino) { notify.warn('Escolha para onde vão os leads'); return }
    const { indice, etapa, leads } = perguntandoDestino
    setExcluir((x) => [...x, { id: etapa.id!, label: etapa.label, moverPara: destino, leads }])
    setEtapas((lista) => lista.filter((_, k) => k !== indice))
    setPerguntandoDestino(null)
  }

  function desfazerExclusao(id: number) {
    const original = initial.find((e) => e.id === id)
    setExcluir((x) => x.filter((e) => e.id !== id))
    if (original) setEtapas((lista) => [...lista, original])
  }

  async function salvar() {
    if (etapas.some((e) => !e.label.trim())) { notify.warn('Toda etapa precisa de um nome'); return }
    if (etapas.length === 0) { notify.warn('O funil precisa de pelo menos uma etapa'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/funil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funilId,
          etapas: etapas.map((e) => ({ id: e.id, label: e.label.trim(), cor: e.cor, tipo: e.tipo, ativo: e.ativo, camposObrigatorios: e.camposObrigatorios ?? [] })),
          // Exclusões vão no MESMO salvamento: reordenar e excluir em chamadas
          // separadas deixaria o funil num estado intermediário se a segunda
          // falhasse — com lead apontando para etapa que já não existe.
          excluir: excluir.map((e) => ({ id: e.id, moverPara: e.moverPara })),
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      const quantas = excluir.length
      notify.ok('Funil salvo', quantas ? `${quantas} etapa(s) excluída(s). O kanban já reflete.` : 'O kanban de Leads já reflete as etapas.')
      setExcluir([])
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[760px] space-y-4">
        {funis.length > 1 && (
          <div className="flex w-max items-center gap-0.5 rounded-control border border-line bg-card p-0.5">
            {funis.map(f => {
              const ativo = f.id === funilId
              return (
                <button
                  key={f.id}
                  onClick={() => router.push(`/funil?funil=${f.id}`)}
                  className={cn('whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors', ativo ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink/[0.04]')}
                >
                  {f.nome}
                </button>
              )
            })}
          </div>
        )}
        <p className="text-[13px] text-ink-2">
          As etapas do <b className="text-ink">kanban de Leads</b>. Arraste pela alça para reordenar, renomeie,
          recolora, arquive ou exclua. Etapas <b className="text-ink">Ganho</b> e <b className="text-ink">Perdido</b> definem
          conversão e perda.
        </p>

        {excluir.length > 0 && (
          <div className="rounded-control border border-bad/40 bg-bad/[0.06] px-3.5 py-2.5 text-[12.5px] text-ink-2">
            <strong className="text-ink">A excluir ao salvar:</strong>
            <ul className="mt-1 space-y-0.5">
              {excluir.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span>
                    {e.label}
                    {e.leads > 0 && e.moverPara && (
                      <span className="text-ink-3"> — {e.leads} lead(s) vão para “{etapas.find((x) => x.slug === e.moverPara)?.label ?? e.moverPara}”</span>
                    )}
                  </span>
                  <button onClick={() => desfazerExclusao(e.id)} className="text-[11.5px] font-semibold text-accent underline">desfazer</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Card flush>
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
            <SortableContext items={etapas.map((e, i) => e.id ?? `novo-${i}`)} strategy={verticalListSortingStrategy}>
              {etapas.map((e, i) => (
                <LinhaEtapa
                  key={e.id ?? `novo-${i}`}
                  id={e.id ?? `novo-${i}`}
                  etapa={e}
                  indice={i}
                  total={etapas.length}
                  leads={leadsPorEtapa[e.slug ?? ''] ?? 0}
                  set={set}
                  move={move}
                  onExcluir={pedirExclusao}
                />
              ))}
            </SortableContext>
          </DndContext>
          <div className="px-4 py-3">
            <Button variant="ghost" size="sm" icon={<Plus size={15} strokeWidth={1.7} />} onClick={add}>Adicionar etapa</Button>
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={salvar} loading={saving}>Salvar funil</Button>
          <span className="text-[11.5px] text-ink-3">
            Arquivar esconde a etapa e mantém os leads. Excluir remove a etapa — e os leads dela são movidos, nunca apagados.
          </span>
        </div>
      </div>

      {/* Para onde vão os leads da etapa que está saindo. Sem essa escolha o lead
          ficaria apontando para um slug inexistente e desapareceria do kanban. */}
      {perguntandoDestino && (
        <Modal
          open
          onClose={() => setPerguntandoDestino(null)}
          size="sm"
          title={`Excluir “${perguntandoDestino.etapa.label}”`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPerguntandoDestino(null)}>Cancelar</Button>
              <Button variant="danger" onClick={confirmarDestino}>Excluir e mover</Button>
            </>
          }
        >
          <p className="mb-3 text-[13px] leading-relaxed text-ink-2">
            Esta etapa tem <strong className="text-ink">{perguntandoDestino.leads} lead(s)</strong>. Eles não serão
            apagados — escolha para qual etapa vão.
          </p>
          <Select label="Mover os leads para" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Escolha a etapa…</option>
            {etapas
              .filter((x) => x.id !== perguntandoDestino.etapa.id && x.slug && x.ativo)
              .map((x) => <option key={x.slug} value={x.slug}>{x.label}</option>)}
          </Select>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Só etapas já salvas aparecem aqui: mover leads para uma etapa que ainda não existe no banco deixaria os
            dois lados quebrados.
          </p>
        </Modal>
      )}
    </main>
  )
}

/** Uma linha da lista — separada porque `useSortable` precisa de componente próprio. */
function LinhaEtapa({ id, etapa: e, indice: i, total, leads, set, move, onExcluir }: {
  id: number | string
  etapa: EtapaEdit
  indice: number
  total: number
  leads: number
  set: (i: number, patch: Partial<EtapaEdit>) => void
  move: (i: number, dir: -1 | 1) => void
  onExcluir: (i: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'border-b border-line-soft bg-card px-4 py-3 last:border-0',
        !e.ativo && 'opacity-55',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Alça: o arraste começa aqui, não na linha toda — senão clicar no
            campo de nome para editar arrastaria a etapa sem querer. */}
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${e.label}`}
          className="cursor-grab touch-none text-ink-3 hover:text-ink active:cursor-grabbing"
        >
          <GripVertical size={16} strokeWidth={1.7} />
        </button>

        <div className="flex flex-col">
          <button onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Subir"><ChevronUp size={15} strokeWidth={1.7} /></button>
          <button onClick={() => move(i, 1)} disabled={i === total - 1} className="text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Descer"><ChevronDown size={15} strokeWidth={1.7} /></button>
        </div>

        <input type="color" value={e.cor} onChange={(ev) => set(i, { cor: ev.target.value })} className="h-8 w-8 flex-none cursor-pointer rounded-control border border-line bg-transparent p-0.5" aria-label="Cor" />
        <Input wrapperClassName="min-w-[140px] flex-1" value={e.label} onChange={(ev) => set(i, { label: ev.target.value })} />
        <Select wrapperClassName="w-[140px]" value={e.tipo} onChange={(ev) => set(i, { tipo: ev.target.value })}>
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </Select>
        {/* Quantos leads moram aqui: é o número que torna a exclusão uma decisão
            informada em vez de um susto depois. */}
        {leads > 0 && <Badge tone="neutro">{leads} lead{leads > 1 ? 's' : ''}</Badge>}
        {!e.ativo && <Badge tone="neutro">Arquivada</Badge>}

        <IconButton aria-label={e.ativo ? 'Arquivar' : 'Reativar'} variant={e.ativo ? 'ghost' : 'outline'} onClick={() => set(i, { ativo: !e.ativo })}>
          {e.ativo ? <Archive size={15} strokeWidth={1.7} /> : <RotateCcw size={15} strokeWidth={1.7} />}
        </IconButton>
        <IconButton aria-label="Excluir etapa" variant="ghost" onClick={() => onExcluir(i)} className="text-bad hover:bg-bad/10">
          <Trash2 size={15} strokeWidth={1.7} />
        </IconButton>
      </div>

      {/* Qualificação: campos obrigatórios p/ entrar nesta etapa (Fase 4.6) */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[52px]">
        <span className="text-[11px] text-ink-3">Exigir p/ entrar:</span>
        {CAMPOS_QUALIFICACAO.map(c => {
          const on = (e.camposObrigatorios ?? []).includes(c.key)
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => set(i, { camposObrigatorios: on ? (e.camposObrigatorios ?? []).filter(x => x !== c.key) : [...(e.camposObrigatorios ?? []), c.key] })}
              className={cn('rounded-[6px] border px-2 py-0.5 text-[11.5px] font-medium transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-3 hover:text-ink')}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
