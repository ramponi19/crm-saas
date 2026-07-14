'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Modal, Input, Select, Textarea, Button, ConfirmDialog, notify } from '@/components/ui'
import type { TablesInsert, TablesUpdate } from '@/types/database'

interface Unidade {
  id?: number
  produto_id: number | null
  imei: string | null
  imei2: string | null
  numero_serie: string | null
  bateria: string | null
  condicao: string | null
  cor: string | null
  armazenamento: string | null
  preco_custo: number | null
  preco_venda: number | null
  fornecedor_id: number | null
  observacoes: string | null
  status: string | null
  tipo: string | null
  estado: string | null
  custo_reparo: number | null
  placa: string | null
  chassi: string | null
  renavam: string | null
  km: number | null
  ano: number | null
}

interface Props {
  unidade: Unidade | null
  empresaId: number
  isVeiculo?: boolean
  onClose: () => void
}

const EMPTY: Unidade = {
  produto_id: null, imei: null, imei2: null, numero_serie: null, bateria: null,
  condicao: 'novo', cor: null, armazenamento: null, preco_custo: null, preco_venda: null,
  fornecedor_id: null, observacoes: null, status: 'disponivel', tipo: 'compra',
  estado: 'lacrado', custo_reparo: null,
  placa: null, chassi: null, renavam: null, km: null, ano: null,
}

const supabase = createClient()

