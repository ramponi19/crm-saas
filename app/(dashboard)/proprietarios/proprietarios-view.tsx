'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Pencil, Trash2, KeyRound, Search } from 'lucide-react'
import {
  Card, Table, Input, Textarea, Button, IconButton, Modal, ConfirmDialog, EmptyState, notify,
  type Column,
} from '@/components/ui'
import type { Tables } from '@/types/database'

type Proprietario = Tables<'proprietarios'>

const vazio = { nome: '', cpf_cnpj: '', telefone: '', email: '', observacoes: '' }

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'PR'
}

export default function ProprietariosView({ inicial, empresaId }: { inicial: Proprietario[]; empresaId: number }) {
  const supabase = createClient()
  const [lista, setLista] = useState<Proprietario[]>(inicial)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Proprietario | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(vazio)
  const [confirmDel, setConfirmDel] = useState<Proprietario | null>(null)

  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  function abrirNovo() { setEditando(null); setForm(vazio); setModal(true) }
  function abrirEdit(p: Proprietario) {
    setEditando(p)
    setForm({ nome: p.nome, cpf_cnpj: p.cpf_cnpj ?? '', telefone: p.telefone ?? '', email: p.email ?? '', observacoes: p.observacoes ?? '' })
    setModal(true)
  }

  async function salvar() {
    if (!form.nome.trim()) { notify.warn('Informe o nome'); return }
    setLoading(true)
    const payload = {
      nome: form.nome.trim(),
      cpf_cnpj: form.cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      observacoes: form.observacoes || null,
    }
    if (editando) {
      const { data, error } = await supabase.from('proprietarios').update(payload).eq('id', editando.id).select('*').single()
      if (error) { notify.bad(error.message); setLoading(false); return }
      setLista(l => l.map(x => (x.id === editando.id ? data : x)))
      notify.ok('Proprietário atualizado')
    } else {
      const { data, error } = await supabase.from('proprietarios').insert({ ...payload, empresa_id: empresaId }).select('*').single()
      if (error) { notify.bad(error.message); setLoading(false); return }
      setLista(l => [...l, data].sort((a, b) => a.nome.localeCompare(b.nome)))
      notify.ok('Proprietário cadastrado')
    }
    setLoading(false); setModal(false)
  }

  async function excluir(p: Proprietario) {
    const { error } = await supabase.from('proprietarios').delete().eq('id', p.id)
    if (error) { notify.bad(error.message); return }
    setLista(l => l.filter(x => x.id !== p.id))
    notify.ok('Proprietário excluído')
  }

  const filtrada = lista.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.cpf_cnpj ?? '').includes(busca) ||
    (p.telefone ?? '').includes(busca)
  )

  const cols: Column<Proprietario>[] = [
    {
      key: 'nome', header: 'Nome',
      render: (p) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
            {getInitials(p.nome)}
          </span>
          <span className="truncate text-[13px] font-semibold text-ink">{p.nome}</span>
        </div>
      ),
    },
    { key: 'cpf_cnpj', header: 'CPF/CNPJ', hideOnMobile: true, className: 'num', render: (p) => <span className="text-ink-2">{p.cpf_cnpj || '—'}</span> },
    { key: 'telefone', header: 'Telefone', hideOnMobile: true, className: 'num', render: (p) => <span className="text-ink-2">{p.telefone || '—'}</span> },
    { key: 'email', header: 'E-mail', hideOnMobile: true, render: (p) => <span className="text-ink-2">{p.email || '—'}</span> },
    {
      key: 'acoes', header: '', align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton size="sm" aria-label="Editar" onClick={() => abrirEdit(p)}><Pencil size={15} strokeWidth={1.7} /></IconButton>
          <IconButton size="sm" variant="danger" aria-label="Excluir" onClick={() => setConfirmDel(p)}><Trash2 size={15} strokeWidth={1.7} /></IconButton>
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Proprietários" />

      <div className="flex flex-wrap shrink-0 items-center gap-3 px-6 py-4">
        <Input
          wrapperClassName="flex-1 max-w-[360px]"
          icon={<Search size={15} strokeWidth={1.7} />}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ, telefone…"
        />
        <div className="flex-1" />
        <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={abrirNovo}>Novo proprietário</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <Card flush>
          <Table
            columns={cols}
            rows={filtrada}
            rowKey={(p) => p.id}
            empty={<EmptyState icon={<KeyRound size={22} strokeWidth={1.7} />} title={`Nenhum proprietário ${busca ? 'encontrado' : 'cadastrado ainda'}`} description={busca ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro proprietário.'} action={!busca ? <Button size="sm" onClick={abrirNovo}>Novo proprietário</Button> : undefined} />}
          />
        </Card>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        size="md"
        disableOverlayClose={loading}
        title={editando ? 'Editar proprietário' : 'Novo proprietário'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={salvar} loading={loading}>Salvar</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); salvar() }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input wrapperClassName="col-span-2" label="Nome" required value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome do proprietário" />
          <Input label="CPF/CNPJ" value={form.cpf_cnpj} onChange={(e) => set('cpf_cnpj', e.target.value)} />
          <Input label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 00000-0000" />
          <Input wrapperClassName="col-span-2" label="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Textarea wrapperClassName="col-span-2" label="Observações" rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDel !== null}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) excluir(confirmDel) }}
        title="Excluir proprietário?"
        description={`Excluir o proprietário "${confirmDel?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
