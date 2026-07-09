'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock3, Plus, Trash2, CalendarPlus } from 'lucide-react'
import { Card, Input, Button, notify } from '@/components/ui'

export interface Espera { id: number; nome: string; telefone: string | null; observacao: string | null; created_at: string | null }

/** Lista de espera simples (Saúde): pacientes aguardando encaixe na agenda. */
export function ListaEspera({ empresaId, onAgendar }: { empresaId: number; onAgendar?: (e: Espera) => void }) {
  const supabase = createClient()
  const [itens, setItens] = useState<Espera[]>([])
  const [carregou, setCarregou] = useState(false)
  const [form, setForm] = useState({ nome: '', telefone: '', observacao: '' })
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('lista_espera').select('id, nome, telefone, observacao, created_at').eq('empresa_id', empresaId).order('created_at')
    setItens((data ?? []) as Espera[]); setCarregou(true)
  }, [empresaId, supabase])
  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!form.nome.trim()) { notify.warn('Informe o nome'); return }
    setSalvando(true)
    const { error } = await supabase.from('lista_espera').insert({
      empresa_id: empresaId, nome: form.nome.trim(),
      telefone: form.telefone.trim() || null, observacao: form.observacao.trim() || null,
    })
    setSalvando(false)
    if (error) { notify.bad(error.message); return }
    setForm({ nome: '', telefone: '', observacao: '' }); carregar()
  }
  async function remover(id: number) {
    const { error } = await supabase.from('lista_espera').delete().eq('id', id)
    if (error) { notify.bad('Erro ao remover'); return }
    carregar()
  }
  const dias = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : 0)

  if (!carregou) return null

  return (
    <Card title={<span className="flex items-center gap-2"><Clock3 size={16} strokeWidth={1.7} className="text-accent" />Lista de espera {itens.length > 0 && <span className="num font-normal text-ink-3">({itens.length})</span>}</span>}>
      {itens.length === 0 ? (
        <p className="mb-3 text-[12.5px] text-ink-3">Ninguém aguardando encaixe.</p>
      ) : (
        <div className="mb-3 space-y-1.5">
          {itens.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-control border border-line p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{e.nome}</div>
                <div className="truncate text-[11px] text-ink-3">{[e.telefone, e.observacao].filter(Boolean).join(' · ') || '—'} · há {dias(e.created_at)}d</div>
              </div>
              {onAgendar && <Button variant="outline" size="sm" icon={<CalendarPlus size={13} strokeWidth={1.7} />} onClick={() => onAgendar(e)}>Agendar</Button>}
              <button type="button" onClick={() => remover(e.id)} className="shrink-0 text-ink-3 hover:text-bad" aria-label="Remover"><Trash2 size={14} strokeWidth={1.7} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input wrapperClassName="col-span-2" label="Nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome do paciente" />
        <Input label="Telefone" className="num" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
        <Input label="Preferência" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Ex: manhã" />
      </div>
      <Button className="mt-2.5 w-full" variant="outline" icon={<Plus size={14} strokeWidth={1.7} />} onClick={adicionar} loading={salvando}>Adicionar à espera</Button>
    </Card>
  )
}
