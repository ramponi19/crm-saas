'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Modal, Input, Select, Button, ConfirmDialog, notify } from '@/components/ui'

interface Produto {
  id?: number
  nome: string
  marca_id: number | null
  categoria_id: number | null
}

interface Props {
  produto: Produto | null
  marcas: { id: number; nome: string }[]
  categorias: { id: number; nome: string }[]
  onClose: () => void
  onSaved: (p: Produto & { id: number; marca_nome: string; categoria_nome: string | null; ativo: boolean }) => void
  onDeleted?: (id: number) => void
}

export default function ProdutoModal({ produto, marcas, categorias, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const isNew = !produto?.id
  const [form, setForm] = useState({
    nome: produto?.nome ?? '',
    marca_id: produto?.marca_id ? String(produto.marca_id) : '',
    categoria_id: produto?.categoria_id ? String(produto.categoria_id) : '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function salvar() {
    if (!form.nome.trim()) { notify.warn('Nome é obrigatório'); return }
    if (!form.marca_id) { notify.warn('Marca é obrigatória'); return }
    if (!empresa?.id) { notify.warn('Empresa não encontrada'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      marca_id: Number(form.marca_id),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      ativo: true,
    }
    if (isNew) {
      const { data, error } = await supabase.from('produtos').insert({ ...payload, empresa_id: empresa.id }).select().single()
      if (error) { notify.bad('Erro ao cadastrar', error.message); setSaving(false); return }
      const marca = marcas.find(m => m.id === Number(form.marca_id))
      const cat = categorias.find(c => c.id === Number(form.categoria_id))
      notify.ok('Produto cadastrado')
      onSaved({ ...data, ativo: data.ativo ?? true, marca_nome: marca?.nome ?? '', categoria_nome: cat?.nome ?? null })
    } else {
      const { error } = await supabase.from('produtos').update(payload).eq('id', produto!.id!)
      if (error) { notify.bad('Erro ao salvar', error.message); setSaving(false); return }
      const marca = marcas.find(m => m.id === Number(form.marca_id))
      const cat = categorias.find(c => c.id === Number(form.categoria_id))
      notify.ok('Produto atualizado')
      onSaved({ id: produto!.id!, ...payload, marca_nome: marca?.nome ?? '', categoria_nome: cat?.nome ?? null })
    }
    onClose()
  }

  async function excluir() {
    await supabase.from('produtos').update({ ativo: false }).eq('id', produto!.id!)
    notify.ok('Produto removido')
    onDeleted?.(produto!.id!)
    onClose()
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="sm"
        disableOverlayClose={saving}
        title={isNew ? 'Novo produto' : 'Editar produto'}
        footer={
          <>
            {!isNew && (
              <Button variant="ghost" className="mr-auto text-bad hover:bg-bad-soft" onClick={() => setConfirmDel(true)} disabled={saving}>
                Remover
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} loading={saving}>Salvar</Button>
          </>
        }
      >
        <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid gap-3">
          <Input
            label="Nome do modelo"
            required
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex.: iPhone 15 Pro Max"
          />
          <Select
            label="Marca"
            required
            value={form.marca_id}
            onChange={e => setForm(f => ({ ...f, marca_id: e.target.value }))}
          >
            <option value="">Selecionar marca…</option>
            {marcas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Select>
          <Select
            label="Categoria"
            value={form.categoria_id}
            onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
          >
            <option value="">Sem categoria</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={excluir}
        title="Desativar produto?"
        description={`${form.nome || 'Este produto'} deixará de aparecer nas listas.`}
        confirmLabel="Remover"
        tone="danger"
      />
    </>
  )
}
