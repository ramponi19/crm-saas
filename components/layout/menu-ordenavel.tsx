'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, useDroppable, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronUp, ChevronDown, GripVertical, LayoutDashboard } from 'lucide-react'
import { MENU_ICONS } from '@/components/layout/menu-icons'
import { CHAVE_GRUPOS } from '@/lib/menu'
import { cn } from '@/lib/utils'

/**
 * Reordenar o menu arrastando — a mesma peça para o superadmin (por segmento) e
 * para o dono (por empresa).
 *
 * Até 20/08/2026 a ordem do menu só existia em código: mudar a sequência de itens
 * de uma vertical pedia commit e deploy. Aqui ela é dado, e a tela devolve o mapa
 * que `resolverMenu` já sabe aplicar — `{ "Hoje": [hrefs], "__grupos": [grupos] }`.
 *
 * Três decisões que valem explicação:
 *
 * 1. ARRASTAR ENTRE GRUPOS MOVE DE VERDADE. Não é só ordenar dentro da caixa: o
 *    href passa a ser declarado no grupo de destino, e o menu obedece. Sem isso,
 *    "Financeiro" ficaria preso em Gestão para sempre.
 * 2. AS SETAS EXISTEM AO LADO DA ALÇA. Arrastar não funciona bem com teclado nem
 *    com o dedo em lista longa, e esta tela é justamente para quem tem menu grande.
 * 3. GRUPO SE MOVE INTEIRO, com setas na própria caixa. Arrastar caixa dentro de
 *    caixa (dnd aninhado) é frágil, e ninguém reordena grupo toda semana.
 */

export interface ItemMenu {
  href: string
  label: string
  icon: string
}
export interface GrupoMenu {
  label: string
  items: ItemMenu[]
}

/** O que sai daqui é exatamente o que vai para o banco. */
export type LayoutMenu = Record<string, string[]>

export function MenuOrdenavel({
  grupos,
  onChange,
  renderExtra,
  aviso,
}: {
  grupos: GrupoMenu[]
  /** Chamado a cada mudança, já no formato do banco (inclui `__grupos`). */
  onChange: (layout: LayoutMenu) => void
  /** Conteúdo à direita de cada linha — a tela do dono põe renomear e ocultar aqui. */
  renderExtra?: (item: ItemMenu) => ReactNode
  aviso?: ReactNode
}) {
  const [estado, setEstado] = useState<GrupoMenu[]>(grupos)

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Href -> grupo onde ele está agora, para o arraste saber de onde saiu. */
  const grupoDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of estado) for (const i of g.items) m.set(i.href, g.label)
    return m
  }, [estado])

  function publicar(novo: GrupoMenu[]) {
    setEstado(novo)
    const layout: LayoutMenu = {}
    for (const g of novo) layout[g.label] = g.items.map((i) => i.href)
    layout[CHAVE_GRUPOS] = novo.map((g) => g.label)
    onChange(layout)
  }

  /** Move item entre grupos durante o arraste (o dnd-kit chama a cada passagem). */
  function aoPassar(e: DragOverEvent) {
    const arrastado = String(e.active.id)
    const alvo = e.over ? String(e.over.id) : null
    if (!alvo || arrastado === alvo) return

    const origem = grupoDe.get(arrastado)
    // O alvo pode ser um item (outro href) ou a área vazia de um grupo ("grupo:Nome").
    const destino = alvo.startsWith('grupo:') ? alvo.slice(6) : grupoDe.get(alvo)
    if (!origem || !destino || origem === destino) return

    setEstado((atual) => {
      const item = atual.find((g) => g.label === origem)?.items.find((i) => i.href === arrastado)
      if (!item) return atual
      return atual.map((g) => {
        if (g.label === origem) return { ...g, items: g.items.filter((i) => i.href !== arrastado) }
        if (g.label === destino) {
          const at = alvo.startsWith('grupo:') ? g.items.length : g.items.findIndex((i) => i.href === alvo)
          const copia = [...g.items]
          copia.splice(at < 0 ? copia.length : at, 0, item)
          return { ...g, items: copia }
        }
        return g
      })
    })
  }

  function aoSoltar(e: DragEndEvent) {
    const arrastado = String(e.active.id)
    const alvo = e.over ? String(e.over.id) : null
    if (!alvo) { publicar(estado); return }

    const grupo = grupoDe.get(arrastado)
    if (grupo && grupo === grupoDe.get(alvo)) {
      const novo = estado.map((g) => {
        if (g.label !== grupo) return g
        const de = g.items.findIndex((i) => i.href === arrastado)
        const para = g.items.findIndex((i) => i.href === alvo)
        if (de < 0 || para < 0 || de === para) return g
        return { ...g, items: arrayMove(g.items, de, para) }
      })
      publicar(novo)
      return
    }
    // Já foi movido entre grupos no `aoPassar`; aqui só grava.
    publicar(estado)
  }

  /** Sobe/desce um item, inclusive pulando para o grupo vizinho na borda. */
  function moverItem(grupoLabel: string, indice: number, dir: -1 | 1) {
    const gi = estado.findIndex((g) => g.label === grupoLabel)
    if (gi < 0) return
    const grupo = estado[gi]
    const destinoIndice = indice + dir

    if (destinoIndice >= 0 && destinoIndice < grupo.items.length) {
      const novo = estado.map((g, k) => (k === gi ? { ...g, items: arrayMove(g.items, indice, destinoIndice) } : g))
      publicar(novo)
      return
    }
    // Borda: passa para o grupo anterior (no fim) ou seguinte (no começo).
    const vizinho = gi + dir
    if (vizinho < 0 || vizinho >= estado.length) return
    const item = grupo.items[indice]
    const novo = estado.map((g, k) => {
      if (k === gi) return { ...g, items: g.items.filter((_, j) => j !== indice) }
      if (k === vizinho) return { ...g, items: dir === -1 ? [...g.items, item] : [item, ...g.items] }
      return g
    })
    publicar(novo)
  }

  function moverGrupo(indice: number, dir: -1 | 1) {
    const destino = indice + dir
    if (destino < 0 || destino >= estado.length) return
    publicar(arrayMove(estado, indice, destino))
  }

  return (
    <div className="space-y-3">
      {aviso}
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragOver={aoPassar} onDragEnd={aoSoltar}>
        {estado.map((grupo, gi) => (
          <div key={grupo.label} className="overflow-hidden rounded-card border border-line bg-card">
            <div className="flex items-center gap-2 border-b border-line-soft bg-bg px-3 py-2">
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{grupo.label}</span>
              <span className="num text-[11px] text-ink-3">{grupo.items.length}</span>
              <span className="flex items-center">
                <button onClick={() => moverGrupo(gi, -1)} disabled={gi === 0}
                  className="grid size-6 place-items-center text-ink-3 hover:text-ink disabled:opacity-30"
                  aria-label={`Subir grupo ${grupo.label}`}><ChevronUp size={14} strokeWidth={1.8} /></button>
                <button onClick={() => moverGrupo(gi, 1)} disabled={gi === estado.length - 1}
                  className="grid size-6 place-items-center text-ink-3 hover:text-ink disabled:opacity-30"
                  aria-label={`Descer grupo ${grupo.label}`}><ChevronDown size={14} strokeWidth={1.8} /></button>
              </span>
            </div>

            <SortableContext items={grupo.items.map((i) => i.href)} strategy={verticalListSortingStrategy}>
              <AreaDoGrupo label={grupo.label} vazio={grupo.items.length === 0}>
                {grupo.items.map((item, i) => (
                  <LinhaItem
                    key={item.href}
                    item={item}
                    indice={i}
                    total={grupo.items.length}
                    primeiroGrupo={gi === 0}
                    ultimoGrupo={gi === estado.length - 1}
                    onMover={(dir) => moverItem(grupo.label, i, dir)}
                    extra={renderExtra?.(item)}
                  />
                ))}
              </AreaDoGrupo>
            </SortableContext>
          </div>
        ))}
      </DndContext>
    </div>
  )
}

