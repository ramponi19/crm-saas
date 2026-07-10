'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Repeat, Plus, LogOut, Loader2, Clock } from 'lucide-react'
import { Select, Button, Badge, notify } from '@/components/ui'

interface Insc { id: number; cadencia_id: number; passo_ordem: number; proxima_acao_em: string | null }
interface Cad { id: number; nome: string }

const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—')
const venceu = (iso: string | null) => {
  if (!iso) return false
  const h = new Date(); h.setHours(23, 59, 59, 999)
  return new Date(iso) <= h
}

export function LeadCadenciaPanel({ leadId }: { leadId: number }) {
  const supabase = createClient()
  const [cadencias, setCadencias] = useState<Cad[]>([])
  const [inscricoes, setInscricoes] = useState<Insc[]>([])
  const [carregou, setCarregou] = useState(false)
  const [escolha, setEscolha] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: cads }, { data: inscs }] = await Promise.all([
      supabase.from('cadencias').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('cadencia_inscricoes').select('id, cadencia_id, passo_ordem, proxima_acao_em').eq('lead_id', leadId).eq('status', 'ativa'),
    ])
    setCadencias((cads ?? []) as Cad[])
    setInscricoes((inscs ?? []) as Insc[])
    setCarregou(true)
  }, [leadId, supabase])
  useEffect(() => { carregar() }, [carregar])

  const nomePorId = Object.fromEntries(cadencias.map((c) => [c.id, c.nome])) as Record<number, string>
  const jaAtivas = new Set(inscricoes.map((i) => i.cadencia_id))
  const disponiveis = cadencias.filter((c) => !jaAtivas.has(c.id))

  async function inscrever() {
    if (!escolha) { notify.warn('Escolha uma cadência'); return }
    setSalvando(true)
    const r = await fetch('/api/cadencias/inscrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, cadenciaId: Number(escolha) }) })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Não foi possível inscrever', j.error); return }
    notify.ok('Lead inscrito na cadência'); setEscolha(''); carregar()
  }

  async function sair(inscricaoId: number) {
    const r = await fetch('/api/cadencias/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inscricaoId, tipo: 'sair' }) })
    if (!r.ok) { notify.bad('Erro ao remover'); return }
    carregar()
  }

  if (!carregou) return <div className="border-t border-line-soft pt-4 mt-1 p-1 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando cadências…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="mb-3 flex items-center gap-2">
        <Repeat size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Cadência</span>
      </div>

      {inscricoes.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {inscricoes.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-control border border-line p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">{nomePorId[i.cadencia_id] ?? 'Cadência'}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <Clock size={11} strokeWidth={1.8} /> Passo {i.passo_ordem} · próxima ação <span className="num">{dia(i.proxima_acao_em)}</span>
                </div>
              </div>
              {venceu(i.proxima_acao_em) && <Badge tone="warn" className="shrink-0">Na fila</Badge>}
              <button type="button" onClick={() => sair(i.id)} className="shrink-0 text-ink-3 hover:text-bad" aria-label="Sair da cadência"><LogOut size={13} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}

      {cadencias.length === 0 ? (
        <p className="text-[12px] text-ink-3">Nenhuma cadência criada ainda. Crie em Sistema → Cadências.</p>
      ) : disponiveis.length === 0 ? (
        <p className="text-[12px] text-ink-3">O lead já está em todas as cadências disponíveis.</p>
      ) : (
        <div className="flex items-end gap-2">
          <Select wrapperClassName="flex-1" label="Inscrever em" value={escolha} onChange={(e) => setEscolha(e.target.value)}>
            <option value="">Selecionar cadência…</option>
            {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Button variant="outline" icon={<Plus size={15} strokeWidth={1.7} />} onClick={inscrever} loading={salvando}>Inscrever</Button>
        </div>
      )}
    </div>
  )
}
