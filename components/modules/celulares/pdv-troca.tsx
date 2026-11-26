'use client'

import { useMemo, useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { notify } from '@/components/ui'
import { referenciaDaTroca, avaliarTroca, type PrecoRef, type AvaliacaoTroca } from '@/lib/troca-referencia'

/**
 * APARELHO NA TROCA, NO PDV — a parte do módulo Celulares dentro do caixa.
 *
 * O PDV do core não sabe o que é aparelho: ele recebe daqui o estado da troca
 * (`useTrocaPdv`), o bloco da tela (`TrocaPdv`) e os textos (`TEXTOS_TROCA_PDV`).
 * Sem o módulo ligado, nada disto aparece e a troca não existe.
 */

const fmt = (v: number) => formatCurrency(v)

/**
 * Aparelho entregue na troca. `valor` fica string porque vem de <input>.
 *
 * `cotacaoId`/`cotacaoNumero` aparecem quando a linha foi preenchida por CÓDIGO
 * — o número que a cotação de Upgrade/Downgrade gerou. Guardar o id é o que
 * permite marcar a cotação como usada no fechamento e impedir que o mesmo
 * abatimento entre em duas vendas.
 */
export interface TrocaItem {
  aparelho: string
  imei: string
  valor: string
  codigo?: string
  cotacaoId?: number | null
  cotacaoNumero?: number | null
  /** A cotação já tinha sido consumida em outra venda. Só avisa; não bloqueia. */
  cotacaoJaUsada?: boolean
}

export const trocaVazia = (): TrocaItem => ({ aparelho: '', imei: '', valor: '' })

/**
 * O estado da troca no caixa.
 *
 * É lista porque o cliente com frequência entrega mais de um aparelho na mesma
 * compra — cada um vira uma unidade própria no estoque, com seu IMEI e seu valor,
 * e a soma abate do total. `ligado` falso = módulo desligado: nenhuma troca vale.
 */
export function useTrocaPdv({ ligado, tabelaPrecos, tolerancia }: { ligado: boolean; tabelaPrecos: PrecoRef[]; tolerancia: number }) {
  const [trocaAtiva, setTrocaAtiva] = useState(false)
  const [trocas, setTrocas] = useState<TrocaItem[]>([trocaVazia()])
  /** Índice da linha cujo código está sendo buscado — para o "buscando…". */
  const [buscandoCodigo, setBuscandoCodigo] = useState<number | null>(null)

  /**
   * O CÓDIGO DA COTAÇÃO preenche a linha da troca.
   *
   * Pedido do dono: "quando for realizar a venda do aparelho digitar o codigo e
   * ja vir o valor de abatimento". O ganho não é digitar menos — é o valor do
   * usado chegar EXATAMENTE como foi cotado. Redigitado com o cliente na frente,
   * ele muda; e muda sempre para cima.
   *
   * A cotação já usada não bloqueia: existe caso legítimo (venda cancelada e
   * refeita). Ela avisa, e quem decide é o vendedor — mas o aviso é vermelho,
   * porque abater duas vezes é dinheiro saindo duas vezes.
   */
  async function aplicarCodigoTroca(i: number, codigo: string) {
    const limpo = codigo.replace(/\D/g, '')
    if (!limpo) return
    setBuscandoCodigo(i)
    const r = await fetch(`/api/troca/cotacoes/buscar?numero=${limpo}`)
    setBuscandoCodigo(null)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Código não encontrado', j.error); return }

    setTrocas((ts) => ts.map((x, k) => (k === i ? {
      ...x,
      aparelho: j.aparelho,
      imei: j.imei || x.imei,
      valor: String(j.valor),
      codigo: String(j.numero),
      cotacaoId: j.id,
      cotacaoNumero: j.numero,
      cotacaoJaUsada: !!j.ja_usada,
    } : x)))

    if (j.ja_usada) {
      notify.warn(`Cotação #${j.numero} JÁ FOI USADA`, 'Confira antes de fechar — o abatimento pode sair em dobro.')
    } else {
      notify.ok(`Cotação #${j.numero}`, `${j.aparelho} · ${fmt(j.valor)}`)
    }
  }

  const ativa = ligado && trocaAtiva
  /** Trocas realmente preenchidas (valor > 0), com o valor já numérico. */
  const trocasValidas = ativa
    ? trocas
        .map((t) => ({ ...t, num: parseFloat(String(t.valor).replace(',', '.')) || 0 }))
        .filter((t) => t.num > 0)
    : []
  const trocaNum = trocasValidas.reduce((s, t) => s + t.num, 0)

  /**
   * Cada troca comparada com o preço de referência do modelo. A loja pagar MAIS
   * do que o aparelho vale é o risco que some: abate do que o cliente paga, a
   * venda continua com preço cheio, e o prejuízo só aparece na revenda.
   */
  const avaliacoesTroca = useMemo(
    () => trocas.map((t) => {
      const num = parseFloat(String(t.valor).replace(',', '.')) || 0
      const ref = referenciaDaTroca(t.aparelho, tabelaPrecos)
      return { aparelho: t.aparelho, referencia: ref, avaliacao: avaliarTroca(num, ref, tolerancia) }
    }),
    [trocas, tabelaPrecos, tolerancia],
  )
  /** Trocas que passaram da tolerância — exigem aceite antes de fechar. */
  const trocasAcima = ativa
    ? avaliacoesTroca.filter((a): a is typeof a & { avaliacao: AvaliacaoTroca } => !!a.avaliacao?.exigeAceite)
    : []

  function limpar() { setTrocaAtiva(false); setTrocas([trocaVazia()]) }

  return {
    trocaAtiva, setTrocaAtiva, trocas, setTrocas, buscandoCodigo, aplicarCodigoTroca,
    trocasValidas, trocaNum, avaliacoesTroca, trocasAcima, limpar,
  }
}

export type TrocaPdv = ReturnType<typeof useTrocaPdv>
type TrocaValida = TrocaPdv['trocasValidas'][number]
type TrocaAcima = TrocaPdv['trocasAcima'][number]

/** Os textos da troca que o PDV escreve na venda, no estoque e na tela. */
export const TEXTOS_TROCA_PDV = {
  /** Aviso quando a unidade da troca não foi criada (a venda segue; a entrada é feita no Estoque). */
  naoEntrouTitulo: 'Aparelho da troca não entrou no estoque',
  naoEntrouTexto: (t: TrocaValida, erro: string): string => `${t.aparelho.trim() || 'Aparelho'}: dê entrada em Estoque. ${erro}`,
  /** Anotação na observação da venda: "Troca: iPhone 12 (R$ 1.200,00)." */
  notaVenda: (validas: TrocaValida[]): string => (validas.length
    ? ` Troca: ${validas.map((t) => `${t.aparelho.trim() || 'aparelho'} (${fmt(t.num)})`).join(', ')}.`
    : ''),
  /** Observação da unidade que entra no estoque pela troca. */
  observacaoUnidade: (t: TrocaValida, clienteNome: string | null): string =>
    `${t.aparelho.trim() || 'Aparelho recebido em troca'} — entrada por troca no PDV${clienteNome ? ` (cliente ${clienteNome})` : ''}.`,
  cotacaoUsadaTitulo: 'Esta cotação de troca já tinha sido usada',
  cotacaoUsadaTexto: (cotacaoId: number): string =>
    `Cotação #${cotacaoId}: confira o abatimento desta venda antes de entregar o aparelho.`,
  acimaTitulo: (n: number): string => (n === 1 ? 'Troca acima do preço de referência' : 'Trocas acima do preço de referência'),
  acimaDescricao: (acima: TrocaAcima[]): string =>
    acima.map((t) =>
      `"${t.aparelho.trim() || 'Aparelho'}": avaliado em ${fmt(t.avaliacao.valor)}, referência ${fmt(t.avaliacao.referencia)}`
      + ` — ${fmt(t.avaliacao.excedente)} a mais (${t.avaliacao.percentual.toFixed(0)}%).`,
    ).join(' ')
    + ' A loja está pagando mais do que o aparelho vale, e isso só aparece no resultado quando ele for revendido.'
    + ' Ao confirmar, fica registrado na venda que você aceitou, com seu nome e a hora.',
  resumoPagoEm: 'Pago em aparelho (troca)',
  resumoQtd: (n: number): string => ` · ${n} aparelhos`,
  sucessoDiferenca: ' — a diferença entrou em aparelho.',
}

/**
 * O bloco "Aparelho(s) na troca" do carrinho.
 *
 * `verCusto` (`estoque.ver_custo`, etapa 1.1e): o "abaixo da referência — margem para a loja" é leitura de margem, e
 * margem é só de quem vê custo. Sem a permissão o vendedor segue vendo a referência e o aviso de quando passa dela.
 */
export function TrocaPdvBloco({ troca, verCusto = false }: { troca: TrocaPdv; verCusto?: boolean }) {
  const { trocaAtiva, setTrocaAtiva, trocas, setTrocas, buscandoCodigo, aplicarCodigoTroca, avaliacoesTroca } = troca
  return (
    <div className="mb-4 rounded-card border border-line p-3">
      <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
        <input type="checkbox" checked={trocaAtiva} onChange={(e) => setTrocaAtiva(e.target.checked)} className="size-4 accent-accent" /> Aparelho(s) na troca (abatem no total)
      </label>
      {trocaAtiva && (
        <div className="mt-2.5 space-y-2.5">
          {trocas.map((t, i) => (
            <div key={i} className="space-y-2 rounded-control border border-line-soft bg-raised p-2">
              {/* CÓDIGO DA COTAÇÃO — o caminho curto. Preenche aparelho,
                  IMEI e valor com o que foi cotado no atendimento, em vez
                  de o vendedor redigitar o valor do usado na frente do
                  cliente. Os campos abaixo seguem editáveis: cotação é
                  ponto de partida, não camisa de força. */}
              <div className="flex items-center gap-2">
                <input
                  value={t.codigo ?? ''}
                  inputMode="numeric"
                  onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void aplicarCodigoTroca(i, e.currentTarget.value) } }}
                  onBlur={(e) => { if (e.target.value && t.cotacaoNumero == null) void aplicarCodigoTroca(i, e.target.value) }}
                  placeholder="Código da cotação"
                  aria-label={`Código da cotação do aparelho ${i + 1}`}
                  className="num h-9 w-[150px] flex-none rounded-control border border-dashed border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-solid focus:border-accent" />
                {buscandoCodigo === i
                  ? <span className="text-[11.5px] text-ink-3">buscando…</span>
                  : t.cotacaoNumero != null && (
                    <span className={cn('text-[11.5px] font-medium', t.cotacaoJaUsada ? 'text-bad' : 'text-ok')}>
                      {t.cotacaoJaUsada ? `#${t.cotacaoNumero} já usada` : `#${t.cotacaoNumero} aplicada`}
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-2">
                <input value={t.aparelho}
                  onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, aparelho: e.target.value } : x)))}
                  placeholder={`Aparelho ${i + 1} (ex.: iPhone 12 64GB Preto)`}
                  className="h-9 min-w-0 flex-1 rounded-control border border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-accent" />
                {trocas.length > 1 && (
                  <button type="button" aria-label={`Remover aparelho ${i + 1}`}
                    onClick={() => setTrocas((ts) => ts.filter((_, j) => j !== i))}
                    className="grid h-9 w-9 flex-none place-items-center rounded-control text-ink-3 hover:bg-bad/10 hover:text-bad">
                    <Minus size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={t.imei}
                  onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, imei: e.target.value } : x)))}
                  placeholder="IMEI (opcional)"
                  className="num h-9 w-full rounded-control border border-line bg-card px-2.5 text-[12.5px] text-ink outline-none focus:border-accent" />
                <input type="number" value={t.valor}
                  onChange={(e) => setTrocas((ts) => ts.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  placeholder="Valor R$"
                  className="num h-9 w-full rounded-control border border-line bg-card px-2.5 text-right text-[12.5px] text-ink outline-none focus:border-accent" />
              </div>

              {/* Referência do modelo e o quanto o valor passou dela. O
                  vendedor vê ANTES de fechar, não depois. */}
              {(() => {
                const a = avaliacoesTroca[i]
                if (!a?.referencia) {
                  return t.aparelho.trim() ? (
                    <p className="mt-1.5 text-[11px] text-ink-3">Sem preço de referência para este modelo na tabela.</p>
                  ) : null
                }
                const av = a.avaliacao
                return (
                  <p className={cn('mt-1.5 text-[11px]', av?.exigeAceite ? 'font-medium text-bad' : 'text-ink-3')}>
                    Referência {fmt(a.referencia)}
                    {av && av.excedente > 0 && (
                      <> · {fmt(av.excedente)} acima ({av.percentual.toFixed(0)}%)
                        {av.exigeAceite ? ' — vai pedir confirmação' : ''}</>
                    )}
                    {verCusto && av && av.excedente < 0 && <> · {fmt(-av.excedente)} abaixo — margem para a loja</>}
                  </p>
                )
              })()}
            </div>
          ))}

          <button type="button"
            onClick={() => setTrocas((ts) => [...ts, trocaVazia()])}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line text-[12.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent">
            <Plus size={14} strokeWidth={1.9} /> Outro aparelho na troca
          </button>

          {/* O vendedor precisa saber, ANTES de fechar, que a comissão
              depende dele trazer o aparelho — senão descobre depois, no
              ranking, sem entender por quê. */}
          <p className="text-[11px] text-ink-3">
            Cada aparelho entra no estoque como uma unidade <strong className="font-semibold text-warn">pendente</strong>, no seu nome,
            com o IMEI e o custo dele. A soma abate no total.
            Comissão e ranking só contam esta venda quando alguém confirmar a chegada no Estoque.
          </p>
        </div>
      )}
    </div>
  )
}
