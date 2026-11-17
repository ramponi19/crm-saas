'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Modal, Input, Select, Button, ConfirmDialog, UploadFotos, notify } from '@/components/ui'
import { NADA_GRAVADO, nadaGravado } from '@/lib/linhas-afetadas'
import { X, Plus } from 'lucide-react'
import { SeletorModeloApple, marcaApple } from '@/components/modules/celulares/seletor-modelo-apple'
import { PRODUTO_CELULAR } from '@/components/modules/celulares/rotulos'
import type { AppleModelo } from '@/lib/apple-modelos'

/** Os textos do cadastro sem módulo de segmento (com Celulares: PRODUTO_CELULAR). */
const PRODUTO_GENERICO = {
  nomePlaceholder: 'Ex.: Produto X',
  coresPlaceholder: 'Ex.: Preto (Enter p/ adicionar)',
  variantes: 'Variantes',
  variantesPlaceholder: 'Ex.: Tamanho M (Enter p/ adicionar)',
  variantesAjuda: 'No estoque, ao escolher este modelo, Cor e Variante viram listas com estas opções.',
}

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
  /** Módulo Celulares ligado: seletor de modelo Apple e textos de celular. */
  celulares?: boolean
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

export default function ProdutoModal({ produto, marcas, categorias, onClose, onSaved, onDeleted, celulares = false }: Props) {
  const supabase = createClient()
  const { empresa } = useEmpresa()
  const isNew = !produto?.id
  const [form, setForm] = useState({
    nome: produto?.nome ?? '',
    marca_id: produto?.marca_id ? String(produto.marca_id) : '',
    categoria_id: produto?.categoria_id ? String(produto.categoria_id) : '',
    garantia_dias: '',
  })
  const [foto, setFoto] = useState<string[]>([])
  const [cores, setCores] = useState<string[]>([])
  const [armazenamentos, setArmazenamentos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // Ao editar, carrega cores/armazenamentos/garantia salvos.
  useEffect(() => {
    if (!produto?.id) return
    supabase.from('estoque_produtos').select('cores, armazenamentos, garantia_dias, foto_url').eq('id', produto.id).maybeSingle().then(({ data }) => {
      if (data?.cores) setCores(data.cores)
      if (data?.armazenamentos) setArmazenamentos(data.armazenamentos)
      if (data?.garantia_dias != null) setForm((f) => ({ ...f, garantia_dias: String(data.garantia_dias) }))
      if (data?.foto_url) setFoto([data.foto_url])
    })
  }, [produto?.id, supabase])

  const T = celulares ? PRODUTO_CELULAR : PRODUTO_GENERICO

  function aplicarModeloApple(m: AppleModelo) {
    setForm((f) => ({ ...f, nome: m.nome, marca_id: f.marca_id || String(marcaApple(marcas)?.id ?? '') }))
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
      // Vazio = usa o padrão da loja (/admin/configuracoes → Contrato).
      garantia_dias: form.garantia_dias.trim() ? Number(form.garantia_dias) : null,
      foto_url: foto[0] ?? null,
      ativo: true,
    }
    if (isNew) {
      const { data, error } = await supabase.from('estoque_produtos').insert({ ...payload, empresa_id: empresa.id }).select().single()
      if (error) { notify.bad('Erro ao cadastrar', error.message); setSaving(false); return }
      const marca = marcas.find(m => m.id === Number(form.marca_id))
      const cat = categorias.find(c => c.id === Number(form.categoria_id))
      notify.ok('Produto cadastrado')
      onSaved({ ...data, ativo: data.ativo ?? true, marca_nome: marca?.nome ?? '', categoria_nome: cat?.nome ?? null })
    } else {
      const { data: gravou, error } = await supabase.from('estoque_produtos').update(payload).eq('id', produto!.id!).select('id')
      if (error) { notify.bad('Erro ao salvar', error.message); setSaving(false); return }
      if (nadaGravado(gravou)) { notify.bad('Erro ao salvar', NADA_GRAVADO); setSaving(false); return }
      const marca = marcas.find(m => m.id === Number(form.marca_id))
      const cat = categorias.find(c => c.id === Number(form.categoria_id))
      notify.ok('Produto atualizado')
      onSaved({ id: produto!.id!, ...payload, marca_nome: marca?.nome ?? '', categoria_nome: cat?.nome ?? null })
    }
    onClose()
  }

  async function excluir() {
    const { data: removeu, error } = await supabase.from('estoque_produtos').update({ ativo: false }).eq('id', produto!.id!).select('id')
    if (error) { notify.bad('Erro ao remover', error.message); return }
    if (nadaGravado(removeu)) { notify.bad('Erro ao remover', NADA_GRAVADO); return }
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
          {/* Seletor de modelo Apple: do módulo Celulares, só com ele ligado. */}
          {isNew && celulares && <SeletorModeloApple onEscolher={aplicarModeloApple} />}
          <Input
            label="Nome do modelo"
            required
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder={T.nomePlaceholder}
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
          <Input
            label="Garantia (dias)"
            type="number"
            min={0}
            value={form.garantia_dias}
            onChange={e => setForm(f => ({ ...f, garantia_dias: e.target.value }))}
            placeholder="Em branco = padrão da loja"
          />
          <UploadFotos label="Foto do modelo" value={foto} onChange={setFoto} empresaId={empresa?.id ?? 0} max={1}
            disabled={!empresa?.id} ajuda="Aparece no PDV e no catálogo. JPG, PNG ou WEBP até 8 MB." />
          <ChipsField label="Cores do modelo" values={cores} onChange={setCores} placeholder={T.coresPlaceholder} />
          <ChipsField label={T.variantes} values={armazenamentos} onChange={setArmazenamentos} placeholder={T.variantesPlaceholder} />
          <p className="-mt-1 text-[11px] text-ink-3">{T.variantesAjuda}</p>
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
