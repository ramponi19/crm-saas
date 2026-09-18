'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, Plus, Target, Zap, LayoutDashboard, Users, ScanBarcode, Boxes, CornerDownLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SearchResult {
  tipo: 'cliente' | 'lead' | 'estoque'
  id: number | string
  titulo: string
  sub: string
  href: string
}

interface Acao {
  id: string
  label: string
  icon: typeof Plus
  run: (router: ReturnType<typeof useRouter>) => void
}

const ACOES: Acao[] = [
  { id: 'venda', label: 'Nova venda no PDV', icon: Plus, run: (r) => r.push('/pdv') },
  { id: 'lead', label: 'Novo lead', icon: Target, run: (r) => r.push('/leads') },
  { id: 'pix', label: 'Gerar cobrança Pix', icon: Zap, run: (r) => r.push('/pdv') },
  { id: 'go-dash', label: 'Ir para Dashboard', icon: LayoutDashboard, run: (r) => r.push('/dashboard') },
  { id: 'go-clientes', label: 'Ir para Clientes', icon: Users, run: (r) => r.push('/clientes') },
  { id: 'go-pdv', label: 'Ir para PDV', icon: ScanBarcode, run: (r) => r.push('/pdv') },
  { id: 'go-estoque', label: 'Ir para Estoque', icon: Boxes, run: (r) => r.push('/estoque') },
]

const TIPO_LABEL: Record<string, string> = { cliente: 'Cliente', lead: 'Lead', estoque: 'Estoque' }

/**
 * QUANTO SE BUSCA vs. QUANTO SE MOSTRA.
 *
 * Eram 4 por tipo, direto do banco e SEM `order` — o Postgres devolvia quatro
 * quaisquer, na ordem física da tabela. Quem tem 80 leads digitava um nome,
 * recebia quatro que não tinham nada a ver e concluía que a busca não achava:
 * "puxa apenas 4 e trava nisso" (18/09/2026).
 *
 * Agora o banco devolve um lote maior, a relevância é decidida aqui e a lista
 * mostra os melhores. A paleta é atalho, não relatório: passar de ~8 por tipo
 * vira rolagem, e para varrer tudo existem as telas de Leads e Clientes.
 */
const LOTE = 20
const MOSTRAR = 8

