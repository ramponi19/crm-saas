'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui'
import { Loader2, Search } from 'lucide-react'

interface Prod { id: number; nome: string; preco: number | null }
const brl = (v: number | null) => (v ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '')

/**
 * Busca inteligente de produto: digita → sugere produtos do catálogo (RLS).
 * onSelect entrega nome + preço (pra opcionalmente preencher o valor). Aceita
 * texto livre quando não há correspondência (produto ainda não cadastrado).
 */
export function ProdutoAutocomplete({ value, onChange, onSelect, label = 'Produto interessado' }: {
  value: string
  onChange: (v: string) => void
  onSelect: (p: { id: number; nome: string; preco: number | null }) => void
  label?: string
}) {
  const supabase = createClient()
  const [res, setRes] = useState<Prod[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const skip = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (skip.current) { skip.current = false; return }
    const term = value.trim()
    if (term.length < 2) { setRes([]); setOpen(false); return }
    setLoading(true)
    const id = setTimeout(async () => {
      const { data } = await supabase.from('produtos')
        .select('id, nome, preco').ilike('nome', `%${term}%`).eq('ativo', true).order('nome').limit(8)
      setRes((data ?? []) as Prod[])
      setOpen((data ?? []).length > 0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(id)
  }, [value, supabase])

  useEffect(() => {
    function h(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function escolher(p: Prod) {
    skip.current = true
    onSelect({ id: p.id, nome: p.nome, preco: p.preco })
    setOpen(false); setRes([])
  }

  return (
    <div ref={boxRef} className="relative">
      <Input label={label} value={value} autoComplete="off" placeholder="Digite para buscar…"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (res.length) setOpen(true) }}
        icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} strokeWidth={1.7} />} />
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-control border border-line bg-card shadow-[0_16px_40px_-16px_rgba(21,24,28,0.3)]">
          {res.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)}
              className="flex w-full items-center justify-between gap-3 border-b border-line-soft px-3 py-2 text-left last:border-0 hover:bg-bg">
              <span className="truncate text-[13px] font-medium text-ink">{p.nome}</span>
              {p.preco != null && <span className="num shrink-0 text-[12px] text-ink-3">{brl(p.preco)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
