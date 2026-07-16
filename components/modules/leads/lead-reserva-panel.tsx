'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Package, Search, Loader2, X, Clock } from 'lucide-react'
import { Input, Badge, notify } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

// Reserva de unidade do estoque para o lead: busca o estoque disponível com
// todos os descritivos (cor, armazenamento, bateria, condição) e trava a peça
// por 48h. A venda é finalizada no PDV, na aba Reservas.

interface UnidadeDisp {
  id: number
  cor: string | null
  armazenamento: string | null
  bateria: string | null
  condicao: string | null
  estado: string | null
  imei: string | null
  numero_serie: string | null
  preco_venda: number | null
  produto_nome: string
  marca_nome: string
}

interface Reservada {
  id: number
  produto_nome: string
  cor: string | null
  armazenamento: string | null
  condicao: string | null
  preco_venda: number | null
  reserva_expira_em: string | null
}

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

const CONDICAO_TONE: Record<string, 'acc' | 'warn' | 'neutro' | 'bad'> = {
  novo: 'acc', seminovo: 'warn', usado: 'neutro', defeito: 'bad',
}

function horasRestantes(iso: string | null): string {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expirada'
  const h = Math.floor(ms / 3600_000)
  return h >= 1 ? `expira em ${h}h` : `expira em ${Math.max(1, Math.round(ms / 60_000))}min`
}

export function LeadReservaPanel({ leadId, onReservado }: { leadId: number; onReservado?: (descricao: string) => void }) {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<UnidadeDisp[]>([])
  const [buscando, setBuscando] = useState(false)
  const [reservadas, setReservadas] = useState<Reservada[]>([])
  const [agindo, setAgindo] = useState<number | null>(null)

  const carregarReservas = useCallback(async () => {
    const { data } = await supabase
      .from('inventario_unidades')
      .select('id, cor, armazenamento, condicao, preco_venda, reserva_expira_em, produtos!produto_id(nome)')
      .eq('reservado_lead_id', leadId)
      .eq('status', 'reservado')
    type Row = Omit<Reservada, 'produto_nome'> & { produtos: Embed<{ nome: string | null }> }
    setReservadas(((data ?? []) as unknown as Row[]).map((r) => ({ ...r, produto_nome: one(r.produtos)?.nome ?? '—' })))
  }, [leadId, supabase])
  useEffect(() => { carregarReservas() }, [carregarReservas])

  // Busca com debounce no estoque disponível (unidades reais, não catálogo).
  useEffect(() => {
    const q = busca.trim()
    if (q.length < 2) { setResultados([]); return }
    setBuscando(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('inventario_unidades')
        .select('id, cor, armazenamento, bateria, condicao, estado, imei, numero_serie, preco_venda, produtos!produto_id!inner(nome, marcas_produtos!marca_id(nome))')
        .eq('status', 'disponivel')
        .eq('ativo', true)
        .ilike('produtos.nome', `%${q}%`)
        .limit(12)
      type Row = Omit<UnidadeDisp, 'produto_nome' | 'marca_nome'> & { produtos: Embed<{ nome: string | null; marcas_produtos: Embed<{ nome: string | null }> }> }
      setResultados(((data ?? []) as unknown as Row[]).map((r) => {
        const prod = one(r.produtos)
        return { ...r, produto_nome: prod?.nome ?? '—', marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? '' }
      }))
      setBuscando(false)
    }, 350)
    return () => clearTimeout(t)
  }, [busca, supabase])

  async function reservar(u: UnidadeDisp) {
    setAgindo(u.id)
    try {
      const r = await fetch('/api/reservas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidadeId: u.id, leadId }),
      })
      const j = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Não foi possível reservar')
      notify.ok('Unidade reservada por 48h', 'Finalize a venda no PDV, aba Reservas.')
      if ((j as { descricao?: string }).descricao && onReservado) onReservado((j as { descricao: string }).descricao)
      setBusca(''); setResultados([])
      carregarReservas()
    } catch (e) {
      notify.bad('Erro ao reservar', e instanceof Error ? e.message : 'Tente novamente.')
    } finally { setAgindo(null) }
  }

  async function cancelar(id: number) {
    setAgindo(id)
    try {
      const r = await fetch('/api/reservas', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidadeId: id }),
      })
      const j = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Não foi possível cancelar')
      notify.ok('Reserva cancelada', 'A unidade voltou para o estoque disponível.')
      carregarReservas()
    } catch (e) {
      notify.bad('Erro ao cancelar', e instanceof Error ? e.message : 'Tente novamente.')
    } finally { setAgindo(null) }
  }

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="mb-3 flex items-center gap-2">
        <Package size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Reservar do estoque</span>
      </div>

      {reservadas.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {reservadas.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-control border border-accent/30 bg-accent-soft p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">
                  {r.produto_nome}{r.armazenamento ? ` · ${r.armazenamento}` : ''}{r.cor ? ` · ${r.cor}` : ''}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <Clock size={11} strokeWidth={1.8} />
                  <span className="num">{formatCurrency(r.preco_venda ?? 0)}</span> · {horasRestantes(r.reserva_expira_em)}
                </div>
              </div>
              <Badge tone="acc" className="shrink-0">Reservado</Badge>
              <button
                type="button"
                onClick={() => cancelar(r.id)}
                disabled={agindo === r.id}
                className="-m-1 shrink-0 p-1 text-ink-3 hover:text-bad disabled:opacity-40"
                aria-label="Cancelar reserva"
              >
                {agindo === r.id ? <Loader2 size={13} strokeWidth={1.7} className="animate-spin" /> : <X size={13} strokeWidth={1.7} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <Input
        icon={buscando ? <Loader2 size={14} strokeWidth={1.7} className="animate-spin" /> : <Search size={14} strokeWidth={1.7} />}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar no estoque… ex.: iPhone 14 Pro"
      />

      {resultados.length > 0 && (
        <div className="mt-2 max-h-[260px] space-y-1.5 overflow-y-auto scrollbar-thin">
          {resultados.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => reservar(u)}
              disabled={agindo !== null}
              className="flex w-full items-center gap-2 rounded-control border border-line p-2 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">
                  {u.produto_nome}{u.armazenamento ? ` · ${u.armazenamento}` : ''}
                </div>
                <div className="truncate text-[11px] text-ink-3">
                  {[u.cor, u.bateria ? `bateria ${u.bateria}%` : null, u.estado].filter(Boolean).join(' · ') || u.marca_nome}
                </div>
              </div>
              {u.condicao && <Badge tone={CONDICAO_TONE[u.condicao] ?? 'neutro'} className="shrink-0 capitalize">{u.condicao}</Badge>}
              <span className="num shrink-0 text-[12.5px] font-semibold text-ink">{formatCurrency(u.preco_venda ?? 0)}</span>
              {agindo === u.id && <Loader2 size={13} strokeWidth={1.7} className="shrink-0 animate-spin text-accent" />}
            </button>
          ))}
        </div>
      )}
      {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
        <p className="mt-2 text-[12px] text-ink-3">Nenhuma unidade disponível para “{busca.trim()}”.</p>
      )}
    </div>
  )
}
