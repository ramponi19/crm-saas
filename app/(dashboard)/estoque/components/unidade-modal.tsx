'use client'

import { useState, useEffect } from 'react'
import { margem as margemDe } from '@/lib/custo'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Modal, Input, Select, Textarea, Button, ConfirmDialog, UploadFotos, notify } from '@/components/ui'
import type { TablesUpdate } from '@/types/database'
import { NADA_GRAVADO, nadaGravado } from '@/lib/linhas-afetadas'
import { ESTOQUE_CELULAR } from '@/components/modules/celulares/rotulos'
import { CamposCelularModal, CampoBateriaModal } from '@/components/modules/celulares/campos-unidade'
import { ESTOQUE_VEICULO } from '@/components/modules/veiculos/rotulos'
import { CamposVeiculoModal } from '@/components/modules/veiculos/campos-veiculo'

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
  /** URLs separadas por vírgula — mesmo formato que /avaliacoes já usa. */
  fotos_urls: string | null
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
  /** Módulo Avaliações ligado + campo placa no item (ver EstoqueView). */
  isVeiculo?: boolean
  /** Módulo Celulares ligado: IMEI 1 e 2, bateria, armazenamento, seminovo. */
  celulares?: boolean
  /** estoque.ver_custo (etapa 1.1e): sem ela não há campo de custo; a unidade nova nasce com custo pendente. */
  verCusto?: boolean
  onClose: () => void
}

/** Os rótulos do modal sem módulo de ramo (com Celulares: ESTOQUE_CELULAR). */
const GENERICO = {
  armazenamento: 'Variante',
  armazenamentoPlaceholder: 'Ex.: Tamanho M',
  fotosAjuda: 'A peça de verdade — riscos, marcas de uso. Serve de prova do estado na venda e na garantia.',
  tipoSeminovo: 'Usado',
  condicaoSeminovo: 'Usado',
}

const EMPTY: Unidade = {
  produto_id: null, imei: null, imei2: null, numero_serie: null, bateria: null,
  condicao: 'novo', cor: null, armazenamento: null, preco_custo: null, preco_venda: null,
  fornecedor_id: null, observacoes: null, fotos_urls: null, status: 'disponivel', tipo: 'compra',
  estado: 'lacrado', custo_reparo: null,
  placa: null, chassi: null, renavam: null, km: null, ano: null,
}

const supabase = createClient()

