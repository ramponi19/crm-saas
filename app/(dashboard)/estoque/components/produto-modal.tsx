'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Modal, Input, Select, Button, ConfirmDialog, notify } from '@/components/ui'
import { X, Plus } from 'lucide-react'
import { APPLE_MODELOS } from '@/lib/apple-modelos'

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

/** Campo de "chips": digita + Enter (ou vírgula) adiciona; clique no × remove. */
function ChipsField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [txt, setTxt] = useState('')
  function add() {
    const novos = txt.split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !values.includes(s))
    if (novos.length) onChange([...values, ...novos])
    setTxt('')
  }
  return (
    <div>
      <label className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</label>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remover ${v}`}><X size={12} strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={txt} onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 rounded-control border border-line bg-bg px-3 text-[13.5px] text-ink placeholder:text-ink-3 outline-none focus:border-accent" />
        <button type="button" onClick={add} className="grid h-9 w-9 place-items-center rounded-control border border-line text-ink-2 hover:text-ink"><Plus size={16} strokeWidth={1.8} /></button>
      </div>
    </div>
  )
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
  const [cores, setCores] = useState<string[]>([])
  const [armazenamentos, setArmazenamentos] = useState<string[]>([])
  const [modeloApple, setModeloApple] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // Ao editar, carrega cores/armazenamentos salvos.
  useEffect(() => {
    if (!produto?.id) return
    supabase.from('produtos').select('cores, armazenamentos').eq('id', produto.id).maybeSingle().then(({ data }) => {
      if (data?.cores) setCores(data.cores)
      if (data?.armazenamentos) setArmazenamentos(data.armazenamentos)
    })
  }, [produto?.id, supabase])

  function aplicarModeloApple(nome: string) {
    setModeloApple(nome)
    const m = APPLE_MODELOS.find((x) => x.nome === nome)
    if (!m) return
    setForm((f) => ({ ...f, nome: m.nome, marca_id: f.marca_id || String(marcas.find((mc) => /apple/i.test(mc.nome))?.id ?? '') }))
    setCores(m.cores)
    setArmazenamentos(m.armazenamentos)
  }

  async function salvar() {
    if (!form.nome.trim()) { notify.warn('Nome é obrigatório'); return }
    if (!form.marca_id) { notify.warn('Marca é obrigatória'); return }
    if (!empresa?.id) { notify.warn('Empresa não encontrada'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      marca_id: Number(form.marca_id),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      cores: cores.length ? cores : null,
      armazenamentos: armazenamentos.length ? armazenamentos : null,
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
          {/* Seletor de modelo Apple: EXCLUSIVO da JM Store (não aparece nos outros tenants). */}
          {isNew && empresa?.slug === 'jm-store' && (
            <Select label="Modelo Apple (opcional — preenche tudo)" value={modeloApple} onChange={e => aplicarModeloApple(e.target.value)}>
              <option value="">Preencher manualmente…</option>
              {(['iPhone', 'iPad', 'Mac', 'Watch'] as const).map((linha) => (
                <optgroup key={linha} label={linha}>
                  {APPLE_MODELOS.filter((m) => m.linha === linha).map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
                </optgroup>
              ))}
            </Select>
          )}
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
          <ChipsField label="Cores do modelo" values={cores} onChange={setCores} placeholder="Ex.: Titânio Preto (Enter p/ adicionar)" />
          <ChipsField label="Armazenamentos" values={armazenamentos} onChange={setArmazenamentos} placeholder="Ex.: 256GB (Enter p/ adicionar)" />
          <p className="-mt-1 text-[11px] text-ink-3">No estoque, ao escolher este modelo, Cor e Armazenamento viram listas com estas opções.</p>
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
