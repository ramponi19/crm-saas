'use client'

import { useState, type ReactNode } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronUp, ChevronDown, GripVertical, LayoutDashboard } from 'lucide-react'
import { MENU_ICONS } from '@/components/layout/menu-icons'
import { CHAVE_ORDEM } from '@/lib/menu'
import { cn } from '@/lib/utils'

/**
 * Reordenar o menu arrastando — a mesma peça para o superadmin (por segmento) e
 * para o dono (por empresa).
 *
 * Até 20/08/2026 a ordem do menu só existia em código: mudar a sequência de uma
 * vertical pedia commit e deploy. Aqui ela é dado.
 *
 * É uma LISTA ÚNICA porque o menu não tem mais separadores — os cabeçalhos "Hoje /
 * Comercial / Operação" saíram no mesmo dia. Enquanto existiam, esta tela ordenava
 * dentro de cada caixa e movia item entre caixas; sem eles, isso seria uma regra
 * invisível: o usuário arrastaria o Financeiro para o topo e ele voltaria para o
 * meio, porque a renderização concatenava grupo por grupo. Uma lista só é o que a
 * tela mostra e o que o menu obedece.
 *
 * As setas ao lado da alça continuam existindo: arrastar não serve para teclado nem
 * para o dedo em lista longa, e esta tela é justamente para quem tem menu grande.
 */

export interface ItemMenu {
  href: string
  label: string
  icon: string
}

/** O que sai daqui é exatamente o que vai para o banco. */
export type LayoutMenu = Record<string, string[]>

export function MenuOrdenavel({
  itens,
  onChange,
  renderExtra,
}: {
  itens: ItemMenu[]
  /** Chamado a cada mudança, já no formato do banco. */
  onChange: (layout: LayoutMenu) => void
  /** Conteúdo à direita de cada linha — a tela do dono põe renomear e ocultar aqui. */
  renderExtra?: (item: ItemMenu) => ReactNode
}) {
  const [lista, setLista] = useState<ItemMenu[]>(itens)

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function publicar(novo: ItemMenu[]) {
    setLista(novo)
    onChange({ [CHAVE_ORDEM]: novo.map((i) => i.href) })
  }

  function aoSoltar(e: DragEndEvent) {
    const de = lista.findIndex((i) => i.href === String(e.active.id))
    const para = e.over ? lista.findIndex((i) => i.href === String(e.over!.id)) : -1
    if (de < 0 || para < 0 || de === para) return
    publicar(arrayMove(lista, de, para))
  }

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= lista.length) return
    publicar(arrayMove(lista, i, j))
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={lista.map((i) => i.href)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-line-soft">
            {lista.map((item, i) => (
              <LinhaItem
                key={item.href}
                item={item}
                posicao={i + 1}
                primeiro={i === 0}
                ultimo={i === lista.length - 1}
                onMover={(dir) => mover(i, dir)}
                extra={renderExtra?.(item)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

/** Uma linha — componente próprio porque `useSortable` exige. */
function LinhaItem({ item, posicao, primeiro, ultimo, onMover, extra }: {
  item: ItemMenu
  posicao: number
  primeiro: boolean
  ultimo: boolean
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
        <button onClick={() => onMover(-1)} disabled={primeiro}
          className="text-ink-3 hover:text-ink disabled:opacity-25" aria-label="Subir"><ChevronUp size={14} strokeWidth={1.8} /></button>
        <button onClick={() => onMover(1)} disabled={ultimo}
          className="text-ink-3 hover:text-ink disabled:opacity-25" aria-label="Descer"><ChevronDown size={14} strokeWidth={1.8} /></button>
      </span>

      <span className="num w-5 shrink-0 text-right text-[11px] text-ink-3">{posicao}</span>
      <Icon size={16} strokeWidth={1.7} className="flex-none text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
        <span className="num block truncate text-[11px] text-ink-3">{item.href}</span>
      </span>
      {extra}
    </div>
  )
}