export default function UnidadeModal({ unidade, empresaId, isVeiculo = false, celulares = false, onClose, verCusto = false }: Props) {
  const router = useRouter()
  const R = celulares ? ESTOQUE_CELULAR : GENERICO
  const isNew = !unidade?.id
  const [form, setForm] = useState<Unidade>(isNew ? EMPTY : { ...EMPTY, ...unidade })
  const [saving, setSaving] = useState(false)
  // Unidade existente abre em modo VISUALIZAÇÃO; edita só ao clicar "Editar".
  const [editando, setEditando] = useState(isNew)
  const [confirmDel, setConfirmDel] = useState(false)
  const [produtos, setProdutos] = useState<{ id: number; nome: string; marca_nome: string; cores: string[]; armazenamentos: string[] }[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: number; nome_fantasia: string }[]>([])

  useEffect(() => {
    supabase.from('estoque_produtos').select('id, nome, cores, armazenamentos, marcas_produtos:estoque_marcas!marca_id(nome)').eq('ativo', true).order('nome')
      .then(({ data }) => {
        type ProdRow = { id: number; nome: string; cores: string[] | null; armazenamentos: string[] | null; marcas_produtos: { nome: string | null } | { nome: string | null }[] | null }
        setProdutos(((data ?? []) as unknown as ProdRow[]).map(p => {
          const m = Array.isArray(p.marcas_produtos) ? p.marcas_produtos[0] : p.marcas_produtos
          return { id: p.id, nome: p.nome, marca_nome: m?.nome ?? '', cores: p.cores ?? [], armazenamentos: p.armazenamentos ?? [] }
        }))
      })
    supabase.from('estoque_fornecedores').select('id, nome_fantasia').eq('ativo', true).order('nome_fantasia')
      .then(({ data }) => setFornecedores(data ?? []))
  }, [])

  function set(field: keyof Unidade, value: string | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Fórmula única (lib/custo): margem sobre o PREÇO DE VENDA, custo = custo + reparo. Antes este modal dividia
  // pelo custo e a lista pela venda: a mesma peça mostrava duas margens.
  const margemNum = verCusto && form.preco_venda && form.preco_custo
    ? margemDe(Number(form.preco_venda), Number(form.preco_custo) + (Number(form.custo_reparo) || 0)) : null
  const margem = margemNum != null ? margemNum.toFixed(1) : null

  // Modelo selecionado → listas exclusivas de cor/armazenamento (se cadastradas).
  const produtoSel = produtos.find((p) => p.id === form.produto_id)

  async function salvar() {
    // Item recebido em troca não tem cadastro de produto — é o usado do
    // cliente. Exigir um aqui impediria precificar a revenda, que é justamente
    // o passo seguinte à troca. Para os outros tipos o produto continua obrigatório.
    if (!form.produto_id && form.tipo !== 'troca') { notify.warn('Selecione um produto'); return }
    setSaving(true)
    // Payload explícito com as colunas reais da tabela — o form pode carregar
    // chaves derivadas (produto_nome/marca_nome/fornecedor_nome) que quebrariam o insert/update.
    const num = (v: unknown) => (v === '' || v == null ? null : Number(v))
    const payload = {
      empresa_id: empresaId, ativo: true,
      produto_id: form.produto_id,
      imei: form.imei, imei2: form.imei2, numero_serie: form.numero_serie, bateria: form.bateria,
      condicao: form.condicao, cor: form.cor, armazenamento: form.armazenamento,
      // Etapa 1.1e: sem preco_custo/custo_reparo. O custo vai pelo banco (estoque_unidade_criar / estoque_custo_informar).
      preco_venda: num(form.preco_venda),
      fornecedor_id: form.fornecedor_id, observacoes: form.observacoes, fotos_urls: form.fotos_urls, status: form.status, tipo: form.tipo, estado: form.estado,
      placa: form.placa, chassi: form.chassi, renavam: form.renavam, km: num(form.km), ano: num(form.ano),
    }

    /**
     * Os campos de veículo vão para `veiculo_dados` ALÉM das colunas antigas.
     *
     * Escrita dupla temporária (Fase 3 do isolamento por tipo de negócio): a leitura ainda
     * usa as colunas de `inventario_unidades`, então elas continuam recebendo; a
     * tabela nova recebe em paralelo para o dado de hoje já estar no lugar certo
     * quando a leitura migrar. Sem isso, o dia da troca traria placa vazia em tudo
     * que foi cadastrado antes.
     *
     * `upsert` e não `insert`: aqui o mesmo formulário cria E edita.
     */
    async function gravarVeiculo(unidadeId: number) {
      if (!isVeiculo) return
      const { error } = await supabase.from('avaliacoes_veiculo_dados').upsert({
        unidade_id: unidadeId,
        empresa_id: empresaId,
        placa: form.placa, chassi: form.chassi, renavam: form.renavam,
        km: num(form.km), ano: num(form.ano),
      } as never, { onConflict: 'unidade_id' })
      // Não desfaz o cadastro: a unidade existe e as colunas antigas têm o dado.
      if (error) console.error('[estoque] veiculo_dados não gravado:', error.message)
    }

    if (isNew) {
      // Nasce pela função do banco: o custo entra só com a permissão (ou na troca); sem ela, fica pendente.
      const p = verCusto ? { ...payload, preco_custo: num(form.preco_custo), custo_reparo: num(form.custo_reparo) } : payload
      const { data: novoId, error } = await supabase.rpc('estoque_unidade_criar' as never, { p } as never)
      if (error || novoId == null) { notify.bad('Erro ao cadastrar', error?.message ?? 'Sem resposta do banco'); setSaving(false); return }
      await gravarVeiculo(Number(novoId))
      notify.ok('Unidade adicionada ao estoque')
    } else {
      const { data: gravou, error } = await supabase.from('estoque_unidades').update(payload as TablesUpdate<'estoque_unidades'>).eq('id', unidade!.id!).select('id')
      if (error) { notify.bad('Erro ao salvar', error.message); setSaving(false); return }
      if (nadaGravado(gravou)) { notify.bad('Erro ao salvar', NADA_GRAVADO); setSaving(false); return }
      await gravarVeiculo(unidade!.id!)
      // Custo mudou (só com a permissão): pelo banco, com auditoria. Se a unidade foi vendida com custo pendente, a
      // venda recebe o custo uma vez.
      const custoMudou = verCusto
        && (num(form.preco_custo) !== num(unidade?.preco_custo) || num(form.custo_reparo) !== num(unidade?.custo_reparo))
      if (custoMudou && num(form.preco_custo) == null) {
        // estoque_custo_informar exige o custo: reparo sozinho, ou custo apagado, não grava — avisar em vez de calar
        notify.warn('Unidade atualizada, mas o custo não', 'Informe o preço de custo para gravar o custo e o reparo.')
        router.refresh(); setSaving(false); onClose(); return
      }
      if (custoMudou) {
        const { error: erroCusto } = await supabase.rpc('estoque_custo_informar' as never, {
          p_unidade: unidade!.id!, p_custo: num(form.preco_custo), p_reparo: num(form.custo_reparo), p_motivo: 'editado na unidade',
        } as never)
        if (erroCusto) { notify.bad('Custo não gravado', erroCusto.message); setSaving(false); return }
      }
      notify.ok('Unidade atualizada')
    }
    router.refresh()
    onClose()
  }

  async function excluir() {
    const { data: removeu, error } = await supabase.from('estoque_unidades').update({ ativo: false }).eq('id', unidade!.id!).select('id')
    if (error) { notify.bad('Erro ao remover', error.message); return }
    if (nadaGravado(removeu)) { notify.bad('Erro ao remover', NADA_GRAVADO); return }
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
            <span className="truncate">{isNew ? (isVeiculo ? ESTOQUE_VEICULO.modalNovo : 'Adicionar unidade') : (isVeiculo ? ESTOQUE_VEICULO.modalEditar : 'Editar unidade')}</span>
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
            {!editando ? (
              <>
                <Button variant="ghost" onClick={onClose}>Fechar</Button>
                <Button onClick={() => setEditando(true)}>Editar</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
                <Button onClick={salvar} loading={saving}>Salvar</Button>
              </>
            )}
          </>
        }
      >
        <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <fieldset disabled={!editando} className="contents">
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
            {/* Faltava aqui: abrir uma unidade pendente deixava o campo em branco,
                porque o valor não existia na lista. Para liberar de verdade use
                "Confirmar chegada" na lista — é ela que grava quem recebeu e
                quando, e libera comissão e ranking. */}
            <option value="pendente">Pendente (aguardando chegar)</option>
            <option value="reservado">Reservado</option>
            <option value="vendido">Vendido</option>
            <option value="assistencia">Assistência</option>
          </Select>
          <Select label="Tipo" value={form.tipo ?? ''} onChange={e => set('tipo', e.target.value || null)}>
            <option value="compra">Compra</option>
            {/* "Seminovo" é do módulo Celulares; sem ele, só aparece se a unidade já tem. */}
            {(celulares || form.tipo === 'seminovo') && <option value="seminovo">{R.tipoSeminovo}</option>}
            <option value="troca">Troca</option>
            <option value="consignado">Consignado</option>
          </Select>

          {isVeiculo ? (
            <CamposVeiculoModal form={form} set={set} />
          ) : (
            <>
              {celulares && <CamposCelularModal form={form} set={set} />}
              <Input label="Número de série" value={form.numero_serie ?? ''} onChange={e => set('numero_serie', e.target.value || null)} placeholder="XXXXX" className="num" />
              {celulares && <CampoBateriaModal form={form} set={set} />}
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
                <Select label={R.armazenamento} value={form.armazenamento ?? ''} onChange={e => set('armazenamento', e.target.value || null)}>
                  <option value="">{`Selecionar ${R.armazenamento.toLowerCase()}…`}</option>
                  {produtoSel.armazenamentos.map(a => <option key={a} value={a}>{a}</option>)}
                  {form.armazenamento && !produtoSel.armazenamentos.includes(form.armazenamento) && <option value={form.armazenamento}>{form.armazenamento}</option>}
                </Select>
              ) : (
                <Input label={R.armazenamento} value={form.armazenamento ?? ''} onChange={e => set('armazenamento', e.target.value || null)} placeholder={R.armazenamentoPlaceholder} />
              )}

              <Select label="Condição" value={form.condicao ?? ''} onChange={e => set('condicao', e.target.value || null)}>
                <option value="novo">Novo</option>
                {(celulares || form.condicao === 'seminovo') && <option value="seminovo">{R.condicaoSeminovo}</option>}
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

          {verCusto && (
            <Input
              label="Preço de custo"
              hint={!isNew && unidade?.preco_custo == null ? 'Custo pendente: informe para fechar a margem' : undefined}
              type="number"
              value={form.preco_custo ?? ''}
              onChange={e => set('preco_custo', e.target.value ? Number(e.target.value) : null)}
              placeholder="0,00"
              className="num"
            />
          )}
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
          {verCusto && (
            <Input
              label="Custo de reparo"
              type="number"
              value={form.custo_reparo ?? ''}
              onChange={e => set('custo_reparo', e.target.value || null)}
              placeholder="0,00"
              className="num"
            />
          )}

          <Textarea
            wrapperClassName="col-span-2"
            label="Observações"
            rows={3}
            value={form.observacoes ?? ''}
            onChange={e => set('observacoes', e.target.value || null)}
            placeholder="Defeitos, histórico, detalhes…"
          />

          {/* Fotos DESTA unidade (não do modelo): estado real da peça —
              riscos, marcas de uso. É a prova do que foi vendido. */}
          <div className="col-span-2">
            <UploadFotos
              label="Fotos desta unidade"
              value={(form.fotos_urls ?? '').split(',').map(u => u.trim()).filter(Boolean)}
              onChange={urls => set('fotos_urls', urls.join(',') || null)}
              empresaId={empresaId}
              max={8}
              ajuda={R.fotosAjuda}
            />
          </div>
          </fieldset>
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
