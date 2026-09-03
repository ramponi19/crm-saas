'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react'
import { Input, notify } from '@/components/ui'
import { AVARIAS } from '@/lib/troca-avarias'
import { familiasDeTroca, chaveLinha } from '@/lib/troca-modelos'

export interface PrecoLinha {
  modelo: string
  armazenamento: string
  na_troca: number | null
  descontos: Record<string, number>
}

/** A base é a primeira coluna e não é uma avaria — daí a chave própria. */
const BASE = '__na_troca'

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })

export function MatrizPrecosView({
  linhas, bonusSeminovo, corteBateria,
}: {
  linhas: PrecoLinha[]
  bonusSeminovo: number
  corteBateria: number
}) {
  const familias = useMemo(() => familiasDeTroca(), [])

  /**
   * Os valores por chave `modelo|armazenamento`, no estado.
   *
   * A tela é otimista: o campo mostra o que foi digitado imediatamente e a
   * gravação acontece depois, no blur. Esperar a resposta do servidor para
   * pintar o número faria cada célula piscar — e são 1.680 delas.
   */
  const [valores, setValores] = useState<Record<string, PrecoLinha>>(() =>
    Object.fromEntries(linhas.map((l) => [chaveLinha(l.modelo, l.armazenamento), l])),
  )

  /**
   * Só a primeira família nasce aberta.
   *
   * Aberto tudo são 140 linhas de campo vazio de uma vez — a tela que o dono
   * escolheu ("sem sugestão, tudo em branco") só funciona se ela não intimidar
   * na abertura. A família mais nova é a que a loja mais avalia.
   */
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set([familias[0]?.label]))
  const [busca, setBusca] = useState('')
  const [regras, setRegras] = useState({ bonus: String(bonusSeminovo), corte: String(corteBateria) })

  const termo = busca.trim().toLowerCase()

  /**
   * Buscar ABRE as famílias que têm resultado.
   *
   * Sem isso, digitar "13 pro" filtraria as linhas dentro de caixas fechadas e
   * a tela não mostraria nada — parecendo que o modelo não existe.
   */
  const visiveis = useMemo(() => {
    if (!termo) return familias.map((f) => ({ ...f, forcarAberta: false }))
    return familias
      .map((f) => ({
        ...f,
        linhas: f.linhas.filter((l) => `${l.modelo} ${l.armazenamento}`.toLowerCase().includes(termo)),
        forcarAberta: true,
      }))
      .filter((f) => f.linhas.length > 0)
  }, [familias, termo])

  const valorDe = (modelo: string, arm: string, coluna: string): string => {
    const l = valores[chaveLinha(modelo, arm)]
    if (!l) return ''
    const v = coluna === BASE ? l.na_troca : l.descontos[coluna]
    return v == null ? '' : String(v)
  }

  /** Quantos modelos da família já têm base — o que decide se aparecem na cotação. */
  const avaliadosNa = (label: string): number => {
    const f = familias.find((x) => x.label === label)
    if (!f) return 0
    return f.linhas.filter((l) => valores[chaveLinha(l.modelo, l.armazenamento)]?.na_troca != null).length
  }

  function mudarLocal(modelo: string, arm: string, coluna: string, texto: string) {
    const k = chaveLinha(modelo, arm)
    const num = texto.trim() === '' ? null : Math.max(0, Number(texto.replace(',', '.')) || 0)
    setValores((v) => {
      const atual = v[k] ?? { modelo, armazenamento: arm, na_troca: null, descontos: {} }
      if (coluna === BASE) return { ...v, [k]: { ...atual, na_troca: num } }
      const descontos = { ...atual.descontos }
      if (num == null) delete descontos[coluna]
      else descontos[coluna] = num
      return { ...v, [k]: { ...atual, descontos } }
    })
  }

  async function gravar(modelo: string, arm: string, coluna: string) {
    const corpo = coluna === BASE
      ? { modelo, armazenamento: arm, na_troca: valorDe(modelo, arm, BASE) || null }
      : { modelo, armazenamento: arm, descontos: { [coluna]: valorDe(modelo, arm, coluna) || null } }
    const r = await fetch('/api/troca/precos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      notify.bad('Não salvou', j.error)
    }
  }

  /** Aplica um desconto na família inteira. A base nunca — varia por tier. */
  async function aplicarNaFamilia(label: string, avaria: string, texto: string) {
    const valor = texto.trim() === '' ? null : Math.max(0, Number(texto.replace(',', '.')) || 0)
    const f = familias.find((x) => x.label === label)
    if (!f) return

    setValores((v) => {
      const novo = { ...v }
      for (const l of f.linhas) {
        const k = chaveLinha(l.modelo, l.armazenamento)
        const atual = novo[k] ?? { modelo: l.modelo, armazenamento: l.armazenamento, na_troca: null, descontos: {} }
        const descontos = { ...atual.descontos }
        if (valor == null) delete descontos[avaria]
        else descontos[avaria] = valor
        novo[k] = { ...atual, descontos }
      }
      return novo
    })

    const r = await fetch('/api/troca/precos/familia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familia: label, avaria, valor: texto.trim() === '' ? null : valor }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      notify.bad('Não salvou a família', j.error)
      return
    }
    notify.ok(`${label}: ${f.linhas.length} modelos atualizados`)
  }

  async function gravarRegras(patch: Record<string, string>) {
    const r = await fetch('/api/troca/regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (!r.ok) notify.bad('Não salvou a regra')
  }

  const colunas = [
    { chave: BASE, label: 'Na troca', ajuda: 'O que a loja paga por um aparelho SEM nenhuma avaria. Vazio = você não avalia este modelo, e ele não aparece no seletor da cotação.' },
    ...AVARIAS.map((a) => ({ chave: a.chave, label: a.label, ajuda: a.ajuda })),
  ]

  const celula = 'h-[30px] w-[92px] rounded-control border border-line-soft bg-raised px-2 text-center text-[12.5px] tabular-nums text-ink outline-none transition-colors placeholder:text-ink-3/60 focus:border-accent'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="mb-4">
          <h1 className="text-[18px] font-semibold text-ink">Preços de troca</h1>
          <p className="text-[13px] text-ink-3">
            Quanto a sua loja paga por aparelho usado, e quanto cada avaria desconta.
            Só a sua equipe vê esta tabela.
          </p>
        </div>

        {/* ── Regras e bônus ─────────────────────────────────────────────── */}
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-control border border-line-soft bg-raised p-3 sm:grid-cols-2">
          <div>
            <Input
              label="Bônus: cliente leva outro seminovo (R$)"
              type="number" value={regras.bonus}
              onChange={(e) => setRegras({ ...regras, bonus: e.target.value })}
              onBlur={() => gravarRegras({ bonus_seminovo: regras.bonus })}
            />
            <p className="mt-1 text-[11.5px] text-ink-3">Soma no valor quando o aparelho sai do estoque no mesmo atendimento.</p>
          </div>
          <div>
            <Input
              label="Corte de saúde da bateria (%)"
              type="number" value={regras.corte}
              onChange={(e) => setRegras({ ...regras, corte: e.target.value })}
              onBlur={() => gravarRegras({ corte_bateria: regras.corte })}
            />
            <p className="mt-1 text-[11.5px] text-ink-3">Abaixo disso, o checklist reprova a bateria e a avaria se aplica.</p>
          </div>
        </div>

        <div className="mb-3">
          <Input
            value={busca} onChange={(e) => setBusca(e.target.value)}
            icon={<Search size={15} strokeWidth={1.8} />}
            placeholder="Buscar aparelho (ex.: 13 pro)"
          />
        </div>

        {/* A tabela rola sozinha na horizontal: 12 colunas não cabem em tela de
            balcão, e deixar o CORPO da página rolar de lado quebra a sidebar. */}
        <div className="overflow-x-auto rounded-control border border-line-soft bg-raised scrollbar-thin">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="sticky left-0 z-20 min-w-[190px] bg-raised px-3 py-2.5 text-left font-semibold text-ink">
                  Modelo
                </th>
                {colunas.map((c) => (
                  <th key={c.chave} className="whitespace-nowrap px-2 py-2.5 text-center font-semibold text-ink-2">
                    {/* O `title` vai no SPAN, não no ícone: atributo `title` em
                        <svg> não abre tooltip — o SVG exige um elemento
                        <title> filho, e a dica sumia sem erro nenhum. */}
                    <span className="inline-flex cursor-help items-center gap-1" title={c.ajuda}>
                      {c.label}
                      <Info size={12} strokeWidth={1.8} className="text-ink-3" aria-hidden />
                      <span className="sr-only">{c.ajuda}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((f) => {
                const aberta = f.forcarAberta || abertas.has(f.label)
                const avaliados = avaliadosNa(f.label)
                const totalFamilia = familias.find((x) => x.label === f.label)?.linhas.length ?? 0
                return (
                  // Fragment NOMEADO: `<>` não aceita `key`, e sem chave no
                  // elemento externo do map o React reordena as três linhas de
                  // cada família entre si ao filtrar.
                  <Fragment key={f.label}>
                    <tr className="border-b border-line-soft bg-ink/[0.015]">
                      <th colSpan={colunas.length + 1} className="px-3 py-0 text-left">
                        <button
                          type="button"
                          onClick={() => setAbertas((s) => {
                            const n = new Set(s)
                            if (n.has(f.label)) n.delete(f.label); else n.add(f.label)
                            return n
                          })}
                          className="flex w-full items-center gap-2 py-2 text-left font-semibold text-ink"
                          aria-expanded={aberta}
                        >
                          {aberta
                            ? <ChevronDown size={14} strokeWidth={2} className="text-ink-3" />
                            : <ChevronRight size={14} strokeWidth={2} className="text-ink-3" />}
                          {f.label}
                          <span className="font-medium text-ink-3">
                            · {totalFamilia} modelos
                            {avaliados > 0 && <span className="text-ok"> · {avaliados} avaliados</span>}
                          </span>
                        </button>
                      </th>
                    </tr>

                    {/* ── Linha de preenchimento em bloco ───────────────────
                        A base fica de fora: ela varia por tier, e aplicá-la em
                        bloco daria uma matriz cheia e errada. */}
                    {aberta && (
                      <tr className="border-b border-dashed border-line-soft">
                        <td className="sticky left-0 z-10 bg-raised px-3 py-1.5 text-[11.5px] font-medium text-ink-3">
                          aplicar em todos ↓
                        </td>
                        <td className="px-2 py-1.5 text-center text-[11px] text-ink-3">—</td>
                        {AVARIAS.map((a) => (
                          <td key={a.chave} className="px-2 py-1.5 text-center">
                            <input
                              type="number" inputMode="numeric" placeholder="todos"
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return
                                const el = e.currentTarget
                                void aplicarNaFamilia(f.label, a.chave, el.value)
                                el.value = ''
                              }}
                              onBlur={(e) => {
                                if (!e.currentTarget.value) return
                                const el = e.currentTarget
                                void aplicarNaFamilia(f.label, a.chave, el.value)
                                el.value = ''
                              }}
                              title={`Aplicar este desconto de "${a.label}" a todos os ${totalFamilia} modelos de ${f.label}`}
                              className={`${celula} border-dashed bg-transparent italic`}
                            />
                          </td>
                        ))}
                      </tr>
                    )}

                    {aberta && f.linhas.map((l) => {
                      const temBase = valores[chaveLinha(l.modelo, l.armazenamento)]?.na_troca != null
                      return (
                        <tr key={chaveLinha(l.modelo, l.armazenamento)} className="border-b border-line-soft last:border-0">
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-raised px-3 py-1.5 font-medium text-ink">
                            {l.modelo.replace(/^iPhone /, '')} {l.armazenamento}
                            {/* Sem base, o modelo não entra na cotação. Dizer isso
                                na linha evita a pergunta "cadastrei e não aparece". */}
                            {!temBase && <span className="ml-2 text-[11px] font-normal text-ink-3">não avaliado</span>}
                          </td>
                          {colunas.map((c) => (
                            <td key={c.chave} className="px-2 py-1.5 text-center">
                              <input
                                type="number" inputMode="numeric"
                                value={valorDe(l.modelo, l.armazenamento, c.chave)}
                                onChange={(e) => mudarLocal(l.modelo, l.armazenamento, c.chave, e.target.value)}
                                onBlur={() => gravar(l.modelo, l.armazenamento, c.chave)}
                                placeholder="—"
                                className={c.chave === BASE ? `${celula} font-semibold` : celula}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[12px] text-ink-3">
          Total avaliado: <strong className="text-ink tabular-nums">
            {familias.reduce((s, f) => s + avaliadosNa(f.label), 0)}
          </strong> de {familias.reduce((s, f) => s + f.linhas.length, 0)} modelos.
          {bonusSeminovo > 0 && <> Bônus vigente: <strong className="text-ink">R$ {brl(bonusSeminovo)}</strong>.</>}
        </p>
      </div>
    </div>
  )
}
