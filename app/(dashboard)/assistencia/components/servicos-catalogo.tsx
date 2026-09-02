'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Wrench, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { formatCurrency } from '@/lib/utils'
import { Card, Table, Badge, Button, EmptyState, Modal, Input, Select, notify, type Column } from '@/components/ui'

export interface ServicoReparo {
  id: number
  nome: string
  categoria: string | null
  preco: number
  tempo_estimado_min: number | null
  ativo: boolean
}

const CATEGORIAS = ['Tela', 'Bateria', 'Conector de carga', 'Câmera', 'Alto-falante', 'Botão', 'Placa', 'Software', 'Outros']

const EMPTY = { nome: '', categoria: '', preco: '', tempo: '' }

export default function ServicosCatalogo({ servicos }: { servicos: ServicoReparo[] }) {
  const router = useRouter()
  const { resolverEmpresaId } = useEmpresa()
  const [edit, setEdit] = useState<ServicoReparo | null>(null)
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState<number | null>(null)

  function abrirNovo() { setForm(EMPTY); setEdit(null); setNovo(true) }
  function abrirEdit(s: ServicoReparo) {
    setForm({ nome: s.nome, categoria: s.categoria ?? '', preco: String(s.preco), tempo: s.tempo_estimado_min ? String(s.tempo_estimado_min) : '' })
    setEdit(s); setNovo(true)
  }

  async function salvar() {
    if (!form.nome.trim()) { notify.warn('Informe o nome do serviço'); return }
    const empresaId = await resolverEmpresaId()
    if (!empresaId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    setSalvando(true)
    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim(),
      categoria: form.categoria || null,
      preco: Number(String(form.preco).replace(',', '.')) || 0,
      tempo_estimado_min: form.tempo ? Number(form.tempo) : null,
    }
    const supabase = createClient()
    const { error } = edit
      ? await supabase.from('servicos_reparo').update(payload as never).eq('id', edit.id)
      : await supabase.from('servicos_reparo').insert(payload as never)
    setSalvando(false)
    if (error) { notify.bad('Erro ao salvar serviço'); return }
    notify.ok(edit ? 'Serviço atualizado' : 'Serviço cadastrado')
    setNovo(false); router.refresh()
  }

  async function remover(s: ServicoReparo) {
    setRemovendo(s.id)
    const { error } = await createClient().from('servicos_reparo').update({ ativo: false } as never).eq('id', s.id)
    setRemovendo(null)
    if (error) { notify.bad('Erro ao remover'); return }
    notify.ok('Serviço removido'); router.refresh()
  }

  const cols: Column<ServicoReparo>[] = [
    { key: 'nome', header: 'Serviço', render: (s) => <span className="font-medium text-ink">{s.nome}</span> },
    { key: 'categoria', header: 'Categoria', hideOnMobile: true, render: (s) => s.categoria ? <Badge tone="neutro">{s.categoria}</Badge> : <span className="text-ink-3">—</span> },
    { key: 'tempo', header: 'Tempo', align: 'right', className: 'num', hideOnMobile: true, render: (s) => <span className="text-ink-2">{s.tempo_estimado_min ? `${s.tempo_estimado_min} min` : '—'}</span> },
    { key: 'preco', header: 'Preço', align: 'right', className: 'num', render: (s) => <span className="font-semibold text-ink">{formatCurrency(s.preco)}</span> },
    {
      key: 'acoes', header: '', align: 'right',
      render: (s) => (
        <span className="flex items-center justify-end gap-1.5">
          <button onClick={(e) => { e.stopPropagation(); abrirEdit(s) }} title="Editar" className="text-ink-3 hover:text-accent"><Pencil size={14} strokeWidth={1.8} /></button>
          <button onClick={(e) => { e.stopPropagation(); remover(s) }} disabled={removendo === s.id} title="Remover" className="text-ink-3 hover:text-bad disabled:opacity-40"><Trash2 size={14} strokeWidth={1.8} /></button>
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="flex items-center justify-end">
        <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={abrirNovo}>Novo serviço</Button>
      </div>

      <Card flush>
        <Table
          columns={cols}
          rows={servicos}
          rowKey={(s) => s.id}
          onRowClick={abrirEdit}
          empty={<EmptyState icon={<Wrench size={22} strokeWidth={1.7} />} title="Nenhum serviço cadastrado" description="Cadastre os serviços de reparo (com preço) para usar rápido nas ordens de serviço." action={<Button size="sm" onClick={abrirNovo}>Novo serviço</Button>} />}
        />
      </Card>

      {novo && (
        <Modal open onClose={() => setNovo(false)} title={edit ? 'Editar serviço' : 'Novo serviço de reparo'} footer={<>
          <Button variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Salvar</Button>
        </>}>
          <div className="space-y-3.5">
            <Input label="Nome do serviço" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Troca de tela iPhone 13" />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Categoria" value={form.categoria} onChange={(e) => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">—</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input label="Tempo estimado (min)" type="number" value={form.tempo} onChange={(e) => setForm(f => ({ ...f, tempo: e.target.value }))} placeholder="60" />
            </div>
            <Input label="Preço (R$)" type="number" value={form.preco} onChange={(e) => setForm(f => ({ ...f, preco: e.target.value }))} placeholder="0,00" />
          </div>
        </Modal>
      )}
    </>
  )
}