/** Começa com o termo > tem palavra que começa com ele > contém em algum lugar. */
function relevancia(nome: string | null, termo: string): number {
  const n = (nome ?? '').toLowerCase()
  const t = termo.toLowerCase()
  if (n.startsWith(t)) return 0
  if (n.includes(' ' + t)) return 1
  return 2
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [temMais, setTemMais] = useState(false)
  const [sel, setSel] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Atalho global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  // Busca com debounce (portada do topbar)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim() || query.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      const q = query.trim()
      const [{ data: clientes }, { data: leads }, { data: estoque }, { data: produtosMatch }] = await Promise.all([
        supabase.from('clientes').select('id, nome, telefone').or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`).eq('ativo', true).order('nome').limit(LOTE),
        // O lead também atende por telefone: quem liga para a loja é procurado pelo
        // número, e antes só quem já era cliente aparecia nessa busca.
        supabase.from('leads').select('id, nome, produto_interessado, telefone, ultima_mensagem_at').or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`).eq('ativo', true).order('ultima_mensagem_at', { ascending: false, nullsFirst: false }).limit(LOTE),
        supabase.from('inventario_unidades').select('id, imei, numero_serie, produtos!produto_id(nome)').or(`imei.ilike.%${q}%,numero_serie.ilike.%${q}%`).eq('ativo', true).limit(LOTE),
        supabase.from('produtos').select('id').ilike('nome', `%${q}%`).limit(10),
      ])
      type EstoqueRow = { id: number; imei: string | null; numero_serie: string | null; produtos: { nome: string | null } | { nome: string | null }[] | null }
      const produtoIds = ((produtosMatch ?? []) as Array<{ id: number }>).map((p) => p.id)
      let estoqueNome: EstoqueRow[] = []
      if (produtoIds.length > 0) {
        const { data } = await supabase
          .from('inventario_unidades')
          .select('id, imei, numero_serie, produtos!produto_id(nome)')
          .in('produto_id', produtoIds).eq('ativo', true).limit(LOTE)
        estoqueNome = (data ?? []) as unknown as EstoqueRow[]
      }
      const allEstoque = [...((estoque ?? []) as unknown as EstoqueRow[]), ...estoqueNome]
      const seen = new Set<number>()
      const estoqueDedup = allEstoque.filter((u) => { if (seen.has(u.id)) return false; seen.add(u.id); return true }).slice(0, MOSTRAR)
      const estNome = (r: EstoqueRow['produtos']): string | null => (Array.isArray(r) ? r[0]?.nome : r?.nome) ?? null

      const porRelevancia = <T extends { nome: string | null }>(xs: T[]) =>
        [...xs].sort((a, b) => relevancia(a.nome, q) - relevancia(b.nome, q))

      const cli = porRelevancia((clientes ?? []) as Array<{ id: number; nome: string | null; telefone: string | null }>)
      const lds = porRelevancia((leads ?? []) as Array<{ id: number; nome: string | null; produto_interessado: string | null; telefone: string | null }>)
      setTemMais(cli.length > MOSTRAR || lds.length > MOSTRAR)

      setResults([
        ...cli.slice(0, MOSTRAR).map((c) => ({ tipo: 'cliente' as const, id: c.id, titulo: c.nome ?? `Cliente #${c.id}`, sub: c.telefone ?? 'sem telefone', href: '/clientes' })),
        // `?lead=` abre a conversa. Sem isso o resultado mandava para `/leads`
        // seco — e quem já estava em /leads clicava no próprio resultado e nada
        // acontecia, porque `router.push` para a rota atual não faz nada.
        ...lds.slice(0, MOSTRAR).map((l) => ({ tipo: 'lead' as const, id: l.id, titulo: l.nome ?? `Lead #${l.id}`, sub: l.produto_interessado ?? l.telefone ?? 'sem produto', href: `/leads?lead=${l.id}` })),
        ...estoqueDedup.map((u) => ({ tipo: 'estoque' as const, id: u.id, titulo: estNome(u.produtos) ?? `Unidade #${u.id}`, sub: u.imei ?? u.numero_serie ?? '—', href: '/estoque' })),
      ])
      setSel(0)
      setSearching(false)
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query])

  const acoesFiltradas = query.trim().length >= 2
    ? ACOES.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    : ACOES.slice(0, 3)
  const flat = [...acoesFiltradas.map((a) => ({ kind: 'acao' as const, a })), ...results.map((r) => ({ kind: 'result' as const, r }))]

  const exec = useCallback((i: number) => {
    const row = flat[i]
    if (!row) return
    onOpenChange(false)
    if (row.kind === 'acao') row.a.run(router)
    else router.push(row.r.href)
  }, [flat, onOpenChange, router])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); exec(sel) }
    else if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false) }
  }

  if (!open || typeof document === 'undefined') return null

  let idx = -1
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/30 px-4 pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false) }}
    >
      <div className="w-[540px] max-w-[92vw] overflow-hidden rounded-modal border border-line bg-card shadow-[0_30px_70px_-20px_rgba(21,24,28,0.4)] animate-[uiPop_0.16s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4">
          <Search size={17} strokeWidth={1.7} className="text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar cliente, venda, produto… ou digite uma ação"
            className="w-full bg-transparent py-3.5 text-[14.5px] text-ink placeholder:text-ink-3 outline-none"
          />
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5 scrollbar-thin">
          {acoesFiltradas.length > 0 && (
            <>
              <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">Ações rápidas</div>
              {acoesFiltradas.map((a) => {
                idx++
                const i = idx
                const Icon = a.icon
                return (
                  <button
                    key={a.id}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => exec(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] ${sel === i ? 'bg-accent-soft' : ''}`}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-[6px] border border-line-soft bg-raised text-ink-2"><Icon size={13} strokeWidth={1.7} /></span>
                    <span className="flex-1 font-medium text-ink">{a.label}</span>
                    {sel === i && <CornerDownLeft size={13} strokeWidth={1.7} className="text-ink-3" />}
                  </button>
                )
              })}
            </>
          )}

          {(results.length > 0 || searching) && (
            <div className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">Resultados</div>
          )}
          {searching && results.length === 0 && <div className="px-4 py-2 text-[12px] text-ink-3">Buscando…</div>}
          {results.map((r) => {
            idx++
            const i = idx
            return (
              <button
                key={`${r.tipo}-${r.id}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => exec(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${sel === i ? 'bg-accent-soft' : ''}`}
              >
                <span className="rounded-[6px] bg-ink/[0.05] px-2 py-0.5 text-[10px] font-semibold text-ink-2">{TIPO_LABEL[r.tipo]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{r.titulo}</span>
                  <span className="block truncate text-[11px] text-ink-3">{r.sub}</span>
                </span>
              </button>
            )
          })}
          {temMais && !searching && (
            <div className="px-4 py-2 text-[11px] text-ink-3">
              Mostrando os mais relevantes. Refine a busca, ou abra Leads e Clientes para a lista inteira.
            </div>
          )}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div className="px-4 py-2 text-[12px] text-ink-3">Nenhum resultado para “{query}”.</div>
          )}
        </div>

        <div className="flex gap-3.5 border-t border-line-soft px-4 py-2 text-[10.5px] font-medium text-ink-3">
          <span>↑↓ navegar</span><span>↵ abrir</span><span>esc fechar</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
