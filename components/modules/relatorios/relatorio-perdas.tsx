'use client'

import { useEffect, useState } from 'react'
import { TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui'

interface PerdaRow {
  id: number
  nome: string | null
  perdido_em: string | null
  responsavel_id: string | null
  motivo: { label: string | null } | { label: string | null }[] | null
}

interface Barra { label: string; valor: number }

function Breakdown({ titulo, dados }: { titulo: string; dados: Barra[] }) {
  const max = Math.max(1, ...dados.map(d => d.valor))
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{titulo}</div>
      {dados.length === 0 ? (
        <p className="text-[13px] text-ink-3">Sem dados.</p>
      ) : (
        <div className="space-y-2">
          {dados.map(d => (
            <div key={d.label}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="truncate pr-2 text-ink-2">{d.label}</span>
                <span className="num font-semibold text-ink">{d.valor}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-full bg-bad" style={{ width: `${(d.valor / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RelatorioPerdas() {
  const supabase = createClient()
  const [carregando, setCarregando] = useState(true)
  const [porMotivo, setPorMotivo] = useState<Barra[]>([])
  const [porResp, setPorResp] = useState<Barra[]>([])
  const [porMes, setPorMes] = useState<Barra[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, nome, perdido_em, responsavel_id, motivo:motivos_perda(label)')
        .not('perdido_em', 'is', null)
        .order('perdido_em', { ascending: false })
        .limit(1000)

      const rows = (data ?? []) as unknown as PerdaRow[]

      // nomes dos responsáveis
      const { data: membros } = await supabase
        .from('empresa_usuarios')
        .select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)')
        .eq('ativo', true)
      const nomePorId = new Map<string, string>()
      for (const m of (membros ?? []) as Array<{ usuario_id: string; usuarios: { nome: string | null } | { nome: string | null }[] | null }>) {
        const u = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios
        if (u?.nome) nomePorId.set(m.usuario_id, u.nome)
      }

      const mMotivo = new Map<string, number>()
      const mResp = new Map<string, number>()
      const mMes = new Map<string, number>()
      for (const r of rows) {
        const mot = Array.isArray(r.motivo) ? r.motivo[0] : r.motivo
        const motivoLabel = mot?.label ?? 'Sem motivo'
        mMotivo.set(motivoLabel, (mMotivo.get(motivoLabel) ?? 0) + 1)
        const resp = r.responsavel_id ? (nomePorId.get(r.responsavel_id) ?? 'Outro') : 'Sem responsável'
        mResp.set(resp, (mResp.get(resp) ?? 0) + 1)
        if (r.perdido_em) {
          const d = new Date(r.perdido_em)
          const chave = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          mMes.set(chave, (mMes.get(chave) ?? 0) + 1)
        }
      }

      const ord = (m: Map<string, number>) => [...m.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
      setPorMotivo(ord(mMotivo))
      setPorResp(ord(mResp))
      setPorMes([...mMes.entries()].map(([label, valor]) => ({ label, valor })))
      setTotal(rows.length)
      setCarregando(false)
    })()
  }, [supabase])

  if (carregando) return null

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <TrendingDown size={17} strokeWidth={1.7} className="text-bad" />
          Perdas
        </span>
      }
      actions={<span className="num text-[13px] text-ink-2">{total} lead{total === 1 ? '' : 's'} perdido{total === 1 ? '' : 's'}</span>}
    >
      {total === 0 ? (
        <p className="py-2 text-[13px] text-ink-3">Nenhuma perda registrada ainda.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Breakdown titulo="Por motivo" dados={porMotivo} />
          <Breakdown titulo="Por responsável" dados={porResp} />
          <Breakdown titulo="Por mês" dados={porMes} />
        </div>
      )}
    </Card>
  )
}
