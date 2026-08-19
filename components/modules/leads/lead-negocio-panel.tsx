'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Handshake, Loader2, Key, ClipboardCheck, FileSignature, X } from 'lucide-react'
import { Input, Select, Button, Badge, notify } from '@/components/ui'
import { formatarData } from '@/lib/datas'

/**
 * O negócio deste lead: venda ou locação de um imóvel.
 *
 * POR QUE ESTE PAINEL EXISTE: as etapas Contrato, Vistoria e Entrega de chaves
 * entraram no funil, mas etapa é sobre o LEAD — não diz qual imóvel foi fechado,
 * por quanto, nem quando a chave saiu. Sem este registro a imobiliária não tem
 * comissão, não tem "Vendas × Locações" e não sabe se um negócio está parado
 * esperando assinatura ou vistoria.
 *
 * Entra pelo registro de painéis de vertical (`paineisDoLead`), então o modal do
 * lead — o arquivo mais disputado do projeto — não precisa saber que a imobiliária
 * existe.
 */

type Negocio = {
  id: number
  tipo: string
  valor: number
  status: string
  assinado_em: string | null
  vistoria_em: string | null
  chaves_entregues_em: string | null
  locacao_inicio: string | null
  locacao_fim: string | null
  observacoes: string | null
  percentual: number | null
  comissao_total: number | null
  comissao_captador: number | null
  comissao_vendedor: number | null
  cashback: number | null
  comissao_status: string | null
  imoveis: { codigo: string | null; titulo: string | null } | { codigo: string | null; titulo: string | null }[] | null
}

type ImovelOpcao = {
  id: number
  codigo: string | null
  titulo: string | null
  finalidade: string | null
  valor_venda: number | null
  valor_locacao: number | null
}

const brl = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Etapas do negócio, na ordem em que acontecem. Cada uma tem a sua data. */
const PASSOS = [
  { status: 'contrato',   label: 'Contrato',          campo: 'assinado_em',          icon: FileSignature },
  { status: 'vistoria',   label: 'Vistoria',          campo: 'vistoria_em',          icon: ClipboardCheck },
  { status: 'entregue',   label: 'Entrega de chaves', campo: 'chaves_entregues_em',  icon: Key },
] as const

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutro' | 'acc'> = {
  contrato: 'acc', vistoria: 'warn', entregue: 'ok', finalizado: 'ok', cancelado: 'bad',
}

