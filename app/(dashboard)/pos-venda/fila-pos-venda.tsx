'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageCircle, Phone, Check, MoreHorizontal, CheckCircle2, Copy, ExternalLink } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Badge, EmptyState, Tabs, notify } from '@/components/ui'
import { linkWhatsApp } from '@/lib/whatsapp-link'
import { textoDias, type GrupoFila, type ItemPosVenda } from '@/lib/posvenda/fila'
import { cn } from '@/lib/utils'

interface Props {
  itens: ItemPosVenda[]
  hoje: string
  podeVerTodos: boolean
  ver: 'meus' | 'todos'
  cortado: boolean
  desligado?: boolean
}

const ABAS: { value: GrupoFila; rotulo: string }[] = [
  { value: 'atrasados', rotulo: 'Atrasados' },
  { value: 'hoje', rotulo: 'Hoje' },
  { value: 'proximos', rotulo: 'Próximos' },
]

/**
 * A FILA DO PÓS-VENDA (C7 bloco 2). Pensada para a tela pequena: cada passo é um cartão de quatro linhas (cliente e dias
 * desde a venda; o que comprou; o passo; os botões), para caber vários na tela sem rolar muito. O WhatsApp abre com a
 * mensagem do roteiro já escrita; quem envia é a pessoa. Depois, "Feito" (ou, no menu, sem resposta, reagendar, pular).
 */
export function FilaPosVenda({ itens: iniciais, podeVerTodos, ver, cortado, desligado }: Props) {
  const router = useRouter()
  const [itens, setItens] = useState(iniciais)
  const [aberto, setAberto] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)

  const contagem = useMemo(() => {
    const c: Record<GrupoFila, number> = { atrasados: 0, hoje: 0, proximos: 0 }
    for (const i of itens) c[i.grupo]++
    return c
  }, [itens])
  const [aba, setAba] = useState<GrupoFila>(contagem.atrasados > 0 ? 'atrasados' : contagem.hoje > 0 || contagem.proximos === 0 ? 'hoje' : 'proximos')
  const visiveis = itens.filter((i) => i.grupo === aba)

  async function registrar(item: ItemPosVenda, corpo: Record<string, unknown>, aviso: string) {
    setOcupado(item.id)
    try {
      const r = await fetch('/api/pos-venda/registrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acompanhamento: item.id, ...corpo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad(j.error ?? 'Não foi possível registrar'); return false }
      setItens((prev) => prev.filter((x) => x.id !== item.id))
      setAberto(null)
      notify.ok(aviso)
      if (j.resultado?.chamado_id) notify.ok('Nota baixa: chamado aberto para os administradores')
      router.refresh()
      return true
    } finally {
      setOcupado(null)
    }
  }

  if (desligado) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <Topbar title="Pós-venda" />
        <div className="mx-auto w-full max-w-[640px] p-4 pt-10">
          <EmptyState icon={<CheckCircle2 size={26} strokeWidth={1.6} />} title="O Pós-venda não está ligado nesta empresa"
            description="Quando o módulo for ligado, os passos de cada venda aparecem aqui." />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Pós-venda" />
      <div className="mx-auto w-full max-w-[640px] min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3 sm:px-4 scrollbar-thin">
        {/* O título já está na barra de cima: aqui só o "Meus / Todos" de quem pode ver todos. */}
        {podeVerTodos && (
          <div className="mb-1 flex justify-end">
            <div className="flex rounded-control border border-line bg-card p-0.5 text-[12px]">
              {(['meus', 'todos'] as const).map((v) => (
                <Link key={v} href={v === 'todos' ? '/pos-venda?ver=todos' : '/pos-venda'} replace
                  className={cn('rounded-[6px] px-2.5 py-1 font-medium', ver === v ? 'bg-ink text-white' : 'text-ink-2')}>
                  {v === 'meus' ? 'Meus' : 'Todos'}
                </Link>
              ))}
            </div>
          </div>
        )}
        <Tabs className="mb-3" value={aba} onValueChange={(v) => { setAba(v as GrupoFila); setAberto(null) }}
          items={ABAS.map((a) => ({ value: a.value, label: a.rotulo, badge: contagem[a.value] || undefined }))} />

        {visiveis.length === 0 ? (
          <div className="pt-8">
            <EmptyState icon={<CheckCircle2 size={26} strokeWidth={1.6} />}
              title={aba === 'atrasados' ? 'Nada atrasado' : aba === 'hoje' ? 'Nada para hoje' : 'Nada nos próximos 7 dias'}
              description={aba === 'hoje' && contagem.atrasados > 0 ? `Há ${contagem.atrasados} atrasado(s) na outra aba.` : 'Os passos de cada venda aparecem aqui no dia certo.'} />
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visiveis.map((item) => (
              <CartaoPasso key={item.id} item={item} mostrarResponsavel={ver === 'todos'}
                aberto={aberto === item.id} ocupado={ocupado === item.id}
                alternar={() => setAberto((a) => (a === item.id ? null : item.id))}
                registrar={(corpo, aviso) => registrar(item, corpo, aviso)} />
            ))}
          </ul>
        )}
        {cortado && <p className="mt-3 text-center text-[12px] text-ink-3">Mostrando os 400 primeiros passos.</p>}
      </div>
    </div>
  )
}

