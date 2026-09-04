'use client'

import { useState } from 'react'
import { ArrowDownUp, Hash, PackageCheck } from 'lucide-react'
import { Badge, Button, Input, Modal, Select, Textarea, notify } from '@/components/ui'
import { ClienteAutocomplete } from '@/app/(dashboard)/orcamentos/cliente-autocomplete'
import { AvaliarAparelho, type EstadoAvaliacao, type ValoresDoModelo } from './avaliar-aparelho'
import { nomeCompleto } from '@/lib/troca-modelos'

/**
 * UPGRADE / DOWNGRADE — o aparelho que entra e o que sai, numa tela.
 *
 * ══ POR QUE UM TIPO SÓ PARA OS DOIS ════════════════════════════════════════
 *
 * Antes eram dois botões, "Venda / semi-novo" e "Downgrade", abrindo o mesmo
 * formulário genérico. Mas é a MESMA operação: entra um aparelho do cliente,
 * sai um do estoque. O que muda é o SINAL da diferença — o cliente paga
 * (upgrade) ou recebe (downgrade). Pedir ao vendedor que classifique isso
 * ANTES de fazer a conta é pedir que ele adivinhe o resultado.
 *
 * Aqui ele preenche os dois lados e a tela diz qual dos dois é.
 *
 * ══ O NÚMERO ═══════════════════════════════════════════════════════════════
 *
 * Salvar gera uma cotação numerada por empresa. É o código que o vendedor
 * digita no PDV para o abatimento vir pronto — sem redigitar valor de aparelho
 * usado com o cliente na frente, que é onde o número muda "sem querer".
 */

export interface UnidadeEstoque {
  id: number
  label: string
  preco: number
}

