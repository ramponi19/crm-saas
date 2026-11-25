'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageCircle, Phone, Check, MoreHorizontal, CheckCircle2, Copy, ExternalLink, FileText } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Badge, EmptyState, Tabs, notify } from '@/components/ui'
import { textoDias, type ContatoDoPasso, type GrupoFila, type ItemPosVenda } from '@/lib/posvenda/fila'
import { formatarData } from '@/lib/datas'
import { useFuso } from '@/components/fuso-provider'
import { cn } from '@/lib/utils'
import { linkWhatsApp } from '@/lib/whatsapp-link'
import { depoisDaNota, type DepoisDaNota } from '@/lib/posvenda/config'

interface Props {
  itens: ItemPosVenda[]
  hoje: string
  podeVerTodos: boolean
  ver: 'meus' | 'todos'
  cortado: boolean
  desligado?: boolean
  /** Depois da nota (bloco 4): limite que abre chamado, link de avaliação por loja e os textos da empresa. */
  aposNota?: AposNota
  /** Aberta pelo painel do gestor: a fila de uma pessoa (dono/administrador). */
  pessoa?: { id: string; nome: string } | null
}
export interface AposNota { limite: number; linkEmpresa: string | null; linkPorLoja: Record<string, string>; textoPromotor: string | null; textoNeutro: string | null }

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
export function FilaPosVenda({ itens: iniciais, podeVerTodos, ver, cortado, desligado, aposNota, pessoa }: Props) {
  const router = useRouter()
  const [itens, setItens] = useState(iniciais)
  const [aberto, setAberto] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [seguimentos, setSeguimentos] = useState<Record<number, DepoisDaNota & { nota: number }>>({})

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
      setAberto(null)
      // Nota registrada: o cartão fica com a próxima mensagem sugerida (promotor ou neutro) até a pessoa concluir.
      const seg = corpo.acao === 'nota' && aposNota
        ? depoisDaNota(Number(corpo.nota), { limiteChamado: aposNota.limite, nome: item.cliente,
            link: (item.filialId != null ? aposNota.linkPorLoja[String(item.filialId)] : null) ?? aposNota.linkEmpresa,
            textoPromotor: aposNota.textoPromotor, textoNeutro: aposNota.textoNeutro })
        : null
      if (seg && seg.faixa !== 'detrator') setSeguimentos((m) => ({ ...m, [item.id]: { ...seg, nota: Number(corpo.nota) } }))
      else setItens((prev) => prev.filter((x) => x.id !== item.id))
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
        {/* O título já está na barra de cima. Fila | Chamados e, para quem pode ver todos, Meus | Todos. */}
        <div className="mb-3 flex gap-1 rounded-control border border-line bg-card p-0.5 text-[12.5px]">
          <span className="flex-1 rounded-[6px] bg-ink px-2.5 py-1.5 text-center font-medium text-white">Fila</span>
          <Link href="/pos-venda/chamados" className="flex-1 rounded-[6px] px-2.5 py-1.5 text-center font-medium text-ink-2">Chamados</Link>
          {podeVerTodos && <Link href="/pos-venda/painel" className="flex-1 rounded-[6px] px-2.5 py-1.5 text-center font-medium text-ink-2">Painel</Link>}
        </div>
        {pessoa ? (
          <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px]">
            <span className="min-w-0 truncate text-ink-2">Fila de <strong className="text-ink">{pessoa.nome}</strong></span>
            <Link href="/pos-venda/painel" className="shrink-0 font-medium text-ink-2 underline">Voltar ao painel</Link>
          </div>
        ) : podeVerTodos && (
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
              <CartaoPasso key={item.id} item={item} mostrarResponsavel={ver === 'todos' && !pessoa}
                aberto={aberto === item.id} ocupado={ocupado === item.id}
                alternar={() => setAberto((a) => (a === item.id ? null : item.id))}
                registrar={(corpo, aviso) => registrar(item, corpo, aviso)}
                seguimento={seguimentos[item.id] ?? null}
                concluir={() => { setItens((prev) => prev.filter((x) => x.id !== item.id)); setSeguimentos((m) => { const c = { ...m }; delete c[item.id]; return c }) }} />
            ))}
          </ul>
        )}
        {cortado && <p className="mt-3 text-center text-[12px] text-ink-3">Mostrando os 400 primeiros passos.</p>}
      </div>
    </div>
  )
}

