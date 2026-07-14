'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui'
import { Loader2, Search } from 'lucide-react'

interface Cli { id: number; nome: string; telefone: string | null }

/**
 * Busca inteligente de cliente: digita o nome → sugere quem é (clientes da
 * empresa, RLS) → ao selecionar, preenche nome + telefone. Aceita nome novo
 * (digitação livre) quando não há correspondência.
 */
export function ClienteAutocomplete({ nome, onNome, onSelect, label = 'Cliente' }: {
  nome: string
  onNome: (v: string) => void
  onSelect: (c: { nome: string; telefone: string }) => void
  label?: string
}) {
  const supabase = createClient()
  const [res, setRes] = useState<Cli[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const skip = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (skip.current) { skip.current = false; return }
    const term = nome.trim()
    if (term.length < 2) { setRes([]); setOpen(false); return }
    setLoading(true)
    const id = setTimeout(async () => {
      const { data } = await supabase.from('clientes')
        .select('id, nome, telefone').ilike('nome', `%${term}%`).eq('ativo', true).order('nome').limit(8)
      setRes((data ?? []) as Cli[])
      setOpen((data ?? []).length > 0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(id)
  }, [nome, supabase])

  useEffect(() => {
    function h(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function escolher(c: Cli) {
    skip.current = true
    onSelect({ nome: c.nome, telefone: c.telefone ?? '' })
    setOpen(false); setRes([])
  }

  return (
    <div ref={boxRef} className="relative">
      <Input label={label} value={nome} autoComplete="off" placeholder="Digite para buscar…"
        onChange={(e) => onNome(e.target.value)}
        onFocus={() => { if (res.length) setOpen(true) }}
        icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} strokeWidth={1.7} />} />
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-control border border-line bg-card shadow-[0_16px_40px_-16px_rgba(21,24,28,0.3)]">
          {res.map((c) => (
            <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(c)}
              className="flex w-full items-center justify-between gap-3 border-b border-line-soft px-3 py-2 text-left last:border-0 hover:bg-bg">
              <span className="truncate text-[13px] font-medium text-ink">{c.nome}</span>
              {c.telefone && <span className="num shrink-0 text-[12px] text-ink-3">{c.telefone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