export interface TrocaModalProps {
  /** Matriz já preenchida, por `modelo|armazenamento`. */
  valores: Record<string, ValoresDoModelo>
  bonusSeminovo: number
  corteBateria: number
  /** Unidades disponíveis para sair. */
  unidades: UnidadeEstoque[]
  /** Quando aberto de dentro de um lead: amarra a cotação e o orçamento a ele. */
  leadId?: number | null
  clienteInicial?: { nome: string; telefone: string; cliente_id: number | null }
  onClose: () => void
  onSaved?: (r: { numero: number; cotacaoId: number; orcamentoId?: number; token?: string }) => void
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function TrocaModal({
  valores, bonusSeminovo, corteBateria, unidades,
  leadId = null, clienteInicial, onClose, onSaved,
}: TrocaModalProps) {
  const [aval, setAval] = useState<EstadoAvaliacao>({ escolhido: null, marcadas: [], conta: null, base: null })
  const [unidadeId, setUnidadeId] = useState<number | null>(null)
  const [reservar, setReservar] = useState(true)
  const [cliente, setCliente] = useState(clienteInicial ?? { nome: '', telefone: '', cliente_id: null as number | null })
  const [imei, setImei] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  const unidade = unidades.find((u) => u.id === unidadeId) ?? null
  const entrada = aval.conta?.total ?? 0
  const saida = unidade?.preco ?? 0

  /**
   * O saldo cai para qualquer lado, e é ele que nomeia a operação.
   *
   * Positivo: o cliente paga a diferença (upgrade). Negativo: a loja devolve
   * (downgrade). A conta é a mesma da rota que salva — ver `app/api/orcamentos`.
   */
  const saldo = saida - entrada
  const ehUpgrade = saldo >= 0

  const podeSalvar = !!aval.escolhido && aval.base != null && !!unidade && !!cliente.nome.trim()

  async function salvar(enviar: boolean) {
    if (!aval.escolhido) { notify.warn('Escolha o aparelho que o cliente trouxe'); return }
    if (aval.base == null) { notify.warn('Falta o valor na troca', 'Preencha "Valor na troca (sem avaria)".'); return }
    if (!unidade) { notify.warn('Escolha o aparelho que sai do estoque'); return }
    if (!cliente.nome.trim()) { notify.warn('Informe o cliente'); return }
    setSalvando(true)

    // 1) A cotação — é ela que ganha o número e guarda as avarias.
    const rc = await fetch('/api/troca/cotacoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelo: aval.escolhido.modelo, armazenamento: aval.escolhido.armazenamento,
        imei, cliente_nome: cliente.nome, cliente_id: cliente.cliente_id, lead_id: leadId,
        avarias: aval.marcadas, status: 'fechada', observacoes: obs,
      }),
    })
    const jc = await rc.json().catch(() => ({}))
    if (!rc.ok) { setSalvando(false); notify.bad('Não salvou a cotação', jc.error); return }

    // 2) O orçamento — o documento, apontando para a cotação.
    const ro = await fetch('/api/orcamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'downgrade',
        status: enviar ? 'enviado' : undefined,
        lead_id: leadId,
        cliente_nome: cliente.nome, cliente_telefone: cliente.telefone, cliente_id: cliente.cliente_id,
        aparelho_usado: nomeCompleto(aval.escolhido.modelo, aval.escolhido.armazenamento),
        valor_entrada: jc.total ?? 0,
        aparelho_novo: unidade.label,
        valor_novo: unidade.preco,
        unidade_id: unidade.id,
        troca_cotacao_id: jc.id,
        imei,
        observacoes: obs.trim() || null,
      }),
    })
    const jo = await ro.json().catch(() => ({}))
    if (!ro.ok) {
      setSalvando(false)
      notify.bad('Cotação salva, mas o orçamento falhou', jo.error)
      return
    }

    // 3) A reserva — só quando há lead. Falha aqui NÃO desfaz o orçamento: o
    //    documento já vale, e a unidade pode ter sido reservada por outro no
    //    meio do caminho. Melhor avisar do que perder o orçamento.
    if (reservar && leadId) {
      const rr = await fetch('/api/reservas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidadeId: unidade.id, leadId }),
      })
      if (!rr.ok) {
        const jr = await rr.json().catch(() => ({}))
        notify.warn('Orçamento salvo, mas não reservei o aparelho', jr.error ?? 'Confira o estoque.')
      }
    }

    setSalvando(false)
    if (enviar && jo.token) {
      navigator.clipboard?.writeText(`${window.location.origin}/orcamento/${jo.token}`)
      notify.ok(`Cotação #${jc.numero} salva`, 'Link do orçamento copiado')
    } else {
      notify.ok(`Cotação #${jc.numero} salva`, `Código ${jc.numero} — digite no PDV para abater`)
    }
    onSaved?.({ numero: jc.numero, cotacaoId: jc.id, orcamentoId: jo.id, token: jo.token })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg"
      title={
        <span className="flex items-center gap-2">
          <ArrowDownUp size={16} strokeWidth={1.8} className="text-accent" />
          Upgrade / Downgrade
        </span>
      }
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="outline" onClick={() => salvar(false)} loading={salvando} disabled={!podeSalvar}>Salvar</Button>
        <Button onClick={() => salvar(true)} loading={salvando} disabled={!podeSalvar}>Salvar e copiar link</Button>
      </>}>
      <div className="space-y-4">
        {/* ── Cliente ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ClienteAutocomplete
            nome={cliente.nome}
            onNome={(v) => setCliente({ ...cliente, nome: v, cliente_id: null })}
            onSelect={(c) => setCliente({ nome: c.nome, telefone: c.telefone, cliente_id: c.cliente_id })}
          />
          <Input label="WhatsApp/telefone" value={cliente.telefone}
            onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} />
          <Input label="IMEI do aparelho do cliente" value={imei} onChange={(e) => setImei(e.target.value)}
            placeholder="Disque *#06#" />
        </div>

        {/* ── ENTRA ────────────────────────────────────────────────────────── */}
        <section className="rounded-control border border-line-soft bg-raised p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold tracking-[0.04em] text-ink-2">ENTRA — do cliente</span>
            {aval.conta && <Badge tone="acc">{brl(entrada)}</Badge>}
          </div>
          <AvaliarAparelho
            valoresIniciais={valores}
            bonusSeminovo={bonusSeminovo}
            corteBateria={corteBateria}
            compacto
            onMudar={setAval}
          />
        </section>

        {/* ── SAI ──────────────────────────────────────────────────────────── */}
        <section className="rounded-control border border-line-soft bg-raised p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold tracking-[0.04em] text-ink-2">SAI — do nosso estoque</span>
            {unidade && <Badge tone="neutro">{brl(saida)}</Badge>}
          </div>

          {unidades.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              Nenhuma unidade disponível no estoque desta loja.
            </p>
          ) : (
            <>
              <Select
                label="Aparelho que o cliente leva"
                value={unidadeId != null ? String(unidadeId) : ''}
                onChange={(e) => setUnidadeId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Selecione…</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.label} — {brl(u.preco)}</option>
                ))}
              </Select>

              {leadId && unidade && (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-2">
                  <input type="checkbox" checked={reservar} onChange={(e) => setReservar(e.target.checked)}
                    className="mt-0.5 h-[15px] w-[15px] shrink-0 accent-[var(--accent)]" />
                  <span>
                    <PackageCheck size={13} strokeWidth={1.8} className="mr-1 inline text-accent" />
                    Reservar esta unidade para o lead por 48h
                    <span className="block text-[11.5px] text-ink-3">
                      Sem reserva, outro vendedor pode fechar o mesmo aparelho antes.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}
        </section>

        <Textarea label="Observações (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
          placeholder="Combinado com o cliente, prazo, acessórios…" />

        {/* ── O saldo ──────────────────────────────────────────────────────── */}
        <div className="rounded-control bg-bg p-3.5">
          {aval.conta && unidade ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <span className="text-[13px] font-medium text-ink-2">
                  {ehUpgrade ? 'Cliente PAGA' : 'Loja DEVOLVE'}
                </span>
                <span className={`text-[26px] font-semibold leading-none tabular-nums ${ehUpgrade ? 'text-ink' : 'text-warn'}`}>
                  {brl(Math.abs(saldo))}
                </span>
              </div>
              <div className="mt-2.5 space-y-1 border-t border-line-soft pt-2 text-[12.5px]">
                <div className="flex justify-between text-ink-2">
                  <span>Sai: {unidade.label}</span><span className="tabular-nums">{brl(saida)}</span>
                </div>
                <div className="flex justify-between text-ok">
                  <span>Entra: {nomeCompleto(aval.escolhido!.modelo, aval.escolhido!.armazenamento)}</span>
                  <span className="tabular-nums">− {brl(entrada)}</span>
                </div>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">
                {ehUpgrade
                  ? 'Upgrade: no PDV, o aparelho que sai vai no carrinho e o código abate o valor do usado.'
                  : 'Downgrade: a loja fica devendo a diferença — o acerto se combina com o cliente.'}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] text-ink-3">
              Preencha os dois lados para ver quanto o cliente paga (ou recebe).
            </p>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[11.5px] text-ink-3">
          <Hash size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
          Ao salvar, a cotação recebe um número. É esse código que se digita na seção
          “Aparelho(s) na troca” do PDV para o abatimento vir pronto.
        </p>
      </div>
    </Modal>
  )
}