function CartaoPasso({ item, mostrarResponsavel, aberto, ocupado, alternar, registrar, seguimento, concluir }: {
  item: ItemPosVenda
  mostrarResponsavel: boolean
  aberto: boolean
  ocupado: boolean
  alternar: () => void
  registrar: (corpo: Record<string, unknown>, aviso: string) => Promise<boolean>
  seguimento: (DepoisDaNota & { nota: number }) | null
  concluir: () => void
}) {
  const [modo, setModo] = useState<'menu' | 'reagendar' | 'pular' | 'nota'>('menu')
  const [data, setData] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const tel = (item.telefone ?? '').replace(/\D/g, '')
  const pesquisa = item.tipo === 'pesquisa'
  const fuso = useFuso()
  // Por onde a pessoa falou com o cliente (vai no resultado do "Feito": app da loja, ligação, Nexus ou modelo).
  const [meio, setMeio] = useState<string | null>(null)
  // Janela fechada sem modelo (ou sem conversa): copiar, abrir no WhatsApp da loja (coexistência) e ligar, à vista.
  const semJanela = item.tipo !== 'ligacao' && ['app_loja', 'ligar', 'sem_numero'].includes(item.contato.modo)
  const copiar = () => { setMeio('app da loja'); navigator.clipboard?.writeText(item.mensagem).then(() => notify.ok('Mensagem copiada'), () => {}) }

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
      {item.tipo !== 'ligacao' && item.contato.aviso && (
        <div className={cn('mt-1 text-[11.5px]', item.contato.modo === 'modelo' ? 'text-warn' : 'text-ink-3')}>{item.contato.aviso}</div>
      )}
      {seguimento && <Seguimento item={item} seguimento={seguimento} concluir={concluir} />}
      {/* eco da coexistência: saiu mensagem pelo app da loja desde o dia do passo → sugere (não marca sozinho) */}
      {item.ecoApp && !seguimento && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-control border border-line-soft bg-bg px-2.5 py-2" data-eco-app>
          <span className="min-w-0 text-[12px] text-ink-2">
            Saiu pelo app da loja {formatarData(item.ecoApp.em, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, '', fuso)}
            {item.ecoApp.texto ? <>: <span className="text-ink">“{item.ecoApp.texto}”</span></> : null}
          </span>
          <Button size="sm" variant="outline" className="shrink-0" loading={ocupado && !aberto}
            onClick={() => (pesquisa ? (setMeio('app da loja'), abrirPainel('nota')) : registrar({ acao: 'feito', resultado: 'app da loja' }, 'Passo registrado'))}>
            {pesquisa ? 'Registrar nota' : 'Marcar feito'}
          </Button>
        </div>
      )}
      {/* 4. ações */}
      {semJanela && !seguimento && (
        <div className="mt-2.5 grid grid-cols-3 gap-2" data-sem-janela>
          <Button variant="outline" size="sm" disabled={!item.mensagem} icon={<Copy size={14} strokeWidth={1.8} />} onClick={copiar}>Copiar</Button>
          {item.contato.modo === 'app_loja' && item.contato.href ? (
            <a href={item.contato.href} target="_blank" rel="noopener noreferrer" onClick={() => setMeio('app da loja')} data-contato="app_loja">
              <Button variant="outline" size="sm" className="w-full" icon={<MessageCircle size={14} strokeWidth={1.8} />}>WhatsApp da loja</Button>
            </a>
          ) : <span />}
          <a href={tel ? `tel:${tel}` : undefined} onClick={() => setMeio('ligação')} className={cn(!tel && 'pointer-events-none opacity-50')}>
            <Button variant="outline" size="sm" className="w-full" icon={<Phone size={14} strokeWidth={1.8} />}>Ligar</Button>
          </a>
        </div>
      )}
      <div className={cn('mt-2.5 flex items-center gap-2', seguimento && 'hidden')}>
        {item.tipo === 'ligacao' ? (
          <a href={tel ? `tel:${tel}` : undefined} onClick={() => setMeio('ligação')} className={cn('flex-1', !tel && 'pointer-events-none opacity-50')}>
            <Button variant="outline" size="sm" className="w-full" icon={<Phone size={14} strokeWidth={1.8} />}>Ligar</Button>
          </a>
        ) : !semJanela ? (
          <BotaoContato contato={item.contato} aoUsar={() => setMeio(item.contato.modo === 'modelo' ? 'modelo' : 'Nexus')} />
        ) : null}
        <Button size="sm" className="flex-1" loading={ocupado && !aberto} icon={<Check size={14} strokeWidth={2} />}
          onClick={() => (pesquisa ? abrirPainel('nota') : registrar({ acao: 'feito', ...(meio ? { resultado: meio } : {}) }, 'Passo registrado'))}>
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
              {item.tipo === 'ligacao' && item.contato.href && (
                <a href={item.contato.href} {...(item.contato.modo === 'app_loja' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setMeio(item.contato.modo === 'app_loja' ? 'app da loja' : item.contato.modo === 'modelo' ? 'modelo' : 'Nexus')}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                  <MessageCircle size={13} strokeWidth={1.8} /> {item.contato.modo === 'modelo' ? 'Enviar modelo no WhatsApp' : item.contato.modo === 'app_loja' ? 'Abrir no WhatsApp da loja' : 'Abrir o WhatsApp em vez de ligar'}
                  {item.contato.aviso && <span className="font-normal text-ink-3">· {item.contato.aviso}</span>}
                </a>
              )}
              {item.negocioId && (
                <Link href={`/leads?lead=${item.negocioId}`} className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                  <ExternalLink size={13} strokeWidth={1.8} /> Abrir o cliente
                </Link>
              )}
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
              <Button size="sm" loading={ocupado} disabled={nota == null} onClick={() => registrar({ acao: 'nota', nota, comentario, ...(meio ? { canal: meio } : {}) }, 'Nota registrada')}>Salvar nota</Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * O botão principal do passo com a janela aberta (decidirContato): a conversa no Nexus com a mensagem no campo; "Enviar
 * modelo" quando a janela está fechada e o passo tem modelo. Sem modelo, o cartão mostra copiar / app da loja / ligar.
 */
function BotaoContato({ contato, aoUsar }: { contato: ContatoDoPasso; aoUsar: () => void }) {
  if (!contato.href) {
    return <Button variant="outline" size="sm" className="flex-1" disabled icon={<MessageCircle size={14} strokeWidth={1.8} />}>WhatsApp</Button>
  }
  return (
    <Link href={contato.href} className="flex-1" data-contato={contato.modo} onClick={aoUsar}>
      <Button variant="outline" size="sm" className="w-full"
        icon={contato.modo === 'modelo' ? <FileText size={14} strokeWidth={1.8} /> : <MessageCircle size={14} strokeWidth={1.8} />}>
        {contato.modo === 'modelo' ? 'Enviar modelo' : 'WhatsApp'}
      </Button>
    </Link>
  )
}

/**
 * DEPOIS DA NOTA (bloco 4): promotor (9–10) recebe o pedido de avaliação no Google com o link da loja; neutro (7–8), a
 * pergunta do que poderia ter sido melhor. O cliente acabou de responder: vai como mensagem normal pela conversa da
 * loja no Nexus (sem conversa: wa.me). Quem envia é a pessoa.
 */
function Seguimento({ item, seguimento, concluir }: { item: ItemPosVenda; seguimento: DepoisDaNota & { nota: number }; concluir: () => void }) {
  const t = seguimento.texto
  const href = t ? (item.contato.conversaId ? `/comunicacao?c=${item.contato.conversaId}&texto=${encodeURIComponent(t)}` : linkWhatsApp(item.telefone, t)) : null
  const externo = !item.contato.conversaId
  return (
    <div className="mt-2.5 rounded-control border border-line-soft bg-bg p-2.5" data-seguimento={seguimento.faixa}>
      <div className="mb-1 text-[12px] font-medium text-ink">
        Nota {seguimento.nota} · {seguimento.faixa === 'promotor' ? 'promotor' : 'neutro'}
      </div>
      {t ? <div className="mb-2 whitespace-pre-line text-[12.5px] text-ink-2">{t}</div>
         : seguimento.aviso && <div className="mb-2 text-[12px] text-warn">{seguimento.aviso}</div>}
      <div className="flex gap-2">
        {href && (
          externo
            ? <a href={href} target="_blank" rel="noopener noreferrer" className="flex-1"><Button size="sm" variant="outline" className="w-full" icon={<ExternalLink size={14} strokeWidth={1.8} />}>Enviar</Button></a>
            : <Link href={href} className="flex-1"><Button size="sm" variant="outline" className="w-full" icon={<MessageCircle size={14} strokeWidth={1.8} />}>Enviar pelo WhatsApp</Button></Link>
        )}
        <Button size="sm" className="flex-1" onClick={concluir}>Concluir</Button>
      </div>
    </div>
  )
}
