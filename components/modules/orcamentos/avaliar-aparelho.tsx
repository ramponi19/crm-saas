'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Search, Smartphone } from 'lucide-react'
import { Badge, Input, Modal, notify } from '@/components/ui'
import { AVARIAS, AVARIA_POR_CHAVE, BONUS_LEVA_SEMINOVO, calcularTroca, descontoDe, type ContaTroca } from '@/lib/troca-avarias'
import { familiasDeTroca, chaveLinha, nomeCompleto } from '@/lib/troca-modelos'

/**
 * A AVALIAÇÃO DO APARELHO QUE ENTRA — escolher o modelo, marcar as avarias, ver
 * o valor. Um componente só, usado em dois lugares.
 *
 * O nome NÃO é `AvaliacaoTroca`: esse já é um tipo de `lib/troca-referencia`,
 * que responde outra pergunta ("a loja está pagando caro demais por este
 * usado?") e é importado pelo PDV. Dois conceitos com o mesmo nome é o tipo de
 * colisão que faz o import errado compilar sem ninguém notar.
 *
 * ══ POR QUE EXTRAÍDO ═══════════════════════════════════════════════════════
 *
 * Isto vive na aba "Nova cotação" (/orcamentos/cotacao) e dentro do modal de
 * Upgrade/Downgrade, que abre por cima da conversa do lead. Duas cópias
 * divergiriam na primeira regra nova — e a divergência aqui não é cosmética: é
 * o preço que a loja paga pelo aparelho. Uma tela descontando diferente da
 * outra é dinheiro saindo errado, sem erro na tela.
 *
 * O componente NÃO grava cotação. Ele calcula e informa; quem salva é a tela
 * que o usa, porque cada uma salva uma coisa diferente (a aba salva a cotação;
 * o modal salva cotação + orçamento + reserva).
 *
 * O que ele grava por conta própria é a MATRIZ (`troca_precos`), quando alguém
 * digita um valor em branco — e por isso ambas as telas alimentam a mesma
 * tabela sem duplicar a rota.
 */

/** O que a loja já preencheu para um par modelo+armazenamento. */
export interface ValoresDoModelo {
  na_troca: number | null
  descontos: Record<string, number>
}

export interface AparelhoEscolhido { modelo: string; armazenamento: string }

export interface EstadoAvaliacao {
  escolhido: AparelhoEscolhido | null
  marcadas: string[]
  /** `null` enquanto não há aparelho escolhido. */
  conta: ContaTroca | null
  /** Base do modelo escolhido; `null` = ainda não definida. */
  base: number | null
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const VAZIO: ValoresDoModelo = { na_troca: null, descontos: {} }

export function AvaliarAparelho({
  valoresIniciais, bonusSeminovo, corteBateria, avariaPendente = null,
  escolhidoInicial = null, compacto = false, onMudar,
}: {
  valoresIniciais: Record<string, ValoresDoModelo>
  bonusSeminovo: number
  corteBateria: number
  /** Avaria que veio de um chip do checklist, pela URL. */
  avariaPendente?: string | null
  /** Aparelho já escolhido (reabrir uma cotação, ou vir de um chip). */
  escolhidoInicial?: AparelhoEscolhido | null
  /** Dentro de modal: some o cabeçalho e aperta o espaçamento. */
  compacto?: boolean
  onMudar: (e: EstadoAvaliacao) => void
}) {
  const familias = useMemo(() => familiasDeTroca(), [])

  /**
   * A matriz no estado, para a tela poder ESCREVER nela sem sair do fluxo.
   *
   * É o que substitui os "valores sugeridos" do site de referência: aqui não se
   * inventa preço de mercado (decisão do dono). O campo em branco é editável no
   * lugar, e o que o vendedor digitar durante o atendimento fica salvo na
   * tabela — a matriz se preenche pelo uso.
   */
  const [valores, setValores] = useState<Record<string, ValoresDoModelo>>(valoresIniciais)
  const [escolhido, setEscolhido] = useState<AparelhoEscolhido | null>(escolhidoInicial)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set([familias[0]?.label]))

  const doModelo = (a: AparelhoEscolhido | null): ValoresDoModelo =>
    (a && valores[chaveLinha(a.modelo, a.armazenamento)]) || VAZIO

