'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Smartphone, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

/**
 * APARELHO COMO ENTRADA DA ENCOMENDA — a parte do módulo Celulares no formulário
 * de encomenda do PDV. Sem o módulo, a forma "Aparelho semi-novo" não é oferecida.
 *
 * O cliente entrega o usado e leva o novo encomendado — na conta do restante dá no
 * mesmo que ter pago em PIX. A diferença aparece no fechamento: cada aparelho vira
 * uma unidade no estoque, com o valor avaliado como custo, igual à troca do PDV.
 *
 * IMEI aqui não é burocracia: é o que liga o aparelho recebido ao cliente que
 * entregou, e sem ele a unidade entra anônima no estoque.
 */

/** Aparelho recebido como entrada. `valor` fica string porque vem de <input>. */
export interface AparelhoEntrada { aparelho: string; imei: string; valor: string }

export const aparelhoVazio = (): AparelhoEntrada => ({ aparelho: '', imei: '', valor: '' })

/** A chave da forma de entrada "aparelho" (vai para o pagamento como `troca`). */
export const FORMA_APARELHO = { key: 'aparelho', label: 'Aparelho semi-novo' }

/** Os textos que a encomenda grava e mostra sobre os aparelhos recebidos. */
export const TEXTOS_ENTRADA_APARELHO = {
  /** Anotação na observação da venda — o único lugar onde ficam escritos. */
  nota: (validos: AparelhoEntrada[]): string => (validos.length === 0 ? '' :
    ` Entrada em aparelho: ${validos.map((a) =>
      `${a.aparelho.trim() || 'aparelho'}${a.imei.trim() ? ` (IMEI ${a.imei.trim()})` : ''} — ${formatCurrency(Number(a.valor) || 0)}`,
    ).join('; ')}.`),
  observacaoUnidade: (a: AparelhoEntrada, cliNome: string | null): string =>
    `${a.aparelho.trim() || 'Aparelho recebido'} — entrada da encomenda${cliNome ? ` de ${cliNome}` : ''}.`,
  naoEntrou: (n: number): string => (n > 1 ? 'Aparelhos não entraram no estoque' : 'Aparelho não entrou no estoque'),
  /** Rótulo das entradas em aparelho na lista de encomendas abertas. */
  rotuloLista: 'Entrada em aparelho:',
}

export function EntradaAparelhos({ aparelhos, setAparelhos, total }: {
  aparelhos: AparelhoEntrada[]
  setAparelhos: Dispatch<SetStateAction<AparelhoEntrada[]>>
  total: number
}) {
  return (
    <div className="mt-2.5 space-y-2">
      {aparelhos.map((a, i) => (
        <div key={i} className="rounded-control border border-line-soft bg-bg p-2.5">
          <div className="flex items-center gap-2">
            <Smartphone size={14} strokeWidth={1.8} className="shrink-0 text-ink-3" />
            <Input wrapperClassName="flex-1" placeholder="Aparelho (ex.: iPhone 13 128GB Azul)"
              value={a.aparelho}
              onChange={(e) => setAparelhos((xs) => xs.map((x, j) => j === i ? { ...x, aparelho: e.target.value } : x))} />
            {aparelhos.length > 1 && (
              <button type="button" aria-label="Remover aparelho"
                onClick={() => setAparelhos((xs) => xs.filter((_, j) => j !== i))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:text-bad">
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input placeholder="IMEI" value={a.imei}
              onChange={(e) => setAparelhos((xs) => xs.map((x, j) => j === i ? { ...x, imei: e.target.value } : x))} />
            <Input type="number" placeholder="Valor avaliado (R$)" value={a.valor}
              onChange={(e) => setAparelhos((xs) => xs.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
          </div>
        </div>
      ))}
      <button type="button"
        onClick={() => setAparelhos((xs) => [...xs, aparelhoVazio()])}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80">
        <Plus size={13} strokeWidth={2} /> Outro aparelho
      </button>
      {total > 0 && (
        <p className="text-[12px] text-ink-2">
          Entrada em aparelho: <strong className="num text-ink">{formatCurrency(total)}</strong>
        </p>
      )}
    </div>
  )
}
