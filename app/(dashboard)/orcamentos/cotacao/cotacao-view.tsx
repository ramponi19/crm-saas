'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronRight, RotateCcw, Search, Smartphone, Table2 } from 'lucide-react'
import { Badge, Button, Input, Modal, notify } from '@/components/ui'
import { ClienteAutocomplete } from '../cliente-autocomplete'
import { AVARIAS, AVARIA_POR_CHAVE, BONUS_LEVA_SEMINOVO, calcularTroca, descontoDe } from '@/lib/troca-avarias'
import { nomeCompleto } from '@/lib/troca-modelos'

export interface AparelhoAvaliavel {
  modelo: string
  armazenamento: string
  na_troca: number
  descontos: Record<string, number>
}

export interface CotacaoRecente {
  id: number
  modelo: string
  armazenamento: string
  valor_final: number
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const chave = (a: { modelo: string; armazenamento: string }) => `${a.modelo}|${a.armazenamento}`

export function CotacaoView({
  aparelhos, ultimas, bonusSeminovo, corteBateria, avariaPendente,
}: {
  aparelhos: AparelhoAvaliavel[]
  ultimas: CotacaoRecente[]
  bonusSeminovo: number
  corteBateria: number
  /** Avaria que veio de um chip do checklist, pela URL. */
  avariaPendente: string | null
}) {
  const router = useRouter()
  const [escolhido, setEscolhido] = useState<AparelhoAvaliavel | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState({ nome: '', telefone: '', cliente_id: null as number | null })
  const [imei, setImei] = useState('')
  const [salvando, setSalvando] = useState(false)

  const porChave = useMemo(() => new Map(aparelhos.map((a) => [chave(a), a])), [aparelhos])

  /** Agrupado por modelo, como o seletor do modelo de referência. */
  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const mapa = new Map<string, AparelhoAvaliavel[]>()
    for (const a of aparelhos) {
      if (termo && !nomeCompleto(a.modelo, a.armazenamento).toLowerCase().includes(termo)) continue
      mapa.set(a.modelo, [...(mapa.get(a.modelo) ?? []), a])
    }
    return [...mapa.entries()]
  }, [aparelhos, busca])

  const conta = escolhido
    ? calcularTroca(escolhido.na_troca, escolhido.descontos, [...marcadas], bonusSeminovo)
    : null

  /**
   * A avaria que o chip do checklist mandou, se ela existe de verdade.
   *
   * Validada contra a lista de avarias: `?avaria=qualquercoisa` na URL não pode
   * virar marcação, nem uma chave que foi removida do produto.
   */
  const pendente = avariaPendente && AVARIA_POR_CHAVE[avariaPendente] ? avariaPendente : null

  function escolher(a: AparelhoAvaliavel) {
    setEscolhido(a)
    /**
     * Trocar de aparelho LIMPA as avarias.
     *
     * Manter as marcações do aparelho anterior é a forma mais fácil de emitir
     * cotação errada: o vendedor troca o modelo, o valor recalcula com os
     * defeitos do aparelho que já foi embora, e nada na tela avisa.
     *
     * A avaria vinda do checklist é a exceção — e entra AQUI, não na abertura da
     * tela, justamente por causa da regra acima: marcada antes do aparelho, ela
     * seria apagada por esta mesma linha um instante depois.
     */
    setMarcadas(pendente ? new Set([pendente]) : new Set())
    setSeletorAberto(false)
    setBusca('')
  }

  function limparTudo() {
    setEscolhido(null)
    setMarcadas(new Set())
    setCliente({ nome: '', telefone: '', cliente_id: null })
    setImei('')
  }

  function alternar(c: string) {
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(c)) n.delete(c); else n.add(c)
      return n
    })
  }

  async function salvar(gerarOrcamento: boolean) {
    if (!escolhido) { notify.warn('Escolha o aparelho'); return }
    if (gerarOrcamento && !cliente.nome.trim()) { notify.warn('Informe o cliente para gerar o orçamento'); return }
    setSalvando(true)

    const r = await fetch('/api/troca/cotacoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelo: escolhido.modelo, armazenamento: escolhido.armazenamento,
        imei, cliente_nome: cliente.nome, cliente_id: cliente.cliente_id,
        avarias: [...marcadas], status: 'fechada',
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setSalvando(false); notify.bad('Não salvou', j.error); return }

    if (!gerarOrcamento) {
      setSalvando(false)
      notify.ok('Cotação salva', `${nomeCompleto(escolhido.modelo, escolhido.armazenamento)} · ${brl(j.total ?? 0)}`)
      limparTudo()
      router.refresh()
      return
    }

    /**
     * A ponte com o orçamento: o valor cotado entra como ENTRADA de um
     * downgrade.
     *
     * É o encaixe que já existia e estava cego — `valor_entrada` era digitado
     * no escuro, sem nenhuma tabela por trás. Agora chega calculado, com as
     * avarias que o justificam gravadas na cotação.
     */
    const ro = await fetch('/api/orcamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'downgrade',
        cliente_nome: cliente.nome, cliente_telefone: cliente.telefone, cliente_id: cliente.cliente_id,
        aparelho_usado: nomeCompleto(escolhido.modelo, escolhido.armazenamento),
        valor_entrada: j.total ?? 0,
        imei,
        observacoes: `Cotação de troca #${j.id}: base ${brl(j.base ?? 0)}`
          + (j.descontos ? ` · descontos ${brl(j.descontos)}` : '')
          + (j.bonus ? ` · bônus ${brl(j.bonus)}` : ''),
      }),
    })
    setSalvando(false)
    const jo = await ro.json().catch(() => ({}))
    if (!ro.ok) { notify.bad('Cotação salva, mas o orçamento falhou', jo.error); return }
    notify.ok('Orçamento criado', 'Complete o aparelho que o cliente vai levar')
    router.push('/orcamentos')
  }

  // ── Sem matriz preenchida não há o que cotar ───────────────────────────────
  if (aparelhos.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mx-auto w-full max-w-[560px] pt-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
            <Table2 size={22} strokeWidth={1.6} />
          </div>
          <h1 className="text-[17px] font-semibold text-ink">Nenhum aparelho avaliado ainda</h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            A cotação lê a sua tabela de troca. Preencha o valor <strong className="text-ink">Na troca</strong> dos
            modelos que a loja compra — os que ficarem em branco simplesmente não aparecem aqui.
          </p>
          <Link href="/orcamentos/precos" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
            Abrir Preços <ArrowRight size={14} strokeWidth={2} />
          </Link>
        </div>
      </div>
    )
  }

  const passo = 'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11.5px] font-bold'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
      <div className="mx-auto w-full max-w-[680px] space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">Nova cotação</h1>
          <p className="text-[13px] text-ink-3">Quanto a loja paga pelo aparelho que o cliente está entregando.</p>
        </div>

        {/* ── 1. Aparelho ──────────────────────────────────────────────────── */}
        <section className="rounded-control border border-line-soft bg-raised p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className={`${passo} bg-accent text-white`}>1</span>
            <h2 className="text-[14px] font-semibold text-ink">Escolha o aparelho</h2>
          </div>

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
                  <span className="text-[12px] text-ink-3">Na troca {brl(escolhido.na_troca)}</span>
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

          {/* Veio de um chip do checklist: dizer que a avaria está esperando o
              aparelho evita a impressão de que o clique não fez nada. */}
          {pendente && !escolhido && (
            <p className="mt-2.5 rounded-control border border-accent/25 bg-accent-soft px-2.5 py-1.5 text-[12px] text-ink-2">
              Do checklist: <strong className="text-ink">{AVARIA_POR_CHAVE[pendente].label}</strong> será
              marcada assim que você escolher o aparelho.
            </p>
          )}

          {ultimas.length > 0 && !escolhido && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-ink-3">ÚLTIMOS AVALIADOS</p>
              <div className="flex flex-wrap gap-1.5">
                {/* Modelo que saiu da matriz depois de cotado não é clicável:
                    sem base, a rota recusaria — melhor não oferecer o botão. */}
                {ultimas.map((u) => {
                  const alvo = porChave.get(chave(u))
                  return (
                    <button
                      key={u.id} type="button" disabled={!alvo}
                      onClick={() => alvo && escolher(alvo)}
                      className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                      title={alvo ? undefined : 'Este modelo não tem mais valor de troca cadastrado'}
                    >
                      {nomeCompleto(u.modelo, u.armazenamento).replace(/^iPhone /, '')}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── 2. Avarias ───────────────────────────────────────────────────── */}
        <section className={`rounded-control border border-line-soft bg-raised p-4 ${escolhido ? '' : 'opacity-50'}`}>
          <div className="mb-1 flex items-center gap-2">
            <span className={`${passo} ${escolhido ? 'bg-accent text-white' : 'bg-ink/[0.07] text-ink-3'}`}>2</span>
            <h2 className="text-[14px] font-semibold text-ink">Marque o que está errado</h2>
          </div>
          <p className="mb-3 pl-[30px] text-[12px] text-ink-3">
            Não achou nada? Deixe tudo desmarcado — o valor fica o da tabela.
          </p>

          {escolhido ? (
            <div className="space-y-0.5">
              {AVARIAS.map((a) => {
                const valor = descontoDe(escolhido.descontos, a.chave)
                const marcado = marcadas.has(a.chave)
                return (
                  <label
                    key={a.chave}
                    className="flex cursor-pointer items-center gap-2.5 rounded-control px-1.5 py-2 transition-colors hover:bg-ink/[0.02]"
                    title={a.ajuda}
                  >
                    <input
                      type="checkbox" checked={marcado} onChange={() => alternar(a.chave)}
                      className="h-[15px] w-[15px] shrink-0 accent-[var(--accent)]"
                    />
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${marcado ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                      {a.label}
                      {a.chave === 'bateria' && (
                        <span className="ml-1.5 text-[11.5px] font-normal text-ink-3">abaixo de {corteBateria}%</span>
                      )}
                    </span>
                    {/**
                      * Avaria sem valor na matriz mostra "sem desconto", não
                      * "−R$ 0,00": o segundo parece um desconto aplicado e o
                      * vendedor não percebe que falta cadastrar.
                      */}
                    <span className={`shrink-0 text-[12.5px] tabular-nums ${valor > 0 ? 'font-semibold text-bad' : 'text-ink-3'}`}>
                      {valor > 0 ? `− ${brl(valor)}` : 'sem desconto'}
                    </span>
                  </label>
                )
              })}

              {bonusSeminovo > 0 && (
                <label className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-control border border-ok/25 bg-ok-soft px-2.5 py-2.5"
                  title={BONUS_LEVA_SEMINOVO.ajuda}>
                  <input
                    type="checkbox" checked={marcadas.has(BONUS_LEVA_SEMINOVO.chave)}
                    onChange={() => alternar(BONUS_LEVA_SEMINOVO.chave)}
                    className="h-[15px] w-[15px] shrink-0 accent-[var(--ok)]"
                  />
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{BONUS_LEVA_SEMINOVO.label}</span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ok">+ {brl(bonusSeminovo)}</span>
                </label>
              )}
            </div>
          ) : (
            <p className="pl-[30px] text-[13px] text-ink-3">Escolha o aparelho primeiro.</p>
          )}
        </section>

        {/* ── 3. Valor ─────────────────────────────────────────────────────── */}
        <section className="rounded-control border border-line-soft bg-raised p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className={`${passo} ${conta ? 'bg-accent text-white' : 'bg-ink/[0.07] text-ink-3'}`}>3</span>
            <h2 className="text-[14px] font-semibold text-ink">Valor a pagar</h2>
          </div>

          <div className="rounded-control bg-bg p-3.5">
            <div className="flex items-end justify-between gap-3">
              <span className="text-[13px] text-ink-2">Total</span>
              <span className="text-[26px] font-semibold leading-none tabular-nums text-ink">
                {brl(conta?.total ?? 0)}
              </span>
            </div>

            {conta && (
              <div className="mt-3 space-y-1 border-t border-line-soft pt-2.5 text-[12.5px]">
                <div className="flex justify-between text-ink-2">
                  <span>Valor na troca</span><span className="tabular-nums">{brl(conta.base)}</span>
                </div>
                {conta.descontos > 0 && (
                  <div className="flex justify-between text-bad">
                    <span>{marcadas.size - (conta.bonus > 0 ? 1 : 0)} avaria(s)</span>
                    <span className="tabular-nums">− {brl(conta.descontos)}</span>
                  </div>
                )}
                {conta.bonus > 0 && (
                  <div className="flex justify-between text-ok">
                    <span>Bônus (leva seminovo)</span><span className="tabular-nums">+ {brl(conta.bonus)}</span>
                  </div>
                )}
                {/* O piso em zero não é detalhe de conta: o vendedor precisa
                    saber que as avarias passaram do valor do aparelho. */}
                {conta.base - conta.descontos + conta.bonus < 0 && (
                  <p className="pt-1 text-[12px] font-medium text-warn">
                    As avarias somam mais que o valor do aparelho. Não vale a troca.
                  </p>
                )}
              </div>
            )}
          </div>

          {conta && (
            <div className="mt-3.5 space-y-3 border-t border-line-soft pt-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ClienteAutocomplete
                  nome={cliente.nome}
                  onNome={(v) => setCliente({ ...cliente, nome: v, cliente_id: null })}
                  onSelect={(c) => setCliente({ nome: c.nome, telefone: c.telefone, cliente_id: c.cliente_id })}
                />
                <Input label="IMEI (opcional)" value={imei} onChange={(e) => setImei(e.target.value)}
                  placeholder="Disque *#06# no aparelho" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => salvar(false)} loading={salvando} variant="outline">Salvar cotação</Button>
                <Button onClick={() => salvar(true)} loading={salvando}>Gerar orçamento de troca</Button>
                <button type="button" onClick={limparTudo}
                  className="ml-auto flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink">
                  <RotateCcw size={13} strokeWidth={1.8} /> Limpar e avaliar outro
                </button>
              </div>
              <p className="text-[11.5px] text-ink-3">
                Antes de fechar, passe o <Link href="/orcamentos/checklist" className="font-medium text-accent hover:underline">checklist de 26 itens</Link> —
                é onde aparecem iCloud de terceiro, IMEI adulterado e jailbreak.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Seletor de aparelho ────────────────────────────────────────────── */}
      <Modal open={seletorAberto} onClose={() => { setSeletorAberto(false); setBusca('') }}
        size="md" title="Qual iPhone o cliente trouxe?">
        <div className="space-y-3">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus
            icon={<Search size={15} strokeWidth={1.8} />} placeholder="Buscar (ex.: 13 pro)" />

          {grupos.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">
              Nenhum aparelho avaliado casa com “{busca}”.
            </p>
          ) : (
            <div className="max-h-[52vh] space-y-3 overflow-y-auto scrollbar-thin">
              {grupos.map(([modelo, itens]) => (
                <div key={modelo}>
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.04em] text-ink-3">{modelo}</p>
                  <div className="space-y-1">
                    {itens.map((a) => (
                      <button
                        key={chave(a)} type="button" onClick={() => escolher(a)}
                        className="flex w-full items-center justify-between gap-3 rounded-control border border-line-soft bg-bg px-3 py-2 text-left transition-colors hover:border-accent"
                      >
                        <span className="text-[13px] font-medium text-ink">
                          {a.armazenamento || 'sem armazenamento'}
                        </span>
                        <Badge tone="acc">{brl(a.na_troca)}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
