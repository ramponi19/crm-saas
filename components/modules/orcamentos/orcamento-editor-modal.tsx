'use client'

import { useState } from 'react'
import { Button, Input, Select, Textarea, Modal, notify } from '@/components/ui'
import { Plus, X } from 'lucide-react'
import { ClienteAutocomplete } from '@/app/(dashboard)/orcamentos/cliente-autocomplete'
import type { ItemOrc, Orcamento, UnidadeOpt, PrecoRef } from '@/app/(dashboard)/orcamentos/tipos'

/**
 * Editor de orçamento — extraído da tela de Orçamentos para poder abrir também
 * DENTRO do chat do lead.
 *
 * Antes, criar orçamento a partir da conversa fazia router.push('/orcamentos'):
 * o atendente perdia o chat no meio do atendimento e não voltava para ele. Agora
 * é o mesmo formulário, em modal, sobre a conversa. Um segundo formulário aqui
 * divergiria do original na primeira regra nova — e este tem conta de saldo,
 * acerto de diferença e baixa de estoque.
 */

export interface EditorOrcamento {
  id?: number; lead_id?: number | null; tipo: string; cliente_nome: string; cliente_telefone: string
  /** Cadastro escolhido na busca. Null = lead ou nome novo. */
  cliente_id: number | null
  aparelho: string; imei: string; defeito: string; prazo_dias: string; garantia_dias: string
  itens: ItemOrc[]; aparelho_novo: string; valor_novo: string; aparelho_usado: string; valor_entrada: string
  unidade_id: number | null; observacoes: string; acerto: string
}

export const orcamentoVazio = (tipo = 'assistencia'): EditorOrcamento => ({
  tipo, lead_id: null, cliente_nome: '', cliente_telefone: '', cliente_id: null, aparelho: '', imei: '', defeito: '',
  prazo_dias: '', garantia_dias: '', itens: [{ descricao: '', qtd: 1, valor: 0 }],
  aparelho_novo: '', valor_novo: '', aparelho_usado: '', valor_entrada: '', unidade_id: null,
  observacoes: '', acerto: 'dinheiro',
})