export function LeadNegocioPanel({ leadId }: { leadId: number }) {
  const supabase = createClient()
  const [negocio, setNegocio] = useState<Negocio | null>(null)
  const [imoveis, setImoveis] = useState<ImovelOpcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [abrindo, setAbrindo] = useState(false)
  const [form, setForm] = useState({ imovel_id: '', tipo: 'venda', valor: '', assinado_em: '', locacao_inicio: '', locacao_fim: '', cashback: '' })

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('negocios_imobiliarios')
      .select('id, tipo, valor, status, assinado_em, vistoria_em, chaves_entregues_em, locacao_inicio, locacao_fim, observacoes, percentual, comissao_total, comissao_captador, comissao_vendedor, cashback, comissao_status, imoveis!negocios_imobiliarios_imovel_id_fkey(codigo, titulo)')
      .eq('lead_id', leadId)
      .not('status', 'eq', 'cancelado')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setNegocio((data as unknown as Negocio) ?? null)
    setCarregando(false)
  }, [supabase, leadId])

  useEffect(() => { void carregar() }, [carregar])

  /** Só imóvel que pode ser fechado entra na lista — o resto seria escolha inválida. */
  async function abrirFormulario() {
    setAbrindo(true)
    const { data } = await supabase.from('imoveis')
      .select('id, codigo, titulo, finalidade, valor_venda, valor_locacao')
      .in('status', ['disponivel', 'reservado'])
      .order('codigo')
      .limit(300)
    setImoveis((data ?? []) as ImovelOpcao[])
  }

  /** Escolher o imóvel já traz finalidade e valor de anúncio — o corretor ajusta. */
  function escolherImovel(id: string) {
    const im = imoveis.find((i) => String(i.id) === id)
    const tipo = im?.finalidade === 'locacao' ? 'locacao' : 'venda'
    const sugerido = tipo === 'locacao' ? im?.valor_locacao : im?.valor_venda
    setForm((f) => ({ ...f, imovel_id: id, tipo, valor: sugerido != null ? String(sugerido) : f.valor }))
  }

  async function fechar() {
    setSalvando(true)
    const res = await fetch('/api/imob/negocios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imovel_id: Number(form.imovel_id) || null,
        lead_id: leadId,
        tipo: form.tipo,
        valor: Number(String(form.valor).replace(/\./g, '').replace(',', '.')),
        assinado_em: form.assinado_em || null,
        // `\.` escapado: `/./g` casa QUALQUER caractere e apagaria o valor inteiro,
        // fazendo todo cashback chegar zero sem ninguém perceber.
        cashback: Number(String(form.cashback).replace(/\./g, '').replace(',', '.')) || 0,
        locacao_inicio: form.locacao_inicio || null,
        locacao_fim: form.locacao_fim || null,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSalvando(false)
    if (!res.ok) { notify.bad('Não foi possível registrar', j?.error); return }
    // O aviso da rota (imóvel não baixado) precisa chegar em quem fechou.
    if (j?.aviso) notify.warn('Negócio registrado', j.aviso)
    else notify.ok('Negócio registrado')
    setAbrindo(false)
    setForm({ imovel_id: '', tipo: 'venda', valor: '', assinado_em: '', locacao_inicio: '', locacao_fim: '', cashback: '' })
    void carregar()
  }

  async function avancar(status: string, campo?: string) {
    setSalvando(true)
    const hoje = new Date()
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const res = await fetch('/api/imob/negocios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: negocio!.id, status, ...(campo ? { [campo]: iso } : {}) }),
    })
    const j = await res.json().catch(() => ({}))
    setSalvando(false)
    if (!res.ok) { notify.bad('Não foi possível atualizar', j?.error); return }
    notify.ok(status === 'cancelado' ? 'Negócio cancelado' : 'Negócio atualizado')
    void carregar()
  }

  if (carregando) {
    return (
      <div className="rounded-control border border-line-soft bg-bg p-3 text-[12.5px] text-ink-3">
        <Loader2 size={13} className="mr-1.5 inline animate-spin" /> carregando o negócio…
      </div>
    )
  }

  // ── Já existe negócio: mostra a linha do tempo e o próximo passo ──
  if (negocio) {
    const im = Array.isArray(negocio.imoveis) ? negocio.imoveis[0] : negocio.imoveis
    const idx = PASSOS.findIndex((p) => p.status === negocio.status)
    const proximo = idx >= 0 && idx < PASSOS.length - 1 ? PASSOS[idx + 1] : null
    return (
      <div className="rounded-control border border-line bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Handshake size={14} strokeWidth={1.8} className="text-accent" />
            {negocio.tipo === 'locacao' ? 'Locação' : 'Venda'} fechada
          </span>
          <Badge tone={TONE[negocio.status] ?? 'neutro'}>{negocio.status}</Badge>
        </div>

        <div className="text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">{im?.codigo || im?.titulo || 'imóvel'}</span>
          {' · '}
          <span className="num font-semibold text-ink">{brl(negocio.valor)}</span>
        </div>

        <div className="mt-2.5 space-y-1">
          {PASSOS.map((p) => {
            const data = negocio[p.campo] as string | null
            const Icon = p.icon
            return (
              <div key={p.status} className="flex items-center gap-2 text-[12px]">
                <Icon size={13} strokeWidth={1.8} className={data ? 'text-ok' : 'text-ink-3'} />
                <span className={data ? 'text-ink-2' : 'text-ink-3'}>{p.label}</span>
                <span className="num ml-auto text-ink-3">{formatarData(data, undefined, '—')}</span>
              </div>
            )
          })}
          {negocio.tipo === 'locacao' && (negocio.locacao_inicio || negocio.locacao_fim) && (
            <div className="flex items-center gap-2 border-t border-line-soft pt-1.5 text-[12px] text-ink-3">
              <span>Vigência</span>
              <span className="num ml-auto">
                {formatarData(negocio.locacao_inicio, { day: '2-digit', month: '2-digit', year: '2-digit' }, '—')}
                {' a '}
                {formatarData(negocio.locacao_fim, { day: '2-digit', month: '2-digit', year: '2-digit' }, '—')}
              </span>
            </div>
          )}
        </div>

        {/* A comissão, com a origem do número à vista.
            Dizer "prevista" e mostrar a taxa é o que separa número calculado de
            número inventado — e as duas definições (base do cálculo e cashback)
            ainda esperam confirmação do dono. */}
        {negocio.comissao_total != null && (
          <div className="mt-3 rounded-control border border-line-soft bg-bg p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold text-ink">
                Comissão {negocio.comissao_status === 'paga' ? 'paga' : 'prevista'}
              </span>
              <span className="num text-[13px] font-bold text-ink">{brl(negocio.comissao_total)}</span>
            </div>
            <div className="num mt-0.5 text-[11px] text-ink-3">
              {negocio.percentual}% sobre {brl(negocio.valor)}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11.5px] text-ink-2">
              <div className="flex justify-between gap-2"><span>Captador</span><span className="num">{brl(negocio.comissao_captador)}</span></div>
              <div className="flex justify-between gap-2"><span>Vendedor</span><span className="num">{brl(negocio.comissao_vendedor)}</span></div>
              {(negocio.cashback ?? 0) > 0 && (
                <div className="flex justify-between gap-2 text-warn"><span>Cashback ao cliente</span><span className="num">−{brl(negocio.cashback)}</span></div>
              )}
            </div>
          </div>
        )}

        {(proximo || negocio.status === 'entregue') && (
          <div className="mt-3 flex flex-wrap gap-2">
            {proximo && (
              <Button size="sm" variant="outline" loading={salvando}
                onClick={() => avancar(proximo.status, proximo.campo)}>
                Marcar {proximo.label.toLowerCase()}
              </Button>
            )}
            {negocio.status === 'entregue' && (
              <Button size="sm" loading={salvando} onClick={() => avancar('finalizado')}>
                Finalizar negócio
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={salvando}
              icon={<X size={13} strokeWidth={2} />}
              onClick={() => avancar('cancelado')}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ── Nenhum negócio ainda ──
  if (!abrindo) {
    return (
      <Button size="sm" variant="outline" onClick={abrirFormulario}
        icon={<Handshake size={14} strokeWidth={1.8} />}>
        Fechar negócio
      </Button>
    )
  }

  const ehLocacao = form.tipo === 'locacao'
  return (
    <div className="rounded-control border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">Fechar negócio</span>
        <button onClick={() => setAbrindo(false)} className="text-ink-3 hover:text-ink" aria-label="Fechar">
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="space-y-2.5">
        <Select label="Imóvel" value={form.imovel_id} onChange={(e) => escolherImovel(e.target.value)}>
          <option value="">Selecione o imóvel…</option>
          {imoveis.map((i) => (
            <option key={i.id} value={i.id}>
              {(i.codigo ? `${i.codigo} — ` : '') + (i.titulo ?? 'sem título')}
            </option>
          ))}
        </Select>
        {imoveis.length === 0 && (
          <p className="text-[11.5px] text-ink-3">Nenhum imóvel disponível no estoque para fechar.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="venda">Venda</option>
            <option value="locacao">Locação</option>
          </Select>
          <Input label="Valor fechado (R$)" className="num" value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
            placeholder="0,00"
            hint="O que foi combinado, não o anunciado." />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input label="Assinatura" type="date" value={form.assinado_em}
            onChange={(e) => setForm({ ...form, assinado_em: e.target.value })} />
          <Input label="Cashback ao cliente (R$)" className="num" value={form.cashback}
            onChange={(e) => setForm({ ...form, cashback: e.target.value })}
            placeholder="0,00"
            hint="Sai da parte da imobiliária." />
        </div>

        {ehLocacao && (
          <div className="grid grid-cols-2 gap-2">
            <Input label="Início da locação" type="date" value={form.locacao_inicio}
              onChange={(e) => setForm({ ...form, locacao_inicio: e.target.value })} />
            <Input label="Fim da locação" type="date" value={form.locacao_fim}
              onChange={(e) => setForm({ ...form, locacao_fim: e.target.value })} />
          </div>
        )}

        <Button size="sm" className="w-full" loading={salvando} onClick={fechar}
          disabled={!form.imovel_id || !form.valor}>
          Registrar negócio
        </Button>
      </div>
    </div>
  )
}
