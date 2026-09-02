'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Phone, PhoneIncoming, PhoneOutgoing, Plus, Trash2, Loader2 } from 'lucide-react'
import { Input, Select, Button, Badge, notify } from '@/components/ui'

interface Chamada { id: number; direcao: string; resultado: string; observacao: string | null; created_at: string | null }

const RESULTADO: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutro' }> = {
  atendida: { label: 'Atendida', tone: 'ok' },
  nao_atendida: { label: 'Não atendida', tone: 'bad' },
  caixa_postal: { label: 'Caixa postal', tone: 'warn' },
  ocupado: { label: 'Ocupado', tone: 'warn' },
  retornar: { label: 'Retornar', tone: 'neutro' },
}
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

export function LeadChamadasPanel({ leadId }: { leadId: number }) {
  const supabase = createClient()
  const { resolverEmpresaId } = useEmpresa()
  const [itens, setItens] = useState<Chamada[]>([])
  const [carregou, setCarregou] = useState(false)
  const [direcao, setDirecao] = useState('saida')
  const [resultado, setResultado] = useState('atendida')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('chamadas').select('id, direcao, resultado, observacao, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(20)
    setItens((data ?? []) as Chamada[]); setCarregou(true)
  }, [leadId, supabase])
  useEffect(() => { carregar() }, [carregar])

  async function registrar() {
    const empresaId = await resolverEmpresaId()
    if (!empresaId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('chamadas').insert({
      empresa_id: empresaId, lead_id: leadId, usuario_id: user?.id ?? null,
      direcao, resultado, observacao: obs.trim() || null,
    })
    if (!error) {
      // A ligação é um contato → atualiza a última tratativa (reflete no timer do card).
      await supabase.from('leads').update({ ultima_tratativa: new Date().toISOString() }).eq('id', leadId)
    }
    setSalvando(false)
    if (error) { notify.bad('Erro ao registrar', error.message); return }
    notify.ok('Chamada registrada'); setObs(''); setResultado('atendida'); carregar()
  }

  async function remover(id: number) {
    const { error } = await supabase.from('chamadas').delete().eq('id', id)
    if (error) { notify.bad('Erro ao remover'); return }
    carregar()
  }

  if (!carregou) return <div className="p-4 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando chamadas…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="mb-3 flex items-center gap-2">
        <Phone size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Chamadas</span>
      </div>

      {itens.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {itens.map((c) => {
            const r = RESULTADO[c.resultado] ?? RESULTADO.atendida
            const Icon = c.direcao === 'entrada' ? PhoneIncoming : PhoneOutgoing
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-control border border-line p-2">
                <Icon size={14} strokeWidth={1.7} className="flex-none text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-ink-2">{c.direcao === 'entrada' ? 'Recebida' : 'Feita'} · <span className="num">{quando(c.created_at)}</span></div>
                  {c.observacao && <div className="truncate text-[11px] text-ink-3">{c.observacao}</div>}
                </div>
                <Badge tone={r.tone} className="shrink-0">{r.label}</Badge>
                <button type="button" onClick={() => remover(c.id)} className="shrink-0 text-ink-3 hover:text-bad" aria-label="Remover"><Trash2 size={13} strokeWidth={1.7} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select label="Direção" value={direcao} onChange={(e) => setDirecao(e.target.value)}>
          <option value="saida">Fiz a ligação</option>
          <option value="entrada">Recebi a ligação</option>
        </Select>
        <Select label="Resultado" value={resultado} onChange={(e) => setResultado(e.target.value)}>
          {Object.entries(RESULTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Input wrapperClassName="col-span-2" label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Resumo da conversa…" />
      </div>
      <Button className="mt-2.5 w-full" variant="outline" icon={<Plus size={15} strokeWidth={1.7} />} onClick={registrar} loading={salvando}>Registrar chamada</Button>
    </div>
  )
}
