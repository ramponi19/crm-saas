'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import { Input, Select } from '@/components/ui'
import { ProdutoAutocomplete } from '@/components/modules/leads/produto-autocomplete'
import { formatCurrency } from '@/lib/utils'

/**
 * OS ITENS DA ENCOMENDA.
 *
 * ══ POR QUE VIROU LISTA ════════════════════════════════════════════════════
 *
 * O lançamento nasceu com um produto só, e o dono corrigiu em 15/09/2026:
 * "dentro de encomenda pode ter um ou mais produtos dentro da mesma venda".
 * Cliente que encomenda um iPhone para ele e outro para a esposa faz UM pedido,
 * não dois — e cobrar isso como duas encomendas separadas obriga o vendedor a
 * repetir cliente, endereço, entrada e prazo.
 *
 * Cada item vira um PAR (pedido de compra + venda) amarrado pelo mesmo grupo.
 * Isso é de propósito: os itens podem chegar em datas diferentes, e o "Chegou"
 * precisa poder receber um sem mexer no outro.
 */

export interface ItemEncomenda {
  /** Chave estável da linha na tela — não vai para o banco. */
  id: string
  produto: string
  produtoId: number | null
  capacidade: string
  cor: string
  valor: string
  /** Variantes do modelo escolhido, carregadas do cadastro. */
  coresDisp: string[]
  armazDisp: string[]
}

export const itemVazio = (): ItemEncomenda => ({
  id: `i${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  produto: '', produtoId: null, capacidade: '', cor: '', valor: '',
  coresDisp: [], armazDisp: [],
})

/** Itens que valem uma venda: têm produto e preço. */
export const itensValidos = (itens: ItemEncomenda[]) =>
  itens.filter((i) => i.produto.trim() && (Number(i.valor) || 0) > 0)

/** "iPhone 17 Pro Max 256GB Laranja" — o que descreve a linha. */
export function descreverItem(i: ItemEncomenda): string {
  const especif = [i.capacidade, i.cor].filter(Boolean).join(' ')
  return `${i.produto.trim()}${especif ? ` ${especif}` : ''}`
}

export function EncomendaItens({ itens, onChange }: {
  itens: ItemEncomenda[]
  onChange: Dispatch<SetStateAction<ItemEncomenda[]>>
}) {
  const supabase = createClient()
  const [buscando, setBuscando] = useState<string | null>(null)

  /**
   * Toda escrita parte do item ATUAL, nunca da lista congelada no render.
   *
   * Não é preciosismo: escolher um produto grava duas vezes, uma antes e outra
   * depois do await que busca as variantes. Com a lista do closure, a segunda
   * escrita reconstruía tudo a partir do estado velho e apagava o produto que a
   * primeira tinha acabado de gravar — o campo voltava para o texto digitado e a
   * sugestão reabria. Foi o bug de 18/09/2026: "digitei 17 pro, ele localiza
   * iPhone 17 Pro, mas ao clicar não puxa".
   */
  const mexer = (
    id: string,
    patch: Partial<ItemEncomenda> | ((x: ItemEncomenda) => Partial<ItemEncomenda>),
  ) =>
    onChange((xs) =>
      xs.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)))

  async function escolherProduto(id: string, p: { id: number; nome: string; preco: number | null }) {
    mexer(id, (x) => ({
      produto: p.nome, produtoId: p.id, cor: '', capacidade: '',
      // O preço do cadastro entra só se o vendedor ainda não digitou um: o que
      // ele combinou com o cliente vale mais que a tabela.
      valor: !x.valor && p.preco ? String(p.preco) : x.valor,
    }))
    setBuscando(id)
    const { data } = await supabase.from('produtos').select('cores, armazenamentos').eq('id', p.id).maybeSingle()
    setBuscando(null)
    // As variantes só entram se a linha ainda for deste produto: entre o clique e
    // a resposta o vendedor pode ter trocado de modelo ou limpado o campo.
    mexer(id, (x) => (x.produtoId === p.id
      ? { coresDisp: data?.cores ?? [], armazDisp: data?.armazenamentos ?? [] }
      : {}))
  }

  const total = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0)

  return (
    <div className="space-y-2.5">
      {itens.map((item, n) => (
        <div key={item.id} className="rounded-control border border-line-soft bg-bg p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-[0.05em] text-ink-3">
              ITEM {n + 1}
            </span>
            {itens.length > 1 && (
              <button type="button" aria-label={`Remover item ${n + 1}`}
                onClick={() => onChange((xs) => xs.filter((x) => x.id !== item.id))}
                className="grid h-7 w-7 place-items-center rounded-control text-ink-3 transition-colors hover:text-bad">
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            )}
          </div>

          <ProdutoAutocomplete
            label="Produto"
            value={item.produto}
            onChange={(v) => mexer(item.id, {
              produto: v, produtoId: null, coresDisp: [], armazDisp: [], cor: '', capacidade: '',
            })}
            onSelect={(p) => escolherProduto(item.id, p)}
          />

          {(item.coresDisp.length > 0 || item.armazDisp.length > 0) && (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {item.armazDisp.length > 0 && (
                <Select label="Capacidade" value={item.capacidade}
                  onChange={(e) => mexer(item.id, { capacidade: e.target.value })}>
                  <option value="">Selecionar…</option>
                  {item.armazDisp.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              )}
              {item.coresDisp.length > 0 && (
                <Select label="Cor" value={item.cor}
                  onChange={(e) => mexer(item.id, { cor: e.target.value })}>
                  <option value="">Selecionar…</option>
                  {item.coresDisp.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
            </div>
          )}

          <div className="mt-2.5">
            <Input label="Preço deste item (R$)" type="number" value={item.valor}
              onChange={(e) => mexer(item.id, { valor: e.target.value })} placeholder="0,00"
              hint={buscando === item.id ? 'carregando variantes…' : undefined} />
          </div>
        </div>
      ))}

      <button type="button"
        onClick={() => onChange((xs) => [...xs, itemVazio()])}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80">
        <Plus size={13} strokeWidth={2} /> Outro produto
      </button>

      {/* O total é a SOMA dos itens, não um campo digitado: com vários produtos,
          digitar o total à mão seria convidar a divergência que ninguém acha. */}
      {itens.length > 1 && total > 0 && (
        <div className="flex items-baseline justify-between border-t border-line-soft pt-2">
          <span className="text-[12px] text-ink-2">{itensValidos(itens).length} itens</span>
          <span className="num text-[14px] font-bold text-ink">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  )
}
