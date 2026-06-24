'use client'

import { useEffect, useState } from 'react'
import { useEmpresa } from '@/lib/empresa-context'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, X, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

interface Uso {
  leads: number
  usuarios: number
}

export function LimiteBanner() {
  const { empresa } = useEmpresa()
  const [uso, setUso] = useState<Uso | null>(null)
  const [fechado, setFechado] = useState(false)

  useEffect(() => {
    if (!empresa) return
    const supabase = createClient()

    async function fetchUso() {
      const [{ count: leads }, { count: usuarios }] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresa!.id).eq('ativo', true),
        supabase.from('empresa_usuarios').select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresa!.id).eq('ativo', true),
      ])
      setUso({ leads: leads ?? 0, usuarios: usuarios ?? 0 })
    }

    fetchUso()
  }, [empresa])

  if (!empresa || !uso || fechado) return null

  const limiteLeads = empresa.limite_leads
  const limiteUsuarios = empresa.limite_usuarios

  const pctLeads = limiteLeads > 0 ? (uso.leads / limiteLeads) * 100 : 0
  const pctUsuarios = limiteUsuarios > 0 ? (uso.usuarios / limiteUsuarios) * 100 : 0

  const avisos: { label: string; pct: number; uso: number; limite: number }[] = []
  if (pctLeads >= 80 && limiteLeads > 0) {
    avisos.push({ label: 'leads', pct: pctLeads, uso: uso.leads, limite: limiteLeads })
  }
  if (pctUsuarios >= 80 && limiteUsuarios > 0) {
    avisos.push({ label: 'usuários', pct: pctUsuarios, uso: uso.usuarios, limite: limiteUsuarios })
  }

  if (avisos.length === 0) return null

  const critico = avisos.some(a => a.pct >= 100)

  return (
    <div
      className="flex items-center gap-3 px-5 py-2.5 text-sm shrink-0"
      style={{
        background: critico ? 'rgba(215,40,47,0.08)' : 'rgba(251,191,36,0.08)',
        borderBottom: `1px solid ${critico ? 'rgba(215,40,47,0.2)' : 'rgba(251,191,36,0.2)'}`,
      }}
    >
      <AlertTriangle
        size={14}
        className="shrink-0"
        style={{ color: critico ? '#D7282F' : '#FBBF24' }}
      />
      <span className="flex-1 text-xs" style={{ color: critico ? '#D7282F' : '#92400E' }}>
        {avisos.map((a, i) => (
          <span key={a.label}>
            {i > 0 && ' · '}
            <strong>{a.uso}/{a.limite}</strong> {a.label} usados
            {a.pct >= 100 ? ' — limite atingido' : ` (${Math.round(a.pct)}%)`}
          </span>
        ))}
      </span>
      <Link
        href="/planos"
        className="flex items-center gap-1 text-xs font-semibold shrink-0 hover:underline"
        style={{ color: critico ? '#D7282F' : '#92400E' }}
      >
        Fazer upgrade <ArrowUpRight size={12} />
      </Link>
      <button
        onClick={() => setFechado(true)}
        className="text-[#9AA7B6] hover:text-[#56657A] transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