function CartaoPasso({ item, mostrarResponsavel, aberto, ocupado, alternar, registrar }: {
  item: ItemPosVenda
  mostrarResponsavel: boolean
  aberto: boolean
  ocupado: boolean
  alternar: () => void
  registrar: (corpo: Record<string, unknown>, aviso: string) => Promise<boolean>
}) {
  const [modo, setModo] = useState<'menu' | 'reagendar' | 'pular' | 'nota'>('menu')
  const [data, setData] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const wa = linkWhatsApp(item.telefone, item.mensagem)
  const tel = (item.telefone ?? '').replace(/\D/g, '')
  const pesquisa = item.tipo === 'pesquisa'

  const abrirPainel = (m: typeof modo) => { setModo(m); if (!aberto) alternar() }

  return (
    <li className="rounded-card border border-line bg-card px-3.5 py-3">
      {/* 1. cliente · dias desde a venda */}
      <div className="flex items-baseline justify-between gap-2">
        <Link href={item.negocioId ? `/leads?lead=${item.negocioId}` : '#'} className="min-w-0 truncate text-[15px] font-semibold text-ink">
          {item.cliente}
        </Link>
        {item.diasDaVenda != null && (
          <span className="num shrink-0 text-[12px] text-ink-3">{item.diasDaVenda === 0 ? 'comprou hoje' : `comprou há ${textoDias(item.diasDaVenda)}`}</span>
        )}
      </div>
      {/* 2. o que comprou */}
      <div className="truncate text-[13px] text-ink-2">{item.produto ?? 'Compra sem produto informado'}</div>
      {/* 3. o passo */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
        <Badge tone={item.grupo === 'atrasados' ? 'bad' : item.grupo === 'hoje' ? 'acc' : 'neutro'}>{item.passo}</Badge>
        {item.grupo === 'atrasados' && <span className="text-bad">atrasado {textoDias(item.atraso)}</span>}
        {item.grupo === 'proximos' && <span className="num text-ink-3">{item.previsto.slice(8, 10)}/{item.previsto.slice(5, 7)}</span>}
        {item.tentativas > 0 && <span className="text-ink-3">{item.tentativas === 1 ? '1 tentativa' : `${item.tentativas} tentativas`} sem resposta</span>}
        {mostrarResponsavel && item.responsavel && <span className="truncate text-ink-3">{item.responsavel}</span>}
      </div>
      {/* 4. ações */}
      <div className="mt-2.5 flex items-center gap-2">
        {item.tipo === 'ligacao' ? (
          <a href={tel ? `tel:${tel}` : undefined} className={cn('flex-1', !tel && 'pointer-events-none opacity-50')}>
            <Button variant="outline" size="sm" className="w-full" icon={<Phone size={14} strokeWidth={1.8} />}>Ligar</Button>
          </a>
        ) : (
          <a href={wa ?? undefined} target="_blank" rel="noopener noreferrer" className={cn('flex-1', !wa && 'pointer-events-none opacity-50')}>
            <Button variant="outline" size="sm" className="w-full" icon={<MessageCircle size={14} strokeWidth={1.8} />}>WhatsApp</Button>
          </a>
        )}
        <Button size="sm" className="flex-1" loading={ocupado && !aberto} icon={<Check size={14} strokeWidth={2} />}
          onClick={() => (pesquisa ? abrirPainel('nota') : registrar({ acao: 'feito' }, 'Passo registrado'))}>
          {pesquisa ? 'Registrar nota' : 'Feito'}
        </Button>
        <button type="button" aria-label="Mais ações" onClick={() => { setModo('menu'); alternar() }}
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-control border border-line text-ink-2', aberto && 'bg-bg')}>
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>
      </div>

      {aberto && (
        <div className="mt-2.5 border-t border-line-soft pt-2.5">
          {modo === 'menu' && (
            <div className="flex flex-col gap-2">
              {item.mensagem && (
                <div className="rounded-control border border-line-soft bg-bg p-2.5 text-[12.5px] text-ink-2">
                  <div className="whitespace-pre-line">{item.mensagem}</div>
                  <button type="button" className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-ink"
                    onClick={() => { navigator.clipboard?.writeText(item.mensagem).then(() => notify.ok('Mensagem copiada'), () => {}) }}>
                    <Copy size={12} strokeWidth={1.8} /> Copiar mensagem
                  </button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" loading={ocupado} onClick={() => registrar({ acao: 'sem_resposta' }, item.tentativas >= 2 ? 'Encerrado sem resposta' : 'Nova tentativa no próximo dia aberto')}>Sem resposta</Button>
                <Button variant="outline" size="sm" onClick={() => setModo('reagendar')}>Reagendar</Button>
                <Button variant="outline" size="sm" onClick={() => setModo('pular')}>Pular</Button>
              </div>
              {item.tipo === 'ligacao' && wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                  <MessageCircle size={13} strokeWidth={1.8} /> Abrir o WhatsApp em vez de ligar
                </a>
              )}
              {item.negocioId && (
                <Link href={`/leads?lead=${item.negocioId}`} className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                  <ExternalLink size={13} strokeWidth={1.8} /> Abrir o cliente
                </Link>
              )}
              <p className="text-[11px] text-ink-3">O WhatsApp abre fora do Nexus: a conversa não fica registrada aqui.</p>
            </div>
          )}
          {modo === 'reagendar' && (
            <div className="flex items-end gap-2">
              <Input type="date" label="Nova data" value={data} onChange={(e) => setData(e.target.value)} wrapperClassName="flex-1" />
              <Button size="sm" loading={ocupado} disabled={!data} onClick={() => registrar({ acao: 'reagendar', data }, 'Reagendado')}>Salvar</Button>
            </div>
          )}
          {modo === 'pular' && (
            <div className="flex items-end gap-2">
              <Input label="Por que não fazer este passo?" value={motivo} onChange={(e) => setMotivo(e.target.value)} wrapperClassName="flex-1" />
              <Button size="sm" loading={ocupado} disabled={motivo.trim().length < 3} onClick={() => registrar({ acao: 'pular', resultado: motivo }, 'Passo pulado')}>Pular</Button>
            </div>
          )}
          {modo === 'nota' && (
            <div className="flex flex-col gap-2">
              <div className="text-[12px] text-ink-2">Nota de 0 a 10</div>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, n) => (
                  <button key={n} type="button" onClick={() => setNota(n)}
                    className={cn('num h-8 rounded-[6px] border text-[12px] font-medium',
                      nota === n ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink')}>{n}</button>
                ))}
              </div>
              <Input placeholder="Comentário do cliente (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
              <Button size="sm" loading={ocupado} disabled={nota == null} onClick={() => registrar({ acao: 'nota', nota, comentario }, 'Nota registrada')}>Salvar nota</Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
