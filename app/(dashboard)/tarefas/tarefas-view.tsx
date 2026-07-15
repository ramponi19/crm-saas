'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Check, Trash2, Phone, Mail, MessageCircle, MapPin, CircleDot, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton, Input, Select, Textarea, Modal, Card, Badge, EmptyState, notify } from '@/components/ui'
import type { Tables } from '@/types/database'

type Tarefa = Tables<'tarefas'> & { lead_nome: string | null }
type LeadMin = { id: number; nome: string | null }
type UsuarioMin = { id: string; nome: string }

const TIPOS = [
  { v: 'ligacao', l: 'Ligação', icon: Phone },
  { v: 'whatsapp', l: 'WhatsApp', icon: MessageCircle },
  { v: 'email', l: 'E-mail', icon: Mail },
  { v: 'visita', l: 'Visita', icon: MapPin },
  { v: 'outro', l: 'Outro', icon: CircleDot },
]
const iconTipo = (t: string) => (TIPOS.find(x => x.v === t)?.icon ?? CircleDot)
const labelTipo = (t: string) => (TIPOS.find(x => x.v === t)?.l ?? t)
const fmtData = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem prazo'

export default function TarefasView({ inicial, leads, usuarios, empresaId, meuId, isGestor }: {
  inicial: Tarefa[]; leads: LeadMin[]; usuarios: UsuarioMin[]; empresaId: number; meuId: string; isGestor: boolean
}) {
  const supabase = createClient()
  const [lista, setLista] = useState<Tarefa[]>(inicial)
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const vazio = { titulo: '', tipo: 'ligacao', vencimento: '', lead_id: '', responsavel_id: meuId, descricao: '' }
  const [form, setForm] = useState(vazio)
  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.titulo.trim()) { notify.bad('Informe o título'); return }
    setLoading(true)
    const payload = {
      empresa_id: empresaId, titulo: form.titulo.trim(), tipo: form.tipo,
      vencimento: form.vencimento ? new Date(form.vencimento).toISOString() : null,
      lead_id: form.lead_id ? Number(form.lead_id) : null,
      responsavel_id: form.responsavel_id || meuId,
      descricao: form.descricao || null,
    }
    const { data, error } = await supabase.from('tarefas').insert(payload).select('*, leads(nome)').single()
    setLoading(false)
    if (error) { notify.bad(error.message); return }
    const d = data as unknown as (Tables<'tarefas'> & { leads: { nome: string | null } | null })
    const nova: Tarefa = { ...d, lead_nome: d.leads?.nome ?? null }
    setLista(l => [nova, ...l])
    setForm(vazio); setModal(false)
    notify.ok('Tarefa criada')
  }

  async function toggle(t: Tarefa) {
    const nova = !t.concluida
    const { error } = await supabase.from('tarefas').update({ concluida: nova, concluida_em: nova ? new Date().toISOString() : null }).eq('id', t.id)
    if (error) { notify.bad(error.message); return }
    setLista(l => l.map(x => x.id === t.id ? { ...x, concluida: nova } : x))
  }

  async function excluir(t: Tarefa) {
    if (!confirm('Excluir a tarefa?')) return
    const { error } = await supabase.from('tarefas').delete().eq('id', t.id)
    if (error) { notify.bad(error.message); return }
    setLista(l => l.filter(x => x.id !== t.id))
  }

  const agora = Date.now()
  const pend = lista.filter(t => !t.concluida)
  const atrasadas = pend.filter(t => t.vencimento && new Date(t.vencimento).getTime() < agora)
  const proximas = pend.filter(t => !t.vencimento || new Date(t.vencimento).getTime() >= agora)
  const concluidas = lista.filter(t => t.concluida)

  const Linha = (t: Tarefa, atrasada = false) => {
    const Icon = iconTipo(t.tipo)
    return (
      <div key={t.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0">
        <button
          onClick={() => toggle(t)}
          aria-label={t.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
          className={cn(
            'grid h-5 w-5 flex-none place-items-center rounded-[6px] border transition-colors',
            t.concluida ? 'border-ok bg-ok text-white' : 'border-line hover:border-ok',
          )}
        >
          {t.concluida && <Check size={13} strokeWidth={1.7} />}
        </button>
        <Badge tone={t.tipo === 'outro' ? 'neutro' : 'acc'} className="flex-none">
          <Icon size={11} strokeWidth={1.7} />{labelTipo(t.tipo)}
        </Badge>
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-[13px] font-medium', t.concluida ? 'text-ink-3 line-through' : 'text-ink')}>{t.titulo}</div>
          {t.lead_nome && <div className="truncate text-[11.5px] text-ink-3">Lead: {t.lead_nome}</div>}
        </div>
        <span className={cn('num shrink-0 text-[11.5px]', atrasada ? 'font-semibold text-bad' : 'text-ink-3')}>{fmtData(t.vencimento)}</span>
        <IconButton aria-label="Excluir" variant="danger" size="sm" onClick={() => excluir(t)}><Trash2 size={14} strokeWidth={1.7} /></IconButton>
      </div>
    )
  }

  const Bloco = ({ titulo, itens, dotCls, atrasada }: { titulo: string; itens: Tarefa[]; dotCls: string; atrasada?: boolean }) =>
    itens.length === 0 ? null : (
      <Card
        flush
        title={
          <span className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-[2px]', dotCls)} />
            {titulo} <span className="num font-normal text-ink-3">({itens.length})</span>
          </span>
        }
      >
        {itens.map(t => Linha(t, atrasada))}
      </Card>
    )

  return (
    <>
      <Topbar title="Tarefas" />

      <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[820px] space-y-4">
          <div className="flex items-center justify-end">
            <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setModal(true)}>Nova tarefa</Button>
          </div>

          {pend.length === 0 && concluidas.length === 0 && (
            <Card flush>
              <EmptyState
                icon={<ListChecks size={22} strokeWidth={1.7} />}
                title="Nenhuma tarefa"
                description="Crie a primeira tarefa para organizar seus follow-ups."
                action={<Button size="sm" icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setModal(true)}>Nova tarefa</Button>}
              />
            </Card>
          )}

          <Bloco titulo="Atrasadas" itens={atrasadas} dotCls="bg-bad" atrasada />
          <Bloco titulo="A fazer" itens={proximas} dotCls="bg-accent" />
          <Bloco titulo="Concluídas" itens={concluidas.slice(0, 20)} dotCls="bg-ok" />
        </div>
      </main>

      <Modal
        open={modal}
        onClose={() => !loading && setModal(false)}
        title="Nova tarefa"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvar} loading={loading}>Criar tarefa</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Título" required value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: Ligar para o cliente" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Tipo" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </Select>
            <Input label="Vencimento" type="datetime-local" value={form.vencimento} onChange={e => set('vencimento', e.target.value)} />
          </div>
          <Select label="Lead (opcional)" value={form.lead_id} onChange={e => set('lead_id', e.target.value)}>
            <option value="">— nenhum —</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.nome || `Lead #${l.id}`}</option>)}
          </Select>
          {isGestor && (
            <Select label="Responsável" value={form.responsavel_id} onChange={e => set('responsavel_id', e.target.value)}>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
          )}
          <Textarea label="Descrição" value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} />
        </div>
      </Modal>
    </>
  )
}