export default function UnidadeModal({ unidade, empresaId, isVeiculo = false, onClose }: Props) {
  const router = useRouter()
  const isNew = !unidade?.id
  const [form, setForm] = useState<Unidade>(isNew ? EMPTY : { ...EMPTY, ...unidade })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [produtos, setProdutos] = useState<{ id: number; nome: string; marca_nome: string; cores: string[]; armazenamentos: string[] }[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: number; nome_fantasia: string }[]>([])

  useEffect(() => {
    supabase.from('produtos').select('id, nome, cores, armazenamentos, marcas_produtos!marca_id(nome)').eq('ativo', true).order('nome')
      .then(({ data }) => {
        type ProdRow = { id: number; nome: string; cores: string[] | null; armazenamentos: string[] | null; marcas_produtos: { nome: string | null } | { nome: string | null }[] | null }
        setProdutos(((data ?? []) as unknown as ProdRow[]).map(p => {
          const m = Array.isArray(p.marcas_produtos) ? p.marcas_produtos[0] : p.marcas_produtos
          return { id: p.id, nome: p.nome, marca_nome: m?.nome ?? '', cores: p.cores ?? [], armazenamentos: p.armazenamentos ?? [] }
        }))
      })
    supabase.from('fornecedores').select('id, nome_fantasia').eq('ativo', true).order('nome_fantasia')
      .then(({ data }) => setFornecedores(data ?? []))
  }, [])

  function set(field: keyof Unidade, value: string | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  const margem = form.preco_venda && form.preco_custo
    ? ((form.preco_venda - form.preco_custo) / form.preco_custo * 100).toFixed(1)
    : null

  // Modelo selecionado → listas exclusivas de cor/armazenamento (se cadastradas).
  const produtoSel = produtos.find((p) => p.id === form.produto_id)

  async function salvar() {
    if (!form.produto_id) { notify.warn('Selecione um produto'); return }
    setSaving(true)
    const payload = { ...form, ativo: true, empresa_id: empresaId }

    if (isNew) {
      const { error } = await supabase.from('inventario_unidades').insert(payload as TablesInsert<'inventario_unidades'>)
      if (error) { notify.bad('Erro ao cadastrar', error.message); setSaving(false); return }
      notify.ok('Unidade adicionada ao estoque')
    } else {
      const { error } = await supabase.from('inventario_unidades').update(payload as TablesUpdate<'inventario_unidades'>).eq('id', unidade!.id!)
      if (error) { notify.bad('Erro ao salvar'); setSaving(false); return }
      notify.ok('Unidade atualizada')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    await supabase.from('inventario_unidades').update({ ativo: false }).eq('id', unidade!.id!)
    notify.ok('Removido do estoque')
    router.refresh()
    onClose()
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        disableOverlayClose={saving}
        title={
          <span className="flex items-center gap-2.5">
            <span className="truncate">{isNew ? (isVeiculo ? 'Adicionar veículo' : 'Adicionar unidade') : (isVeiculo ? 'Editar veículo' : 'Editar unidade')}</span>
            {!isNew && <span className="num text-[12px] font-normal text-ink-3">#{unidade?.id}</span>}
          </span>
        }
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
        <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-2 gap-3">
          <Select
            wrapperClassName="col-span-2"
            label={isVeiculo ? 'Modelo' : 'Produto'}
            required
            value={form.produto_id ?? ''}
            onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{isVeiculo ? 'Selecionar modelo…' : 'Selecionar produto…'}</option>
            {produtos.map(p => (
              <option key={p.id} value={p.id}>{p.marca_nome} {p.nome}</option>
            ))}
          </Select>

          <Select label="Status" value={form.status ?? ''} onChange={e => set('status', e.target.value || null)}>
            <option value="disponivel">Disponível</option>
            <option value="reservado">Reservado</option>
            <option value="vendido">Vendido</option>
            <option value="assistencia">Assistência</option>
          </Select>
          <Select label="Tipo" value={form.tipo ?? ''} onChange={e => set('tipo', e.target.value || null)}>
            <option value="compra">Compra</option>
            <option value="seminovo">Seminovo</option>
            <option value="troca">Troca</option>
            <option value="consignado">Consignado</option>
          </Select>

          {isVeiculo ? (
            <>
              <Input label="Placa" value={form.placa ?? ''} onChange={e => set('placa', e.target.value.toUpperCase() || null)} placeholder="ABC1D23" className="num" />
              <Input label="Ano/modelo" type="number" value={form.ano ?? ''} onChange={e => set('ano', e.target.value ? Number(e.target.value) : null)} placeholder="2022" className="num" />
              <Input label="Chassi" value={form.chassi ?? ''} onChange={e => set('chassi', e.target.value.toUpperCase() || null)} placeholder="9BW…" className="num" />
              <Input label="Renavam" value={form.renavam ?? ''} onChange={e => set('renavam', e.target.value || null)} placeholder="00000000000" className="num" />
              <Input label="Km" type="number" value={form.km ?? ''} onChange={e => set('km', e.target.value ? Number(e.target.value) : null)} placeholder="45000" className="num" />
              <Input label="Cor" value={form.cor ?? ''} onChange={e => set('cor', e.target.value || null)} placeholder="Prata, Preto…" />

              <Select label="Condição" value={form.condicao ?? ''} onChange={e => set('condicao', e.target.value || null)}>
                <option value="novo">0km</option>
                <option value="seminovo">Seminovo</option>
                <option value="usado">Usado</option>
              </Select>
              <Select label="Estado" value={form.estado ?? ''} onChange={e => set('estado', e.target.value || null)}>
                <option value="excelente">Excelente</option>
                <option value="otimo">Ótimo</option>
                <option value="bom">Bom</option>
                <option value="regular">Regular</option>
              </Select>
            </>
          ) : (
            <>
              <Input label="IMEI 1" value={form.imei ?? ''} onChange={e => set('imei', e.target.value || null)} placeholder="000000000000000" className="num" />
              <Input label="IMEI 2 / Série" value={form.imei2 ?? ''} onChange={e => set('imei2', e.target.value || null)} placeholder="000000000000000" className="num" />
              <Input label="Número de série" value={form.numero_serie ?? ''} onChange={e => set('numero_serie', e.target.value || null)} placeholder="XXXXX" className="num" />
              <Input label="Bateria %" value={form.bateria ?? ''} onChange={e => set('bateria', e.target.value || null)} placeholder="95" className="num" />
              {produtoSel && produtoSel.cores.length > 0 ? (
                <Select label="Cor" value={form.cor ?? ''} onChange={e => set('cor', e.target.value || null)}>
                  <option value="">Selecionar cor…</option>
                  {produtoSel.cores.map(c => <option key={c} value={c}>{c}</option>)}
                  {form.cor && !produtoSel.cores.includes(form.cor) && <option value={form.cor}>{form.cor}</option>}
                </Select>
              ) : (
                <Input label="Cor" value={form.cor ?? ''} onChange={e => set('cor', e.target.value || null)} placeholder="Preto, Branco…" />
              )}
              {produtoSel && produtoSel.armazenamentos.length > 0 ? (
                <Select label="Armazenamento" value={form.armazenamento ?? ''} onChange={e => set('armazenamento', e.target.value || null)}>
                  <option value="">Selecionar armazenamento…</option>
                  {produtoSel.armazenamentos.map(a => <option key={a} value={a}>{a}</option>)}
                  {form.armazenamento && !produtoSel.armazenamentos.includes(form.armazenamento) && <option value={form.armazenamento}>{form.armazenamento}</option>}
                </Select>
              ) : (
                <Input label="Armazenamento" value={form.armazenamento ?? ''} onChange={e => set('armazenamento', e.target.value || null)} placeholder="256GB" />
              )}

              <Select label="Condição" value={form.condicao ?? ''} onChange={e => set('condicao', e.target.value || null)}>
                <option value="novo">Novo</option>
                <option value="seminovo">Seminovo</option>
                <option value="usado">Usado</option>
              </Select>
              <Select label="Estado físico" value={form.estado ?? ''} onChange={e => set('estado', e.target.value || null)}>
                <option value="lacrado">Lacrado</option>
                <option value="excelente">Excelente</option>
                <option value="otimo">Ótimo</option>
                <option value="bom">Bom</option>
                <option value="regular">Regular</option>
              </Select>
            </>
          )}

          <Input
            label="Preço de custo"
            type="number"
            value={form.preco_custo ?? ''}
            onChange={e => set('preco_custo', e.target.value ? Number(e.target.value) : null)}
            placeholder="0,00"
            className="num"
          />
          <Input
            label="Preço de venda"
            hint={margem ? `${margem}% margem` : undefined}
            type="number"
            value={form.preco_venda ?? ''}
            onChange={e => set('preco_venda', e.target.value ? Number(e.target.value) : null)}
            placeholder="0,00"
            className="num"
          />

          <Select label="Fornecedor" value={form.fornecedor_id ?? ''} onChange={e => set('fornecedor_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Nenhum</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
          </Select>
          <Input
            label="Custo de reparo"
            type="number"
            value={form.custo_reparo ?? ''}
            onChange={e => set('custo_reparo', e.target.value || null)}
            placeholder="0,00"
            className="num"
          />

          <Textarea
            wrapperClassName="col-span-2"
            label="Observações"
            rows={3}
            value={form.observacoes ?? ''}
            onChange={e => set('observacoes', e.target.value || null)}
            placeholder="Defeitos, histórico, detalhes…"
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={excluir}
        title="Remover unidade?"
        description="Esta unidade deixará de aparecer no estoque."
        confirmLabel="Remover"
        tone="danger"
      />
    </>
  )
}
