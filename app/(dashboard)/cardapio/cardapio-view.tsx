'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, UtensilsCrossed, Copy, ExternalLink } from 'lucide-react'
import { Card, Button, Input, Textarea, Select, Badge, Modal, EmptyState, notify } from '@/components/ui'

export interface Item { id: number; nome: string; categoria_id: number | null; preco: number | null; descricao: string | null; foto_url: string | null; disponivel: boolean | null }
export interface Categoria { id: number; nome: string }

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

export function CardapioView({ initial, categorias, empresaId, slug }: { initial: Item[]; categorias: Categoria[]; empresaId: number; slug: string | null }) {
  const supabase = createClient()
  const router = useRouter()
  const [editando, setEditando] = useState<Item | 'novo' | null>(null)
  const [form, setForm] = useState({ nome: '', categoria_id: '', preco: '', descricao: '', foto_url: '', disponivel: true })
  const [salvando, setSalvando] = useState(false)

  const base = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || '')
  const publicUrl = slug ? `${base.replace(/\/$/, '')}/menu/${slug}` : ''

  const grupos = categorias.map((c) => ({ cat: c.nome, itens: initial.filter((i) => i.categoria_id === c.id) }))
    .concat([{ cat: 'Sem categoria', itens: initial.filter((i) => !i.categoria_id) }])
    .filter((g) => g.itens.length > 0)

  function abrir(i: Item | 'novo') {
    setEditando(i)
    if (i === 'novo') setForm({ nome: '', categoria_id: categorias[0] ? String(categorias[0].id) : '', preco: '', descricao: '', foto_url: '', disponivel: true })
    else setForm({ nome: i.nome, categoria_id: i.categoria_id ? String(i.categoria_id) : '', preco: i.preco != null ? String(i.preco) : '', descricao: i.descricao ?? '', foto_url: i.foto_url ?? '', disponivel: i.disponivel ?? true })
  }

  async function salvar() {
    if (!form.nome.trim()) { notify.warn('Informe o nome do item'); return }
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      preco: form.preco ? Number(form.preco) : null,
      descricao: form.descricao.trim() || null,
      foto_url: form.foto_url.trim() || null,
      disponivel: form.disponivel,
    }
    const res = editando === 'novo'
      ? await supabase.from('produtos').insert({ ...payload, empresa_id: empresaId, ativo: true })
      : await supabase.from('produtos').update(payload).eq('id', (editando as Item).id)
    setSalvando(false)
    if (res.error) { notify.bad('Erro ao salvar', res.error.message); return }
    notify.ok('Item salvo'); setEditando(null); router.refresh()
  }

  async function toggleDisp(i: Item) {
    const { error } = await supabase.from('produtos').update({ disponivel: !(i.disponivel ?? true) }).eq('id', i.id)
    if (error) { notify.bad('Erro'); return }
    router.refresh()
  }
  async function remover(i: Item) {
    if (!window.confirm(`Remover "${i.nome}" do cardápio?`)) return
    const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', i.id)
    if (error) { notify.bad('Erro ao remover'); return }
    router.refresh()
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[900px] space-y-4">
        {publicUrl && (
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-ink-2">Cardápio público:</span>
              <code className="num min-w-0 flex-1 truncate rounded-control border border-line bg-raised px-2 py-1 text-[12px] text-ink">{publicUrl}</code>
              <Button variant="outline" size="sm" icon={<Copy size={13} strokeWidth={1.7} />} onClick={() => { navigator.clipboard?.writeText(publicUrl); notify.ok('Link copiado') }}>Copiar</Button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[12.5px] text-ink-2 hover:text-ink"><ExternalLink size={14} strokeWidth={1.7} />Abrir</a>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-3">O QR pra imprimir na mesa está em Configurações → Cardápio.</p>
          </Card>
        )}

        <div className="flex justify-end">
          <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => abrir('novo')}>Novo item</Button>
        </div>

        {initial.length === 0 ? (
          <Card flush><div className="p-6"><EmptyState icon={<UtensilsCrossed size={22} strokeWidth={1.7} />} title="Cardápio vazio" description="Adicione os itens do seu cardápio." /></div></Card>
        ) : grupos.map((g) => (
          <div key={g.cat}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{g.cat}</div>
            <Card flush>
              <div className="divide-y divide-line-soft">
                {g.itens.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <button onClick={() => abrir(i)} className="text-[14px] font-semibold text-ink hover:text-accent">{i.nome}</button>
                      {i.descricao && <div className="truncate text-[12px] text-ink-3">{i.descricao}</div>}
                    </div>
                    <span className="num text-[13.5px] font-semibold text-ink">{brl(i.preco)}</span>
                    <button onClick={() => toggleDisp(i)} title="Disponível?">
                      <Badge tone={i.disponivel ?? true ? 'ok' : 'neutro'}>{i.disponivel ?? true ? 'Disponível' : 'Indisponível'}</Badge>
                    </button>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => remover(i)}><span className="sr-only">Remover</span></Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>

      <Modal open={editando !== null} onClose={() => !salvando && setEditando(null)} title={editando === 'novo' ? 'Novo item' : 'Editar item'}
        footer={<><Button variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button><Button onClick={salvar} loading={salvando}>Salvar</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Input wrapperClassName="col-span-2" label="Nome do item" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: X-Burger" />
          <Select label="Categoria" value={form.categoria_id} onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Input label="Preço" type="number" className="num" value={form.preco} onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))} placeholder="0,00" />
          <Textarea wrapperClassName="col-span-2" label="Descrição" rows={2} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ingredientes, porção…" />
          <Input wrapperClassName="col-span-2" label="Foto (URL)" value={form.foto_url} onChange={(e) => setForm((f) => ({ ...f, foto_url: e.target.value }))} placeholder="https://…" />
          <label className="col-span-2 flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={form.disponivel} onChange={(e) => setForm((f) => ({ ...f, disponivel: e.target.checked }))} className="h-4 w-4 accent-accent" /> Disponível no cardápio
          </label>
        </div>
      </Modal>
    </main>
  )
}
