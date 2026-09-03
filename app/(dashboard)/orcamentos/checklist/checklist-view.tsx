'use client'

import Link from 'next/link'
import { ArrowRight, RotateCcw, ScanSearch, TriangleAlert } from 'lucide-react'
import { useLocalStorage } from '@/lib/navegador'
import { AVARIA_POR_CHAVE } from '@/lib/troca-avarias'
import { CHECKLIST, TOTAL_ITENS } from '@/lib/troca-checklist'

/**
 * O roteiro de teste, marcável.
 *
 * ══ POR QUE O PROGRESSO FICA NO NAVEGADOR ══════════════════════════════════
 *
 * É um rascunho de balcão: o vendedor abre, testa o aparelho com o cliente na
 * frente, marca o que passou, e o roteiro acaba quando o negócio fecha ou o
 * cliente vai embora. Gravar isso no banco criaria um registro por atendimento
 * sem dono e sem fim — e a pergunta "de quem é este checklist pela metade?" não
 * tem resposta boa.
 *
 * O que VALE fica na cotação: as avarias marcadas e o valor. É o que precisa
 * sobreviver e ser auditável.
 *
 * `useLocalStorage` em vez de `useState` + efeito: assim o marcado aparece no
 * primeiro render, sem o quadro piscado de "0 de 26" em toda abertura.
 */

const CHAVE_STORE = 'troca_checklist'

/** Referência FIXA: objeto novo a cada render faria o store achar que mudou. */
const VAZIO: Record<string, boolean> = {}

export function ChecklistView({ corteBateria }: { corteBateria: number }) {
  const [marcados, gravar] = useLocalStorage<Record<string, boolean>>(CHAVE_STORE, VAZIO)

  const feitos = CHECKLIST.reduce(
    (s, sec) => s + sec.itens.filter((i) => marcados[String(i.n)]).length, 0,
  )
  const pct = Math.round((feitos / TOTAL_ITENS) * 100)

  const alternar = (n: number) => {
    const k = String(n)
    const novo = { ...marcados }
    if (novo[k]) delete novo[k]
    else novo[k] = true
    gravar(novo)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">Checklist de avaliação</h1>
          <p className="text-[13px] text-ink-3">
            Roteiro do que testar no aparelho antes de fechar a cotação. Reprovou? Marque na
            {' '}<Link href="/orcamentos/cotacao" className="font-medium text-accent hover:underline">Nova cotação</Link>
            {' '}a avaria indicada no item.
          </p>
        </div>

        {/* ── Progresso ────────────────────────────────────────────────────── */}
        <div className="rounded-control border border-line-soft bg-raised p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink tabular-nums">
              {feitos} de {TOTAL_ITENS} verificados
            </span>
            <button
              type="button" onClick={() => gravar({})}
              disabled={feitos === 0}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={13} strokeWidth={1.8} /> Limpar e recomeçar
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Fica salvo neste navegador. Não é um registro do atendimento — o que vale é a cotação.
          </p>
        </div>

        {/* ── Seções ───────────────────────────────────────────────────────── */}
        {CHECKLIST.map((sec) => {
          const feitosSec = sec.itens.filter((i) => marcados[String(i.n)]).length
          return (
            <section key={sec.titulo} className="rounded-control border border-line-soft bg-raised p-4">
              <div className="mb-0.5 flex items-baseline justify-between gap-3">
                <h2 className="text-[14.5px] font-semibold text-ink">{sec.titulo}</h2>
                <span className="shrink-0 text-[12px] tabular-nums text-ink-3">
                  {feitosSec} de {sec.itens.length}
                </span>
              </div>
              <p className="mb-3 text-[12.5px] text-ink-3">{sec.intro}</p>

              <div className="divide-y divide-line-soft">
                {sec.itens.map((it) => {
                  const marcado = !!marcados[String(it.n)]
                  return (
                    <div key={it.n} className="flex gap-2.5 py-3 first:pt-0 last:pb-0">
                      <input
                        type="checkbox" checked={marcado} onChange={() => alternar(it.n)}
                        id={`item-${it.n}`}
                        className="mt-0.5 h-[15px] w-[15px] shrink-0 accent-[var(--accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`item-${it.n}`}
                          className={`block cursor-pointer text-[13.5px] font-semibold ${marcado ? 'text-ink-3 line-through' : 'text-ink'}`}>
                          {it.n}. {it.titulo}
                        </label>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                          {it.como}
                          {/* O corte é da LOJA: injetado no item 6, que sem ele
                              manda comparar com um número que ninguém sabe. */}
                          {it.avarias?.includes('bateria') && (
                            <strong className="text-ink"> Aqui, abaixo de {corteBateria}%.</strong>
                          )}
                        </p>

                        {it.avarias && it.avarias.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11.5px] text-ink-3">reprovou? marque</span>
                            {it.avarias.map((chave, i) => {
                              const a = AVARIA_POR_CHAVE[chave]
                              if (!a) return null
                              return (
                                <span key={chave} className="flex items-center gap-1.5">
                                  {i > 0 && <span className="text-[11.5px] text-ink-3">ou</span>}
                                  {/**
                                    * O chip leva a avaria para a cotação pela URL.
                                    * Lá ela é aplicada quando o aparelho estiver
                                    * escolhido — não antes, porque escolher o
                                    * aparelho limpa as marcações de propósito.
                                    */}
                                  <Link
                                    href={`/orcamentos/cotacao?avaria=${chave}`}
                                    className="rounded-full border border-bad/25 bg-bad-soft px-2 py-[3px] text-[11.5px] font-medium text-bad transition-colors hover:border-bad"
                                  >
                                    {a.label} →
                                  </Link>
                                </span>
                              )
                            })}
                          </div>
                        )}

                        {it.recusar && (
                          <p className="mt-2 flex items-start gap-1.5 rounded-control border border-warn/25 bg-warn-soft px-2.5 py-1.5 text-[12px] font-medium text-warn">
                            <TriangleAlert size={13} strokeWidth={1.9} className="mt-[1px] shrink-0" />
                            {it.recusar}
                          </p>
                        )}

                        {/* O item 24 pede consulta de restrição/roubo — e o CRM
                            já tem a tela que faz isso. Mandar o vendedor
                            procurar no menu é perder o momento. */}
                        {it.n === 24 && (
                          <Link href="/check-imei"
                            className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline">
                            <ScanSearch size={13} strokeWidth={1.8} /> Consultar IMEI aqui <ArrowRight size={12} strokeWidth={2} />
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
