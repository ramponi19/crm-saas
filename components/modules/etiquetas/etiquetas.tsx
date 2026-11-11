'use client'

/**
 * ETIQUETAS NA TELA (core, 11/11/2026): a lista da empresa (uma busca por página, partilhada),
 * o selo, as etiquetas de um contato, o filtro "contém / não contém" e o escolhedor.
 * O desenho é o dos selos que o quadro já usa (fundo suave + texto na cor da paleta).
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Check, ChevronDown, Minus, Plus, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CLASSE_DA_COR, alternarNoFiltro, etiquetasDoContato, filtroEtiquetasAtivo,
  type Etiqueta, type FiltroEtiquetas, FILTRO_ETIQUETAS_VAZIO,
} from '@/lib/etiquetas'

// ── a lista da empresa: uma busca por página, todos os componentes leem a mesma ─────────────
let cache: Etiqueta[] | null = null
let carregando: Promise<void> | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export async function recarregarEtiquetas(): Promise<void> {
  carregando = (async () => {
    try {
      const r = await fetch('/api/leads/etiquetas', { cache: 'no-store' })
      const j = await r.json().catch(() => null) as { etiquetas?: Etiqueta[] } | null
      if (r.ok && j?.etiquetas) { cache = j.etiquetas; avisar() }
    } finally { carregando = null }
  })()
  return carregando
}

function assinar(f: () => void) {
  ouvintes.add(f)
  if (cache === null && !carregando) void recarregarEtiquetas()
  return () => { ouvintes.delete(f) }
}
const VAZIA: Etiqueta[] = []

/** As etiquetas da empresa (vazia enquanto carrega). */
export function useEtiquetas(): Etiqueta[] {
  return useSyncExternalStore(assinar, () => cache ?? VAZIA, () => VAZIA)
}

