'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui'
import { Loader2, Search } from 'lucide-react'

interface Sug { id: string; nome: string; telefone: string | null; origem: 'cliente' | 'lead' }
const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')

/**
 * Busca inteligente de cliente/lead: digita o nome → sugere quem é (clientes E
 * leads da empresa, RLS) → ao selecionar, preenche nome + telefone. Aceita nome
 * novo (digitação livre) quando não há correspondência.
 */
export function ClienteAutocomplete({ nome, onNome, onSelect, label = 'Cliente' }: {
  nome: string
  onNome: (v: string) => void
  /**
   * `cliente_id` vem preenchido SÓ quando o escolhido é um cliente cadastrado.
   * Lead e nome digitado à mão devolvem null: quem grava não pode inventar um
   * vínculo que não existe.
   */
  onSelect: (c: { nome: string; telefone: string; cliente_id: number | null }) => void
  label?: string
}) {
  const supabase = createClient()
  const [res, setRes] = useState<Sug[]>([])
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
      const [{ data: cls }, { data: lds }] = await Promise.all([
        supabase.from('clientes').select('id, nome, telefone').ilike('nome', `%${term}%`).eq('ativo', true).order('nome').limit(8),
        supabase.from('leads').select('id, nome, telefone').ilike('nome', `%${term}%`).eq('ativo', true).order('nome').limit(8),
      ])
      const merged: Sug[] = []
      const seen = new Set<string>()
      const key = (n: string, t: string | null) => (t && soDigitos(t) ? soDigitos(t) : n.toLowerCase().trim())
      for (const c of (cls ?? []) as { id: number; nome: string; telefone: string | null }[]) {
        const k = key(c.nome, c.telefone); if (seen.has(k)) continue
        seen.add(k); merged.push({ id: `c${c.id}`, nome: c.nome, telefone: c.telefone, origem: 'cliente' })
      }
      for (const l of (lds ?? []) as { id: number; nome: string | null; telefone: string | null }[]) {
        if (!l.nome) continue
        const k = key(l.nome, l.telefone); if (seen.has(k)) continue
        seen.add(k); merged.push({ id: `l${l.id}`, nome: l.nome, telefone: l.telefone, origem: 'lead' })
      }
      setRes(merged.slice(0, 10))
      setOpen(merged.length > 0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(id)
  }, [nome, supabase])

  useEffect(() => {
    function h(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function escolher(c: Sug) {
    skip.current = true
    onSelect({
      nome: c.nome,
      telefone: c.telefone ?? '',
      cliente_id: c.origem === 'cliente' ? Number(c.id.slice(1)) : null,
    })
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
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-medium text-ink">{c.nome}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${c.origem === 'cliente' ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent'}`}>{c.origem}</span>
              </span>
              {c.telefone && <span className="num shrink-0 text-[12px] text-ink-3">{c.telefone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
