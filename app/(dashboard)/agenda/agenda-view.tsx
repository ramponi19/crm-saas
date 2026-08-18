'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Clock, MapPin, Phone, CalendarDays } from 'lucide-react'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, notify } from '@/components/ui'
import { ListaEspera, type Espera } from '@/components/modules/saude/lista-espera'
import type { Tables } from '@/types/database'

type Visita = Tables<'visitas'> & { lead_nome: string | null; lead_tel: string | null; imovel_nome: string | null; imovel_bairro: string | null }
type Opt = { id: number; nome: string | null }
type UsuarioMin = { id: string; nome: string }
type Tone = 'acc' | 'ok' | 'bad' | 'warn'

const STATUS: { v: string; l: string; tone: Tone }[] = [
  { v: 'agendada', l: 'Agendada', tone: 'acc' },
  { v: 'realizada', l: 'Realizada', tone: 'ok' },
  { v: 'cancelada', l: 'Cancelada', tone: 'bad' },
  { v: 'no_show', l: 'Não compareceu', tone: 'warn' },
]
const stInfo = (s: string) => STATUS.find(x => x.v === s) ?? STATUS[0]
const diaLabel = (iso: string) => {
  const d = new Date(iso); const hoje = new Date()
  const key = (x: Date) => x.toISOString().slice(0, 10)
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  if (key(d) === key(hoje)) return 'Hoje'
  if (key(d) === key(amanha)) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function AgendaView({ inicial, leads, imoveis, usuarios, empresaId, meuId, isGestor, segmento }: {
  inicial: Visita[]; leads: Opt[]; imoveis: Opt[]; usuarios: UsuarioMin[]; empresaId: number; meuId: string; isGestor: boolean; segmento?: string | null
}) {
  const supabase = createClient()
  // Os rótulos da agenda (consulta/paciente/profissional) são o comportamento;
  // saúde é só quem o usa hoje.
  const isSaude = !!SEGMENTOS[normalizarSegmento(segmento)].capacidades.agendaClinica
  const L = {
    agendar: isSaude ? 'Agendar consulta' : 'Agendar visita',
    item: isSaude ? 'Consulta' : 'Visita',
    pessoa: isSaude ? 'Paciente' : 'Lead / cliente',
    prof: isSaude ? 'Profissional' : 'Corretor',
  }
  const [lista, setLista] = useState<Visita[]>(inicial)
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const vazio = { lead_id: '', imovel_id: '', corretor_id: meuId, data_hora: '', observacoes: '' }
  const [form, setForm] = useState(vazio)
  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Agendar retorno: reabre o modal com o paciente e uma data sugerida (+30 dias).
  function agendarRetorno(v: Visita) {
    const dt = new Date(Date.now() + 30 * 864e5)
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setForm({ ...vazio, lead_id: v.lead_id ? String(v.lead_id) : '', data_hora: local })
    setModal(true)
  }

  // Encaixar alguém da lista de espera: abre o modal com os dados na observação.
  function agendarDaEspera(e: Espera) {
    setForm({ ...vazio, observacoes: `${e.nome}${e.telefone ? ` · ${e.telefone}` : ''}${e.observacao ? ` — ${e.observacao}` : ''} (lista de espera)` })
    setModal(true)
  }

  async function salvar() {
    if (!form.data_hora) { notify.warn('Informe data e hora'); return }
    setLoading(true)
    const payload = {
      empresa_id: empresaId,
      lead_id: form.lead_id ? Number(form.lead_id) : null,
      imovel_id: form.imovel_id ? Number(form.imovel_id) : null,
      corretor_id: form.corretor_id || meuId,
      data_hora: new Date(form.data_hora).toISOString(),
      status: 'agendada',
      observacoes: form.observacoes || null,
    }
    const { data, error } = await supabase.from('visitas').insert(payload).select('*, leads(nome, telefone), imoveis(titulo, codigo, bairro)').single()
    setLoading(false)
    if (error) { notify.bad(error.message); return }
    const d = data as unknown as { leads?: { nome: string | null; telefone: string | null }; imoveis?: { titulo: string | null; codigo: string | null; bairro: string | null } } & Tables<'visitas'>
    const nova: Visita = { ...d, lead_nome: d.leads?.nome ?? null, lead_tel: d.leads?.telefone ?? null, imovel_nome: d.imoveis ? (d.imoveis.titulo || d.imoveis.codigo) : null, imovel_bairro: d.imoveis?.bairro ?? null }
    setLista(l => [...l, nova].sort((a, b) => a.data_hora.localeCompare(b.data_hora)))
    setForm(vazio); setModal(false)
    notify.ok(isSaude ? 'Consulta agendada' : 'Visita agendada')
  }

  async function mudarStatus(v: Visita, status: string) {
    const { error } = await supabase.from('visitas').update({ status }).eq('id', v.id)
    if (error) { notify.bad(error.message); return }
    setLista(l => l.map(x => x.id === v.id ? { ...x, status } : x))
  }

  // agrupa por dia
  const grupos: { label: string; itens: Visita[] }[] = []
  for (const v of lista) {
    const lbl = diaLabel(v.data_hora)
    const g = grupos.find(x => x.label === lbl)
    if (g) g.itens.push(v); else grupos.push({ label: lbl, itens: [v] })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Agenda" />

      <div className="flex shrink-0 items-center justify-end px-6 py-4">
        <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => { setForm(vazio); setModal(true) }}>{L.agendar}</Button>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">
        <div className="mx-auto w-full max-w-[820px]">
          {isSaude && (
            <div className="mb-5">
              <ListaEspera empresaId={empresaId} onAgendar={agendarDaEspera} />
            </div>
          )}
          {lista.length === 0 ? (
            <Card flush>
              <EmptyState
                icon={<CalendarDays size={22} strokeWidth={1.7} />}
                title={isSaude ? 'Nenhuma consulta agendada' : 'Nenhuma visita agendada'}
                description={isSaude ? 'Agende a primeira consulta para começar.' : 'Agende a primeira visita para começar.'}
                action={<Button size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => { setForm(vazio); setModal(true) }}>{L.agendar}</Button>}
              />
            </Card>
          ) : grupos.map(g => (
            <div key={g.label} className="mb-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 capitalize">{g.label}</div>
              <Card flush>
                <div className="divide-y divide-line-soft">
                  {g.itens.map(v => {
                    const st = stInfo(v.status)
                    return (
                      <div key={v.id} className="flex items-center gap-3 p-4">
                        <div className="flex w-[56px] shrink-0 items-center justify-center gap-1 text-ink">
                          <Clock size={13} strokeWidth={1.7} className="text-ink-3" />
                          <span className="num text-[15px] font-semibold leading-none">{hora(v.data_hora)}</span>
                        </div>
                        <div className="min-w-0 flex-1 border-l border-line pl-3">
                          <div className="truncate text-[13px] font-semibold text-ink">{v.lead_nome || L.item}</div>
                          <div className="mt-0.5 flex items-center gap-3 text-[12px] text-ink-2">
                            {v.imovel_nome && <span className="inline-flex items-center gap-1 truncate"><MapPin size={12} strokeWidth={1.7} />{v.imovel_nome}{v.imovel_bairro ? ` · ${v.imovel_bairro}` : ''}</span>}
                            {v.lead_tel && <span className="num inline-flex items-center gap-1"><Phone size={12} strokeWidth={1.7} />{v.lead_tel}</span>}
                          </div>
                        </div>
                        {isSaude && v.lead_id && (
                          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => agendarRetorno(v)}>Retorno</Button>
                        )}
                        <div className="relative shrink-0">
                          <Badge tone={st.tone} dot>{st.l}</Badge>
                          <select
                            value={v.status}
                            onChange={e => mudarStatus(v, e.target.value)}
                            aria-label="Alterar status"
                            className="absolute inset-0 w-full cursor-pointer opacity-0"
                          >
                            {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </main>

      <Modal
        open={modal}
        onClose={() => { if (!loading) setModal(false) }}
        title={L.agendar}
        disableOverlayClose={loading}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={salvar} loading={loading}>Agendar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Data e hora" required type="datetime-local" value={form.data_hora} onChange={e => set('data_hora', e.target.value)} />
          <Select label={L.pessoa} value={form.lead_id} onChange={e => set('lead_id', e.target.value)}>
            <option value="">— selecionar —</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.nome || `#${l.id}`}</option>)}
          </Select>
          {!isSaude && (
            <Select label="Imóvel" value={form.imovel_id} onChange={e => set('imovel_id', e.target.value)}>
              <option value="">— selecionar —</option>
              {imoveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Select>
          )}
          {isGestor && (
            <Select label={L.prof} value={form.corretor_id} onChange={e => set('corretor_id', e.target.value)}>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
          )}
          <Textarea label="Observações" rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
