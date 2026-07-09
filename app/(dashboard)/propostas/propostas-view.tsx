'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ExternalLink, Copy, FileText } from 'lucide-react'
import { Card, Button, Input, Textarea, Badge, Modal, EmptyState, notify } from '@/components/ui'

interface Item { descricao: string; qtd: number; valor: number }
export interface Proposta {
  id: number
  cliente_nome: string
  itens: Item[] | null
  observacoes: string | null
  total: number
  status: string
  token: string
  created_at: string
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS: Record<string, { label: string; tone: 'neutro' | 'ok' | 'warn' | 'bad' }> = {
  rascunho: { label: 'Rascunho', tone: 'neutro' },
  enviada: { label: 'Enviada', tone: 'warn' },
  aceita: { label: 'Aceita', tone: 'ok' },
  recusada: { label: 'Recusada', tone: 'bad' },
}

export function PropostasView({ initial, baseUrl }: { initial: Proposta[]; baseUrl: string }) {
  const router = useRouter()
  const [editando, setEditando] = useState<Proposta | 'nova' | null>(null)
  const [cliente, setCliente] = useState('')
  const [itens, setItens] = useState<Item[]>([{ descricao: '', qtd: 1, valor: 0 }])
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  const total = itens.reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.valor) || 0), 0)

  function abrir(p: Proposta | 'nova') {
    setEditando(p)
    if (p === 'nova') { setCliente(''); setItens([{ descricao: '', qtd: 1, valor: 0 }]); setObs('') }
    else { setCliente(p.cliente_nome); setItens(p.itens?.length ? p.itens : [{ descricao: '', qtd: 1, valor: 0 }]); setObs(p.observacoes ?? '') }
  }

  const setItem = (i: number, patch: Partial<Item>) => setItens(arr => arr.map((x, j) => j === i ? { ...x, ...patch } : x))
  const addItem = () => setItens(arr => [...arr, { descricao: '', qtd: 1, valor: 0 }])
  const rmItem = (i: number) => setItens(arr => arr.filter((_, j) => j !== i))

  async function salvar() {
    if (!cliente.trim()) { notify.bad('Informe o cliente'); return }
    setSalvando(true)
    try {
      const payload = { cliente_nome: cliente, itens, observacoes: obs }
      const res = editando === 'nova'
        ? await fetch('/api/propostas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/propostas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: (editando as Proposta).id, ...payload }) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error) }
      notify.ok('Proposta salva')
      setEditando(null)
      router.refresh()
    } catch (e) { notify.bad('Erro ao salvar', e instanceof Error ? e.message : undefined) } finally { setSalvando(false) }
  }

  async function mudarStatus(p: Proposta, status: string) {
    const res = await fetch('/api/propostas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, status }) })
    if (res.ok) { notify.ok('Status atualizado'); router.refresh() } else notify.bad('Erro ao atualizar')
  }
  async function excluir(p: Proposta) {
    const res = await fetch('/api/propostas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
    if (res.ok) { notify.ok('Proposta excluída'); router.refresh() } else notify.bad('Erro ao excluir')
  }
  function link(p: Proposta) { return `${baseUrl}/proposta/${p.token}` }
  function copiar(p: Proposta) { navigator.clipboard?.writeText(link(p)); notify.ok('Link copiado') }
  function whatsapp(p: Proposta) {
    const msg = encodeURIComponent(`Olá! Segue sua proposta: ${link(p)}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1000px] space-y-4">
        <div className="flex justify-end">
          <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => abrir('nova')}>Nova proposta</Button>
        </div>

        <Card flush>
          {initial.length === 0 ? (
            <div className="p-6"><EmptyState icon={<FileText size={22} strokeWidth={1.7} />} title="Nenhuma proposta" description="Crie a primeira proposta comercial." /></div>
          ) : (
            <div className="divide-y divide-line-soft">
              {initial.map(p => {
                const st = STATUS[p.status] ?? STATUS.rascunho
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-[160px] flex-1">
                      <button onClick={() => abrir(p)} className="text-[14px] font-semibold text-ink hover:text-accent">{p.cliente_nome || 'Sem cliente'}</button>
                      <div className="num text-[12px] text-ink-3">{brl(Number(p.total))} · {new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" icon={<Copy size={14} strokeWidth={1.7} />} onClick={() => copiar(p)}><span className="sr-only">Copiar link</span></Button>
                      <a href={link(p)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-control px-2 text-ink-2 hover:text-ink"><ExternalLink size={15} strokeWidth={1.7} /></a>
                      <Button variant="outline" size="sm" onClick={() => whatsapp(p)}>WhatsApp</Button>
                    </div>
                    <select value={p.status} onChange={e => mudarStatus(p, e.target.value)} className="h-8 rounded-control border border-line bg-card px-2 text-[12.5px] text-ink">
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => excluir(p)}><span className="sr-only">Excluir</span></Button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={editando !== null}
        onClose={() => !salvando && setEditando(null)}
        size="lg"
        title={editando === 'nova' ? 'Nova proposta' : 'Editar proposta'}
        footer={<><Button variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button><Button onClick={salvar} loading={salvando}>Salvar</Button></>}
      >
        <div className="space-y-4">
          <Input label="Cliente" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" />
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-ink-2">Itens</div>
            <div className="space-y-2">
              {itens.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input wrapperClassName="flex-1" value={it.descricao} onChange={e => setItem(i, { descricao: e.target.value })} placeholder="Descrição" />
                  <Input wrapperClassName="w-[70px]" type="number" min={0} className="num text-center" value={it.qtd} onChange={e => setItem(i, { qtd: Number(e.target.value) })} />
                  <Input wrapperClassName="w-[110px]" type="number" min={0} className="num" value={it.valor} onChange={e => setItem(i, { valor: Number(e.target.value) })} placeholder="Valor" />
                  <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => rmItem(i)}><span className="sr-only">Remover</span></Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={addItem}>Adicionar item</Button>
              <span className="num text-[15px] font-bold text-ink">Total: {brl(total)}</span>
            </div>
          </div>
          <Textarea label="Observações" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Condições, prazos, validade…" />
        </div>
      </Modal>
    </main>
  )
}