  const atual = doModelo(escolhido)
  const pendente = avariaPendente && AVARIA_POR_CHAVE[avariaPendente] ? avariaPendente : null

  /**
   * Avisa quem usa, a cada render.
   *
   * Sem efeito de propósito: chamar o callback no corpo faria `setState` do pai
   * durante a renderização do filho (o que a regra `set-state-in-render` acusa,
   * e com razão). Em vez disso, cada mudança de estado avisa na hora, dentro do
   * próprio manipulador — que é onde a informação nasce.
   */
  function avisar(
    novoEscolhido: AparelhoEscolhido | null,
    novasMarcadas: Set<string>,
    novosValores: Record<string, ValoresDoModelo>,
  ) {
    const linha = (novoEscolhido && novosValores[chaveLinha(novoEscolhido.modelo, novoEscolhido.armazenamento)]) || VAZIO
    onMudar({
      escolhido: novoEscolhido,
      marcadas: [...novasMarcadas],
      base: linha.na_troca,
      conta: novoEscolhido
        ? calcularTroca(linha.na_troca ?? 0, linha.descontos, [...novasMarcadas], bonusSeminovo)
        : null,
    })
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(() => {
    if (!termo) return familias.map((f) => ({ ...f, forcarAberta: false }))
    return familias
      .map((f) => ({
        ...f,
        linhas: f.linhas.filter((l) => nomeCompleto(l.modelo, l.armazenamento).toLowerCase().includes(termo)),
        forcarAberta: true,
      }))
      .filter((f) => f.linhas.length > 0)
  }, [familias, termo])

  function escolher(a: AparelhoEscolhido) {
    /**
     * Trocar de aparelho LIMPA as avarias.
     *
     * Manter as marcações do aparelho anterior é a forma mais fácil de emitir
     * cotação errada: o vendedor troca o modelo, o valor recalcula com os
     * defeitos do aparelho que já foi embora, e nada na tela avisa.
     *
     * A avaria vinda do checklist é a exceção — e entra AQUI, não na abertura,
     * justamente por causa da regra acima.
     */
    const novas = pendente ? new Set([pendente]) : new Set<string>()
    setEscolhido(a)
    setMarcadas(novas)
    setSeletorAberto(false)
    setBusca('')
    avisar(a, novas, valores)
  }

  function alternar(c: string) {
    const novas = new Set(marcadas)
    if (novas.has(c)) novas.delete(c); else novas.add(c)
    setMarcadas(novas)
    avisar(escolhido, novas, valores)
  }

  /**
   * Grava um valor da matriz daqui, e guarda no estado.
   *
   * `coluna === null` é a base (`na_troca`); qualquer outra string é chave de
   * avaria. A rota é a MESMA que a tela de Preços usa — duas validações
   * divergiriam na primeira regra nova.
   */
  async function gravarValor(alvo: AparelhoEscolhido, coluna: string | null, texto: string) {
    const num = texto.trim() === '' ? null : Math.max(0, Number(texto.replace(',', '.')) || 0)
    const k = chaveLinha(alvo.modelo, alvo.armazenamento)

    const linha = valores[k] ?? { na_troca: null, descontos: {} }
    let nova: ValoresDoModelo
    if (coluna === null) nova = { ...linha, na_troca: num }
    else {
      const descontos = { ...linha.descontos }
      if (num == null) delete descontos[coluna]
      else descontos[coluna] = num
      nova = { ...linha, descontos }
    }
    const novosValores = { ...valores, [k]: nova }
    setValores(novosValores)
    avisar(escolhido, marcadas, novosValores)

    const corpo = coluna === null
      ? { modelo: alvo.modelo, armazenamento: alvo.armazenamento, na_troca: num }
      : { modelo: alvo.modelo, armazenamento: alvo.armazenamento, descontos: { [coluna]: num } }

    const r = await fetch('/api/troca/precos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      notify.bad('Não salvei na tabela', j.error)
    }
  }

  const campo = 'h-[28px] w-[104px] rounded-control border border-dashed border-line bg-bg px-2 text-right text-[12.5px] tabular-nums text-ink outline-none transition-colors placeholder:text-ink-3/60 focus:border-accent focus:border-solid'

  /** Quantos modelos da família já têm base — pista de progresso no seletor. */
  const comBase = (label: string) => {
    const f = familias.find((x) => x.label === label)
    if (!f) return 0
    return f.linhas.filter((l) => valores[chaveLinha(l.modelo, l.armazenamento)]?.na_troca != null).length
  }

  return (
    <div className={compacto ? 'space-y-2.5' : 'space-y-4'}>
      {/* ── Aparelho ─────────────────────────────────────────────────────── */}
      <button
        type="button" onClick={() => setSeletorAberto(true)}
        className="flex w-full items-center justify-between gap-3 rounded-control border border-line bg-bg px-3.5 py-3 text-left transition-colors hover:border-accent"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Smartphone size={17} strokeWidth={1.7} className="shrink-0 text-ink-3" />
          {escolhido ? (
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-ink">
                {nomeCompleto(escolhido.modelo, escolhido.armazenamento)}
              </span>
              <span className="text-[12px] text-ink-3">
                {atual.na_troca != null ? `Na troca ${brl(atual.na_troca)}` : 'Sem valor na troca — defina abaixo'}
              </span>
            </span>
          ) : (
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink">Toque para escolher</span>
              <span className="text-[12px] text-ink-3">Role a lista ou busque pelo nome</span>
            </span>
          )}
        </span>
        <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-ink-3" />
      </button>

      {pendente && !escolhido && (
        <p className="rounded-control border border-accent/25 bg-accent-soft px-2.5 py-1.5 text-[12px] text-ink-2">
          Do checklist: <strong className="text-ink">{AVARIA_POR_CHAVE[pendente].label}</strong> será
          marcada assim que você escolher o aparelho.
        </p>
      )}

      {/* ── Avarias ──────────────────────────────────────────────────────── */}
      {escolhido && (
        <div className="space-y-0.5">
          {AVARIAS.map((a) => {
            const valor = descontoDe(atual.descontos, a.chave)
            const definido = atual.descontos[a.chave] != null
            const marcado = marcadas.has(a.chave)
            return (
              <div key={a.chave}
                className="flex items-center gap-2.5 rounded-control px-1.5 py-2 transition-colors hover:bg-ink/[0.02]">
                <input
                  type="checkbox" checked={marcado} onChange={() => alternar(a.chave)}
                  id={`av-${a.chave}`}
                  className="h-[15px] w-[15px] shrink-0 accent-[var(--accent)]"
                />
                <label htmlFor={`av-${a.chave}`} title={a.ajuda}
                  className={`min-w-0 flex-1 cursor-pointer truncate text-[13px] ${marcado ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                  {a.label}
                  {a.chave === 'bateria' && (
                    <span className="ml-1.5 text-[11.5px] font-normal text-ink-3">abaixo de {corteBateria}%</span>
                  )}
                </label>
                {definido ? (
                  <input
                    type="number" inputMode="numeric" defaultValue={String(valor)}
                    onBlur={(e) => { if (e.target.value !== String(valor)) void gravarValor(escolhido, a.chave, e.target.value) }}
                    aria-label={`Desconto de ${a.label}`}
                    className={`${campo} border-solid border-transparent bg-transparent font-semibold text-bad hover:border-line`}
                  />
                ) : (
                  <input
                    type="number" inputMode="numeric" placeholder="definir"
                    onBlur={(e) => { if (e.target.value) void gravarValor(escolhido, a.chave, e.target.value) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    aria-label={`Definir desconto de ${a.label}`}
                    className={campo}
                  />
                )}
              </div>
            )
          })}

          <label className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-control border border-ok/25 bg-ok-soft px-2.5 py-2.5"
            title={BONUS_LEVA_SEMINOVO.ajuda}>
            <input
              type="checkbox" checked={marcadas.has(BONUS_LEVA_SEMINOVO.chave)}
              onChange={() => alternar(BONUS_LEVA_SEMINOVO.chave)}
              disabled={bonusSeminovo <= 0}
              className="h-[15px] w-[15px] shrink-0 accent-[var(--ok)] disabled:opacity-40"
            />
            <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{BONUS_LEVA_SEMINOVO.label}</span>
            {bonusSeminovo > 0 ? (
              <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ok">+ {brl(bonusSeminovo)}</span>
            ) : (
              <Link href="/orcamentos/precos" className="shrink-0 text-[11.5px] font-medium text-accent hover:underline">
                definir em Preços →
              </Link>
            )}
          </label>

          {/* A BASE também se digita aqui: é o primeiro número de qualquer
              modelo novo, e mandar o vendedor para outra tela no meio do
              atendimento é o que fazia esta tela não servir. */}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line-soft pt-2.5">
            <span className="text-[12.5px] font-medium text-ink-2">Valor na troca (sem avaria)</span>
            <input
              type="number" inputMode="numeric"
              key={chaveLinha(escolhido.modelo, escolhido.armazenamento)}
              defaultValue={atual.na_troca != null ? String(atual.na_troca) : ''}
              placeholder="definir"
              onBlur={(e) => {
                const antes = atual.na_troca != null ? String(atual.na_troca) : ''
                if (e.target.value !== antes) void gravarValor(escolhido, null, e.target.value)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              aria-label="Valor na troca"
              className={`${campo} font-semibold ${atual.na_troca != null ? 'border-solid border-transparent bg-transparent text-ink hover:border-line' : ''}`}
            />
          </div>
        </div>
      )}

      {/* ── Seletor ──────────────────────────────────────────────────────── */}
      <Modal open={seletorAberto} onClose={() => { setSeletorAberto(false); setBusca('') }}
        size="md" title="Qual iPhone o cliente trouxe?">
        <div className="space-y-3">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus
            icon={<Search size={15} strokeWidth={1.8} />} placeholder="Buscar (ex.: 13 pro)" />

          {visiveis.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">Nenhum iPhone casa com “{busca}”.</p>
          ) : (
            <div className="max-h-[52vh] space-y-1 overflow-y-auto scrollbar-thin">
              {/**
                * A LISTA É O CATÁLOGO INTEIRO, sempre.
                *
                * Já foi só "o que tem valor cadastrado", e com a tabela vazia
                * isso deixava o seletor vazio — a tela morria antes das avarias.
                * O aparelho que o cliente trouxe existe independente de a loja
                * ter preenchido a tabela; o valor é que se resolve na hora.
                */}
              {visiveis.map((f) => {
                const aberta = f.forcarAberta || abertas.has(f.label)
                const prontos = comBase(f.label)
                return (
                  <Fragment key={f.label}>
                    <button
                      type="button"
                      onClick={() => setAbertas((s) => {
                        const n = new Set(s)
                        if (n.has(f.label)) n.delete(f.label); else n.add(f.label)
                        return n
                      })}
                      aria-expanded={aberta}
                      className="flex w-full items-center gap-2 rounded-control px-1 py-1.5 text-left transition-colors hover:bg-ink/[0.03]"
                    >
                      {aberta
                        ? <ChevronDown size={14} strokeWidth={2} className="text-ink-3" />
                        : <ChevronRight size={14} strokeWidth={2} className="text-ink-3" />}
                      <span className="text-[12.5px] font-semibold text-ink">{f.label}</span>
                      <span className="text-[11.5px] font-medium text-ink-3">
                        {f.linhas.length} modelos
                        {prontos > 0 && <span className="text-ok"> · {prontos} com valor</span>}
                      </span>
                    </button>

                    {aberta && (
                      <div className="mb-1.5 space-y-1 pl-5">
                        {f.linhas.map((l) => {
                          const base = valores[chaveLinha(l.modelo, l.armazenamento)]?.na_troca
                          return (
                            <button
                              key={chaveLinha(l.modelo, l.armazenamento)} type="button"
                              onClick={() => escolher({ modelo: l.modelo, armazenamento: l.armazenamento })}
                              className="flex w-full items-center justify-between gap-3 rounded-control border border-line-soft bg-bg px-3 py-2 text-left transition-colors hover:border-accent"
                            >
                              <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                                {l.modelo.replace(/^iPhone /, '')} {l.armazenamento}
                              </span>
                              {base != null
                                ? <Badge tone="acc">{brl(base)}</Badge>
                                : <span className="shrink-0 text-[11.5px] text-ink-3">sem valor</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