// ── o selo ───────────────────────────────────────────────────────────────────────────────────
export function EtiquetaChip({ etiqueta, onTirar, pequena, className }: {
  etiqueta: Etiqueta; onTirar?: () => void; pequena?: boolean; className?: string
}) {
  return (
    <span data-etiqueta={etiqueta.id} title={etiqueta.nome}
      className={cn('inline-flex max-w-full items-center gap-1 rounded-full font-semibold',
        pequena ? 'px-1.5 py-0.5 text-[9.5px] leading-none' : 'px-2 py-0.5 text-[11px]',
        CLASSE_DA_COR[etiqueta.cor], className)}>
      <span className="truncate">{etiqueta.nome}</span>
      {onTirar && (
        <button type="button" aria-label={`Tirar ${etiqueta.nome}`} data-tirar-etiqueta={etiqueta.id}
          onClick={(e) => { e.stopPropagation(); onTirar() }} className="-mr-0.5 rounded-full opacity-70 hover:opacity-100">
          <X size={11} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}

/** As etiquetas de um contato numa linha (cartão do quadro, lista da Comunicação). */
export function EtiquetasDoContato({ ids, max = 3, className }: { ids: number[] | null | undefined; max?: number; className?: string }) {
  const todas = useEtiquetas()
  const lista = etiquetasDoContato(ids, todas)
  if (!lista.length) return null
  const resto = lista.length - max
  return (
    // <span>: também mora dentro de <button> (item da lista da Comunicação).
    <span data-etiquetas-do-contato className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {lista.slice(0, max).map((e) => <EtiquetaChip key={e.id} etiqueta={e} pequena />)}
      {resto > 0 && <span className="text-[9.5px] font-semibold text-ink-3" title={lista.slice(max).map((e) => e.nome).join(', ')}>+{resto}</span>}
    </span>
  )
}

// ── um menu que abre embaixo do botão e fecha com clique fora / Esc ───────────────────────────
function Menu({ aberto, onFechar, children, alinhar = 'esquerda', largura = 240 }: {
  aberto: boolean; onFechar: () => void; children: ReactNode; alinhar?: 'esquerda' | 'direita'; largura?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onFechar() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div ref={ref} style={{ width: largura }} onClick={(e) => e.stopPropagation()}
      className={cn('absolute top-full z-50 mt-1 max-h-80 overflow-auto rounded-card border border-line bg-card p-1.5 shadow-[0_12px_32px_-12px_rgba(21,24,28,0.25)]',
        alinhar === 'direita' ? 'right-0' : 'left-0')}>
      {children}
    </div>
  )
}

/**
 * Filtro por etiqueta: cada clique numa etiqueta passa por neutro → contém → não contém.
 * "Contém" = alguma das marcadas; "não contém" = nenhuma das marcadas.
 */
export function FiltroEtiquetasBotao({ valor, onChange, alinhar, className }: {
  valor: FiltroEtiquetas; onChange: (f: FiltroEtiquetas) => void; alinhar?: 'esquerda' | 'direita'; className?: string
}) {
  const todas = useEtiquetas()
  const [aberto, setAberto] = useState(false)
  const ativo = filtroEtiquetasAtivo(valor)
  const n = valor.com.length + valor.sem.length
  return (
    <div className={cn('relative', className)}>
      <button type="button" data-filtro-etiquetas onClick={() => setAberto((x) => !x)}
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-[12.5px] font-medium',
          ativo ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-card text-ink-2 hover:text-ink')}>
        <Tag size={13} strokeWidth={1.8} />
        Etiquetas{ativo ? ` · ${n}` : ''}
        <ChevronDown size={13} strokeWidth={1.8} />
      </button>
      <Menu aberto={aberto} onFechar={() => setAberto(false)} alinhar={alinhar} largura={260}>
        <p className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-ink-3">
          Clique para <b className="text-ink-2">contém</b>; de novo, <b className="text-ink-2">não contém</b>; de novo, tira.
        </p>
        {todas.length === 0 && <p className="px-2 py-2 text-[12px] text-ink-3">Nenhuma etiqueta criada. Dono ou admin cria em Configurações → Etiquetas.</p>}
        {todas.map((e) => {
          const estado = valor.com.includes(e.id) ? 'com' : valor.sem.includes(e.id) ? 'sem' : null
          return (
            <button key={e.id} type="button" data-filtro-etiqueta={e.id} data-estado={estado ?? 'nada'}
              onClick={() => onChange(alternarNoFiltro(valor, e.id))}
              className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-ink/[0.04]">
              <span className={cn('grid h-4 w-4 flex-none place-items-center rounded border',
                estado === 'com' ? 'border-accent bg-accent text-white' : estado === 'sem' ? 'border-bad bg-bad text-white' : 'border-line')}>
                {estado === 'com' && <Check size={11} strokeWidth={2.4} />}
                {estado === 'sem' && <Minus size={11} strokeWidth={2.4} />}
              </span>
              <EtiquetaChip etiqueta={e} pequena className="min-w-0" />
              <span className="ml-auto flex-none text-[10.5px] text-ink-3">{estado === 'com' ? 'contém' : estado === 'sem' ? 'não contém' : ''}</span>
            </button>
          )
        })}
        {ativo && (
          <button type="button" onClick={() => onChange(FILTRO_ETIQUETAS_VAZIO)}
            className="mt-1 w-full rounded-control px-2 py-1.5 text-left text-[12px] font-medium text-ink-2 hover:bg-ink/[0.04]">
            Limpar filtro de etiqueta
          </button>
        )}
      </Menu>
    </div>
  )
}

/**
 * O mesmo filtro numa linha de selos (sem menu suspenso): para caixas que cortam o que sai
 * delas, como a busca (⌘K). Clique: neutro → contém → não contém → neutro.
 */
export function FiltroEtiquetasLinha({ valor, onChange, className }: {
  valor: FiltroEtiquetas; onChange: (f: FiltroEtiquetas) => void; className?: string
}) {
  const todas = useEtiquetas()
  if (!todas.length) return null
  return (
    <div data-filtro-etiquetas-linha className={cn('flex items-center gap-1.5 overflow-x-auto scrollbar-thin', className)}>
      <Tag size={12} strokeWidth={1.8} className="flex-none text-ink-3" />
      {todas.map((e) => {
        const estado = valor.com.includes(e.id) ? 'com' : valor.sem.includes(e.id) ? 'sem' : null
        return (
          <button key={e.id} type="button" data-filtro-etiqueta={e.id} data-estado={estado ?? 'nada'}
            title={estado === 'com' ? 'contém' : estado === 'sem' ? 'não contém' : 'clique: contém'}
            onClick={() => onChange(alternarNoFiltro(valor, e.id))}
            className={cn('flex flex-none items-center gap-1 rounded-full', estado === null && 'opacity-60 hover:opacity-100')}>
            {estado === 'sem' && <Minus size={11} strokeWidth={2.4} className="text-bad" />}
            {estado === 'com' && <Check size={11} strokeWidth={2.4} className="text-accent" />}
            <EtiquetaChip etiqueta={e} pequena className={estado === 'sem' ? 'line-through' : undefined} />
          </button>
        )
      })}
    </div>
  )
}

/** Botão que abre a lista de etiquetas para escolher uma (aplicar no card ou no lote). */
export function EscolherEtiqueta({ onEscolher, jaTem = [], rotulo = 'Etiqueta', alinhar, desabilitado, className }: {
  onEscolher: (e: Etiqueta) => void; jaTem?: number[]; rotulo?: string; alinhar?: 'esquerda' | 'direita'
  desabilitado?: boolean; className?: string
}) {
  const todas = useEtiquetas()
  const [aberto, setAberto] = useState(false)
  const livres = todas.filter((e) => !jaTem.includes(e.id))
  return (
    <div className={cn('relative', className)}>
      <button type="button" data-escolher-etiqueta disabled={desabilitado} onClick={() => setAberto((x) => !x)}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line px-2 text-[11px] font-medium text-ink-2 hover:text-ink disabled:opacity-50">
        <Plus size={11} strokeWidth={2} /> {rotulo}
      </button>
      <Menu aberto={aberto} onFechar={() => setAberto(false)} alinhar={alinhar}>
        {todas.length === 0 && <p className="px-2 py-2 text-[12px] text-ink-3">Nenhuma etiqueta criada. Dono ou admin cria em Configurações → Etiquetas.</p>}
        {todas.length > 0 && livres.length === 0 && <p className="px-2 py-2 text-[12px] text-ink-3">Já tem todas.</p>}
        {livres.map((e) => (
          <button key={e.id} type="button" data-opcao-etiqueta={e.id} onClick={() => { setAberto(false); onEscolher(e) }}
            className="flex w-full items-center rounded-control px-2 py-1.5 text-left hover:bg-ink/[0.04]">
            <EtiquetaChip etiqueta={e} pequena />
          </button>
        ))}
      </Menu>
    </div>
  )
}

/** Aplica ou tira uma etiqueta de negócios (card e lote). Devolve a resposta da rota ou o erro. */
export async function aplicarEtiqueta(negocios: number[], etiquetaId: number, aplicar: boolean): Promise<
  { ok: true; negocios: number[]; contatos: number[]; alcancados: number; pedidos: number } | { ok: false; erro: string }
> {
  const r = await fetch('/api/leads/etiquetas/aplicar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ negocios, etiqueta_id: etiquetaId, aplicar }),
  })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>
  if (!r.ok) return { ok: false, erro: String(j.error ?? `Erro ${r.status}`) }
  return { ok: true, negocios: (j.negocios as number[]) ?? [], contatos: (j.contatos as number[]) ?? [], alcancados: Number(j.alcancados) || 0, pedidos: Number(j.pedidos) || 0 }
}