/**
 * A caixa do grupo, registrada como destino de soltura.
 *
 * Precisa de `useDroppable`: um `id` no DOM não existe para o dnd-kit, e sem isto
 * soltar um item num grupo VAZIO não era detectado — o item voltava para onde
 * estava, sem explicação nenhuma para quem arrastou.
 */
function AreaDoGrupo({ label, vazio, children }: { label: string; vazio: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `grupo:${label}` })
  return (
    <div ref={setNodeRef} className={cn('divide-y divide-line-soft', isOver && 'bg-accent-soft')}>
      {vazio ? (
        <p className="px-3 py-4 text-center text-[12px] text-ink-3">
          Arraste um item para cá — grupo vazio não aparece no menu.
        </p>
      ) : children}
    </div>
  )
}

/** Uma linha — componente próprio porque `useSortable` exige. */
function LinhaItem({ item, indice, total, primeiroGrupo, ultimoGrupo, onMover, extra }: {
  item: ItemMenu
  indice: number
  total: number
  primeiroGrupo: boolean
  ultimoGrupo: boolean
  onMover: (dir: -1 | 1) => void
  extra?: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href })
  const Icon = MENU_ICONS[item.icon] ?? LayoutDashboard

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2.5 bg-card px-3 py-2', isDragging && 'relative z-10 shadow-lg')}
    >
      {/* A alça é o único ponto de arraste: a linha inteira arrastando roubaria o
          clique do campo de renomear que a tela do dono coloca aqui do lado. */}
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${item.label}`}
        className="cursor-grab touch-none text-ink-3 hover:text-ink active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={1.7} />
      </button>

      <span className="flex flex-col">
        <button onClick={() => onMover(-1)} disabled={indice === 0 && primeiroGrupo}
          className="text-ink-3 hover:text-ink disabled:opacity-25" aria-label="Subir"><ChevronUp size={14} strokeWidth={1.8} /></button>
        <button onClick={() => onMover(1)} disabled={indice === total - 1 && ultimoGrupo}
          className="text-ink-3 hover:text-ink disabled:opacity-25" aria-label="Descer"><ChevronDown size={14} strokeWidth={1.8} /></button>
      </span>

      <Icon size={16} strokeWidth={1.7} className="flex-none text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
        <span className="num block truncate text-[11px] text-ink-3">{item.href}</span>
      </span>
      {extra}
    </div>
  )
}