/** Monta o editor a partir de um orçamento já salvo (edição). */
export function editorDoOrcamento(o: Orcamento): EditorOrcamento {
  return {
    id: o.id, lead_id: o.lead_id, tipo: o.tipo, cliente_nome: o.cliente_nome, cliente_telefone: o.cliente_telefone ?? '',
    cliente_id: o.cliente_id ?? null,
    aparelho: o.aparelho ?? '', imei: o.imei ?? '', defeito: o.defeito ?? '',
    prazo_dias: o.prazo_dias != null ? String(o.prazo_dias) : '',
    garantia_dias: o.garantia_dias != null ? String(o.garantia_dias) : '',
    itens: o.itens.length ? o.itens.map((i) => ({ ...i })) : [{ descricao: '', qtd: 1, valor: 0 }],
    aparelho_novo: o.aparelho_novo ?? '', valor_novo: o.valor_novo != null ? String(o.valor_novo) : '',
    aparelho_usado: o.aparelho_usado ?? '', valor_entrada: o.valor_entrada != null ? String(o.valor_entrada) : '',
    unidade_id: o.unidade_id, observacoes: o.observacoes ?? '', acerto: o.acerto ?? 'dinheiro',
  }
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const LABEL_DESC: Record<string, string> = {
  assistencia: 'Defeito / diagnóstico', melhoria: 'Objetivo do upgrade', venda: 'Descrição do aparelho',
}

// Quando o aparelho que o cliente entrega vale MAIS que o que ele leva, sobra
// saldo a favor dele. Como isso se acerta nao tem regra: depende da negociacao.
const ACERTO: Record<string, { label: string; curto: string; nota: string }> = {
  dinheiro: { label: 'Devolver em dinheiro', curto: 'em dinheiro',
    nota: 'Gera uma despesa a pagar no Financeiro quando o cliente aprovar.' },
  credito: { label: 'Crédito na loja', curto: 'como crédito na loja',
    nota: 'Fica como despesa a pagar no Financeiro, para não ser esquecido. Atenção: o PDV ainda não abate crédito automaticamente — o desconto é aplicado na mão na próxima compra.' },
  produto: { label: 'Abater em produto/serviço', curto: 'abatido em produto ou serviço',
    nota: 'Lance os acessórios ou o serviço nos itens acima até o saldo fechar. Nada é gerado no Financeiro.' },
  nenhum: { label: 'Sem devolução (negociado)', curto: 'sem devolução, conforme negociado',
    nota: 'O cliente concordou em não receber a diferença. Nada é gerado no Financeiro.' },
}

/** Casa um texto de modelo (ex.: "iPhone 14 128GB") com a tabela de preços. */
export function sugerirPreco(texto: string, tabela: PrecoRef[]): number | null {
  const t = texto.trim().toLowerCase()
  if (!t || tabela.length === 0) return null
  const cands = tabela.filter((p) => { const m = p.modelo.toLowerCase(); return m === t || t.includes(m) || m.includes(t) })
  if (!cands.length) return null
  const comArm = cands.find((p) => p.armazenamento && t.includes(p.armazenamento.toLowerCase()))
  const novo = cands.find((p) => p.condicao === 'novo')
  return (comArm ?? novo ?? cands[0]).preco_sugerido
}

export interface OrcamentoSalvo { id?: number; token?: string; leadId: number | null }

export function OrcamentoEditorModal({
  inicial, unidades = [], tabelaPrecos = [], onClose, onSaved,
}: {
  inicial: EditorOrcamento
  unidades?: UnidadeOpt[]
  tabelaPrecos?: PrecoRef[]
  onClose: () => void
  onSaved?: (r: OrcamentoSalvo) => void
}) {
  const [editor, setEditor] = useState<EditorOrcamento>(inicial)
  const [salvando, setSalvando] = useState(false)

  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const isDowngrade = editor.tipo === 'downgrade'
  const sugDowngrade = isDowngrade ? sugerirPreco(editor.aparelho_novo, tabelaPrecos) : null

  // Mesma conta da rota de salvar (app/api/orcamentos/route.ts). No downgrade o
  // saldo cai para qualquer lado: positivo o cliente paga, negativo a loja acerta.
  const itensTotal = editor.itens.reduce((s, i) => s + Math.max(1, i.qtd) * (Number(i.valor) || 0), 0)
  const saldo = isDowngrade
    ? (Number(editor.valor_novo) || 0) + itensTotal - (Number(editor.valor_entrada) || 0)
    : itensTotal
  const total = Math.max(0, saldo)
  const devolver = isDowngrade ? Math.max(0, -saldo) : 0

  function setItem(i: number, patch: Partial<ItemOrc>) {
    setEditor((e) => ({ ...e, itens: e.itens.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }))
  }

  function blocoItens(titulo: string) {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink">{titulo}</span>
          <button onClick={() => setEditor({ ...editor, itens: [...editor.itens, { descricao: '', qtd: 1, valor: 0 }] })} className="flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"><Plus size={13} strokeWidth={2} /> Adicionar</button>
        </div>
        <div className="space-y-2">
          {editor.itens.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_60px_100px_auto] items-center gap-2">
              <Input value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} placeholder="Descrição" />
              <Input type="number" value={String(it.qtd)} onChange={(e) => setItem(i, { qtd: Math.max(1, Number(e.target.value) || 1) })} title="Qtd" />
              <Input type="number" value={String(it.valor)} onChange={(e) => setItem(i, { valor: Number(e.target.value) || 0 })} title="Valor unit." />
              <button onClick={() => setEditor({ ...editor, itens: editor.itens.filter((_, idx) => idx !== i) })} className="text-ink-3 hover:text-bad" aria-label="Remover"><X size={15} strokeWidth={1.8} /></button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  async function salvar(enviar: boolean) {
    if (!editor.cliente_nome.trim()) { notify.warn('Informe o cliente'); return }
    setSalvando(true)
    const r = await fetch('/api/orcamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editor.id, lead_id: editor.lead_id ?? null, tipo: editor.tipo, status: enviar ? 'enviado' : undefined,
        cliente_nome: editor.cliente_nome, cliente_telefone: editor.cliente_telefone,
        cliente_id: editor.cliente_id ?? null,
        aparelho: editor.aparelho, imei: editor.imei, defeito: editor.defeito,
        prazo_dias: editor.prazo_dias ? Number(editor.prazo_dias) : undefined,
        garantia_dias: editor.garantia_dias ? Number(editor.garantia_dias) : undefined,
        itens: editor.itens,
        aparelho_novo: editor.aparelho_novo, valor_novo: Number(editor.valor_novo) || 0,
        aparelho_usado: editor.aparelho_usado, valor_entrada: Number(editor.valor_entrada) || 0,
        unidade_id: editor.unidade_id ?? null,
        observacoes: editor.observacoes,
        acerto: editor.acerto,
      }),
    })
    setSalvando(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Erro ao salvar', j.error); return }
    if (enviar && j.token) {
      navigator.clipboard?.writeText(`${base}/orcamento/${j.token}`)
      notify.ok('Orçamento salvo', 'Link copiado para enviar ao cliente')
    } else notify.ok('Orçamento salvo')
    onSaved?.({ id: j.id, token: j.token, leadId: editor.lead_id ?? null })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={editor.id ? 'Editar orçamento' : 'Novo orçamento'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="outline" onClick={() => salvar(false)} loading={salvando}>Salvar</Button>
        <Button onClick={() => salvar(true)} loading={salvando}>Salvar e copiar link</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Tipo" value={editor.tipo} onChange={(e) => setEditor({ ...editor, tipo: e.target.value })}>
            <option value="assistencia">Conserto</option>
            <option value="melhoria">Upgrade (melhoria)</option>
            <option value="venda">Venda (novo/semi-novo)</option>
            <option value="downgrade">Downgrade (com diferença)</option>
          </Select>
          <ClienteAutocomplete
            nome={editor.cliente_nome}
            // Digitar por cima SOLTA o cadastro: o nome deixou de ser o daquele
            // cliente, e manter o id ligaria a venda a quem nao foi atendido.
            onNome={(v) => setEditor({ ...editor, cliente_nome: v, cliente_id: null })}
            onSelect={(c) => setEditor({ ...editor, cliente_nome: c.nome, cliente_telefone: c.telefone, cliente_id: c.cliente_id })}
          />
          <Input label="WhatsApp/telefone" value={editor.cliente_telefone} onChange={(e) => setEditor({ ...editor, cliente_telefone: e.target.value })} />
        </div>

        {isDowngrade ? (
          <div className="space-y-3 rounded-control border border-line-soft p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
              <Input label="Aparelho novo" value={editor.aparelho_novo} onChange={(e) => setEditor({ ...editor, aparelho_novo: e.target.value })} placeholder="Ex.: iPhone 14 128GB" />
              <Input label="Valor (R$)" type="number" value={editor.valor_novo} onChange={(e) => setEditor({ ...editor, valor_novo: e.target.value })} />
            </div>
            {sugDowngrade != null && String(sugDowngrade) !== editor.valor_novo && (
              <button type="button" onClick={() => setEditor({ ...editor, valor_novo: String(sugDowngrade) })}
                className="flex w-full items-center justify-between rounded-control border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] text-ink-2 transition-colors hover:border-accent">
                <span>Tabela de preços sugere <strong className="text-ink">{brl(sugDowngrade)}</strong> para “{editor.aparelho_novo}”</span>
                <span className="font-semibold text-accent">Aplicar</span>
              </button>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
              <Input label="Aparelho do cliente (entrada)" value={editor.aparelho_usado} onChange={(e) => setEditor({ ...editor, aparelho_usado: e.target.value })} placeholder="Ex.: iPhone 12 64GB" />
              <Input label="Vale (R$)" type="number" value={editor.valor_entrada} onChange={(e) => setEditor({ ...editor, valor_entrada: e.target.value })} />
            </div>

            {/* Itens valem no downgrade também: é por aqui que o saldo a favor
                do cliente é abatido em acessório, película ou serviço. */}
            {blocoItens('Acessórios / serviços na negociação (opcional)')}

            {devolver > 0 && (
              <div className="space-y-2 rounded-control border border-ok/30 bg-ok/[0.05] p-3">
                <div className="text-[12.5px] text-ink-2">
                  O aparelho do cliente vale <strong className="text-ink">{brl(devolver)}</strong> mais que o que ele leva.
                </div>
                <Select label="Acerto da diferença" value={editor.acerto} onChange={(e) => setEditor({ ...editor, acerto: e.target.value })}>
                  {Object.entries(ACERTO).map(([v, a]) => <option key={v} value={v}>{a.label}</option>)}
                </Select>
                <div className="text-[11.5px] text-ink-3">{ACERTO[editor.acerto]?.nota}</div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Aparelho" value={editor.aparelho} onChange={(e) => setEditor({ ...editor, aparelho: e.target.value })} placeholder="Modelo" />
              <Input label="IMEI / série (opcional)" value={editor.imei} onChange={(e) => setEditor({ ...editor, imei: e.target.value })} />
            </div>
            {editor.tipo === 'venda' && unidades.length > 0 && (
              <Select label="Aparelho do estoque (baixa ao aprovar)" value={editor.unidade_id != null ? String(editor.unidade_id) : ''}
                onChange={(e) => {
                  const uid = e.target.value ? Number(e.target.value) : null
                  const u = unidades.find((x) => x.id === uid)
                  setEditor({ ...editor, unidade_id: uid, itens: u ? [{ descricao: u.label, qtd: 1, valor: u.preco }] : editor.itens })
                }}>
                <option value="">Sem baixa de estoque (item livre)</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.label} — {brl(u.preco)}</option>)}
              </Select>
            )}
            <Textarea label={LABEL_DESC[editor.tipo] ?? 'Descrição'} rows={2} value={editor.defeito} onChange={(e) => setEditor({ ...editor, defeito: e.target.value })} />

            {blocoItens('Itens (peças + mão de obra)')}

            <div className="grid grid-cols-2 gap-3">
              <Input label="Prazo (dias)" type="number" value={editor.prazo_dias} onChange={(e) => setEditor({ ...editor, prazo_dias: e.target.value })} />
              <Input label="Garantia (dias)" type="number" value={editor.garantia_dias} onChange={(e) => setEditor({ ...editor, garantia_dias: e.target.value })} />
            </div>
          </>
        )}

        <Textarea label="Observações (opcional)" rows={2} value={editor.observacoes} onChange={(e) => setEditor({ ...editor, observacoes: e.target.value })} />

        {/* Um dos dois lados, nunca os dois: ou o cliente paga, ou a loja
            acerta com ele. Antes o segundo caso era zerado e sumia da tela. */}
        {devolver > 0 ? (
          <div className="rounded-control bg-ok/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-2">Loja acerta com o cliente</span>
              <span className="num text-[20px] font-bold text-ok">{brl(devolver)}</span>
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-3">{ACERTO[editor.acerto]?.curto}</div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-control bg-accent-soft px-4 py-3">
            <span className="text-[13px] font-medium text-ink-2">{isDowngrade ? 'Cliente paga' : 'Total'}</span>
            <span className="num text-[20px] font-bold text-accent">{brl(total)}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
