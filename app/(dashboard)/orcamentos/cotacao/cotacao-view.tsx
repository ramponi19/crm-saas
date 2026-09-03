'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, RotateCcw, Search, Smartphone } from 'lucide-react'
import { Badge, Button, Input, Modal, notify } from '@/components/ui'
import { ClienteAutocomplete } from '../cliente-autocomplete'
import { AVARIAS, AVARIA_POR_CHAVE, BONUS_LEVA_SEMINOVO, calcularTroca, descontoDe } from '@/lib/troca-avarias'
import { familiasDeTroca, chaveLinha, nomeCompleto } from '@/lib/troca-modelos'

/** O que a loja já preencheu para um par modelo+armazenamento. */
export interface ValoresDoModelo {
  na_troca: number | null
  descontos: Record<string, number>
}

export interface CotacaoRecente {
  id: number
  modelo: string
  armazenamento: string
  valor_final: number
}

interface Escolhido { modelo: string; armazenamento: string }

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const VAZIO: ValoresDoModelo = { na_troca: null, descontos: {} }

export function CotacaoView({
  valoresIniciais, ultimas, bonusSeminovo, corteBateria, avariaPendente,
}: {
  valoresIniciais: Record<string, ValoresDoModelo>
  ultimas: CotacaoRecente[]
  bonusSeminovo: number
  corteBateria: number
  /** Avaria que veio de um chip do checklist, pela URL. */
  avariaPendente: string | null
}) {
  const router = useRouter()
  const familias = useMemo(() => familiasDeTroca(), [])

  /**
   * A matriz no estado, para a tela poder ESCREVER nela sem sair da cotação.
   *
   * É o que substitui os "valores sugeridos" do site de referência: aqui não se
   * inventa preço de mercado (decisão do dono). Em vez disso, o campo em branco
   * é editável no lugar, e o que o vendedor digitar durante o atendimento fica
   * salvo na tabela — a matriz se preenche pelo uso, sem ninguém encarar uma
   * tela de 1.680 campos.
   */
  const [valores, setValores] = useState<Record<string, ValoresDoModelo>>(valoresIniciais)
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set([familias[0]?.label]))
  const [cliente, setCliente] = useState({ nome: '', telefone: '', cliente_id: null as number | null })
  const [imei, setImei] = useState('')
  const [salvando, setSalvando] = useState(false)

  const doModelo = (a: Escolhido | null): ValoresDoModelo =>
    (a && valores[chaveLinha(a.modelo, a.armazenamento)]) || VAZIO

  const atual = doModelo(escolhido)
  const conta = escolhido
    ? calcularTroca(atual.na_troca ?? 0, atual.descontos, [...marcadas], bonusSeminovo)
    : null

  const pendente = avariaPendente && AVARIA_POR_CHAVE[avariaPendente] ? avariaPendente : null

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

  function escolher(a: Escolhido) {
    setEscolhido(a)
    /**
     * Trocar de aparelho LIMPA as avarias.
     *
     * Manter as marcações do aparelho anterior é a forma mais fácil de emitir
     * cotação errada: o vendedor troca o modelo, o valor recalcula com os
     * defeitos do aparelho que já foi embora, e nada na tela avisa.
     *
     * A avaria vinda do checklist é a exceção — e entra AQUI, não na abertura da
     * tela, justamente por causa da regra acima.
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

  /**
   * Grava um valor da matriz a partir DAQUI, e guarda no estado.
   *
   * `coluna === null` significa a base (`na_troca`); qualquer outra string é
   * chave de avaria. A rota é a mesma que a tela de Preços usa, então as duas
   * telas não podem divergir na validação.
   */
  async function gravarValor(alvo: Escolhido, coluna: string | null, texto: string) {
    const num = texto.trim() === '' ? null : Math.max(0, Number(texto.replace(',', '.')) || 0)
    const k = chaveLinha(alvo.modelo, alvo.armazenamento)

    setValores((v) => {
      const linha = v[k] ?? { na_troca: null, descontos: {} }
      if (coluna === null) return { ...v, [k]: { ...linha, na_troca: num } }
      const descontos = { ...linha.descontos }
      if (num == null) delete descontos[coluna]
      else descontos[coluna] = num
      return { ...v, [k]: { ...linha, descontos } }
    })

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

  async function salvar(gerarOrcamento: boolean) {
    if (!escolhido) { notify.warn('Escolha o aparelho'); return }
    if (atual.na_troca == null) {
      notify.warn('Falta o valor na troca', 'Preencha o "Valor na troca" no passo 3.')
      return
    }
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

  const passo = 'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11.5px] font-bold'
  const campo = 'h-[28px] w-[104px] rounded-control border border-dashed border-line bg-bg px-2 text-right text-[12.5px] tabular-nums text-ink outline-none transition-colors placeholder:text-ink-3/60 focus:border-accent focus:border-solid'

  /** Quantos modelos da família já têm base — pista de progresso no seletor. */
  const comBase = (label: string) => {
    const f = familias.find((x) => x.label === label)
    if (!f) return 0
    return f.linhas.filter((l) => valores[chaveLinha(l.modelo, l.armazenamento)]?.na_troca != null).length
  }

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
                  <span className="text-[12px] text-ink-3">
                    {atual.na_troca != null ? `Na troca ${brl(atual.na_troca)}` : 'Sem valor na troca — defina no passo 3'}
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
                {ultimas.map((u) => (
                  <button
                    key={u.id} type="button"
                    onClick={() => escolher({ modelo: u.modelo, armazenamento: u.armazenamento })}
                    className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink"
                  >
                    {nomeCompleto(u.modelo, u.armazenamento).replace(/^iPhone /, '')}
                  </button>
                ))}
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
                const valor = descontoDe(atual.descontos, a.chave)
                const definido = atual.descontos[a.chave] != null
                const marcado = marcadas.has(a.chave)
                return (
                  <div
                    key={a.chave}
                    className="flex items-center gap-2.5 rounded-control px-1.5 py-2 transition-colors hover:bg-ink/[0.02]"
                  >
                    <input
                      type="checkbox" checked={marcado} onChange={() => alternar(a.chave)}
                      id={`av-${a.chave}`}
                      className="h-[15px] w-[15px] shrink-0 accent-[var(--accent)]"
                    />
                    <label htmlFor={`av-${a.chave}`}
                      title={a.ajuda}
                      className={`min-w-0 flex-1 cursor-pointer truncate text-[13px] ${marcado ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                      {a.label}
                      {a.chave === 'bateria' && (
                        <span className="ml-1.5 text-[11.5px] font-normal text-ink-3">abaixo de {corteBateria}%</span>
                      )}
                    </label>

                    {/**
                      * O VALOR É EDITÁVEL AQUI.
                      *
                      * Era só texto — e com a tabela em branco mostrava "sem
                      * desconto" em tudo, sem saída a não ser abandonar o
                      * atendimento e ir para a tela de Preços. Agora o número se
                      * digita no balcão e fica salvo na matriz: da segunda vez
                      * que esse modelo aparecer, já vem pronto.
                      */}
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

            {escolhido && (
              <div className="mt-3 space-y-1.5 border-t border-line-soft pt-2.5 text-[12.5px]">
                {/* A BASE também se digita aqui. É o primeiro número de qualquer
                    modelo novo, e mandar o vendedor para outra tela no meio do
                    atendimento é o que fazia esta tela não servir. */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-2">Valor na troca</span>
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
                {conta && conta.descontos > 0 && (
                  <div className="flex justify-between text-bad">
                    <span>{marcadas.size - (conta.bonus > 0 ? 1 : 0)} avaria(s)</span>
                    <span className="tabular-nums">− {brl(conta.descontos)}</span>
                  </div>
                )}
                {conta && conta.bonus > 0 && (
                  <div className="flex justify-between text-ok">
                    <span>Bônus (leva seminovo)</span><span className="tabular-nums">+ {brl(conta.bonus)}</span>
                  </div>
                )}
                {atual.na_troca == null && (
                  <p className="pt-1 text-[12px] font-medium text-warn">
                    Defina o valor na troca acima para fechar a cotação.
                  </p>
                )}
                {/* O piso em zero não é detalhe de conta: o vendedor precisa
                    saber que as avarias passaram do valor do aparelho. */}
                {conta && conta.base - conta.descontos + conta.bonus < 0 && (
                  <p className="pt-1 text-[12px] font-medium text-warn">
                    As avarias somam mais que o valor do aparelho. Não vale a troca.
                  </p>
                )}
              </div>
            )}
          </div>

          {escolhido && (
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
                O que você digitar nos valores fica salvo na sua{' '}
                <Link href="/orcamentos/precos" className="font-medium text-accent hover:underline">tabela de Preços</Link> —
                da próxima vez esse modelo já vem pronto. Antes de fechar, passe o{' '}
                <Link href="/orcamentos/checklist" className="font-medium text-accent hover:underline">checklist de 26 itens</Link>.
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

          {visiveis.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">Nenhum iPhone casa com “{busca}”.</p>
          ) : (
            <div className="max-h-[52vh] space-y-1 overflow-y-auto scrollbar-thin">
              {/**
                * A LISTA É O CATÁLOGO INTEIRO, sempre.
                *
                * Antes vinham só os modelos com valor já cadastrado — e com a
                * tabela vazia isso deixava o seletor vazio, que era o defeito.
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
                          const v = valores[chaveLinha(l.modelo, l.armazenamento)]
                          const base = v?.na_troca
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
