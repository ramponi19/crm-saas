'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, Badge, Button, notify } from '@/components/ui'
import { GRAVIDADES, gravidadeDoAtraso, prioridadeDoFollowUp, type Gravidade } from '@/lib/lead-parado'
import { formatCurrency } from '@/lib/utils'
import {
  TriangleAlert, Send, RefreshCw, TrendingDown, ChevronDown, ChevronUp,
  Copy, MessageCircle, ExternalLink, Repeat,
} from 'lucide-react'

/**
 * Gestão de Leads — a tela do CRM que o dono da imobiliária usa, reproduzida com
 * autorização dele: mesmo título, mesmo subtítulo, botão Atualizar, abas
 * "Leads Perdidos" e "Follow-up Automático", os CINCO cards (Total, Crítico, Alto,
 * Moderado, Atenção) e os cartões de follow-up que abrem mostrando "N sugestões".
 *
 * A primeira versão desta tela traduziu os nomes dele ("Leads parados",
 * "Reativação automática") e escondeu o card "Atenção" porque ele nunca somava.
 * Traduzir o vocabulário de quem vai usar é atrito de graça, e esconder card é
 * entregar menos: o certo era baixar a porta da lista para a faixa existir.
 *
 * O que é NOSSO, e acrescenta sem tirar nada:
 *  - o texto da sugestão vem dos modelos da LOJA, não fixo no código;
 *  - o cartão lista TODAS as sugestões cadastradas (daí "N sugestões" variar);
 *  - as faixas também FILTRAM a lista, em vez de só contar;
 *  - a tira de automação diz se a reativação está ligada e deixa rodar na hora.
 */

export interface LeadAtrasado {
  id: number
  nome: string
  telefone: string | null
  etapa: string
  responsavel: string
  regiao: string | null
  valor: number
  dias: number
}

export interface EstadoReativacao {
  ativo: boolean
  diasFrio: number
  incluirPerdidos: boolean
  cadenciaNome: string | null
  inscritosAtivos: number
}

const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')
/** Mesmo tratamento da Fila do dia: número curto ganha o 55 do Brasil. */
function waLink(tel: string | null, msg: string) {
  let d = soDigitos(tel)
  if (d && d.length <= 11 && !d.startsWith('55')) d = '55' + d
  return `https://wa.me/${d}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
}

/**
 * Paleta das faixas: vermelho → laranja → âmbar → azul, como no original.
 *
 * Alfa EXPLÍCITO, e não o modificador `/50` sobre `bg-warn-soft`: os tokens `-soft`
 * já são `rgba(...)`, e aplicar opacidade em cima fez o Tailwind descartar o alfa e
 * pintar o marrom cheio — o card "Moderado" saía mais escuro que o "Alto" e a escada
 * de gravidade lia ao contrário.
 */
const TOM_FAIXA: Record<Gravidade | 'total', { caixa: string; numero: string }> = {
  total:    { caixa: 'border-ink bg-card',                     numero: 'text-ink' },
  critico:  { caixa: 'border-bad/25 bg-[rgba(217,45,32,.10)]', numero: 'text-bad' },
  alto:     { caixa: 'border-warn/30 bg-[rgba(180,83,9,.12)]', numero: 'text-warn' },
  moderado: { caixa: 'border-warn/15 bg-[rgba(180,83,9,.05)]', numero: 'text-warn' },
  atencao:  { caixa: 'border-accent/25 bg-accent-soft',        numero: 'text-accent' },
}

export function GestaoLeadsView({ leads, templates, reativacao, podeExecutar, limiteDias, soMeus }: {
  leads: LeadAtrasado[]
  templates: Record<string, string>
  reativacao: EstadoReativacao
  podeExecutar: boolean
  limiteDias: number
  soMeus: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'perdidos' | 'followup'>('perdidos')
  const [faixa, setFaixa] = useState<Gravidade | 'todos'>('todos')
  const [aberto, setAberto] = useState<number | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState<string | null>(null)

  const sugestoes = useMemo(
    () => Object.entries(templates).map(([nome, texto]) => ({ nome, texto })),
    [templates],
  )

  const contagem = useMemo(() => {
    const c: Record<Gravidade, number> = { critico: 0, alto: 0, moderado: 0, atencao: 0 }
    for (const l of leads) c[gravidadeDoAtraso(l.dias).id] += 1
    return c
  }, [leads])

  const visiveis = useMemo(
    () => (faixa === 'todos' ? leads : leads.filter((l) => gravidadeDoAtraso(l.dias).id === faixa)),
    [leads, faixa],
  )

  /** Texto da loja com o primeiro nome do lead — mesma variável da Fila do dia. */
  const comNome = (texto: string, nome: string) =>
    texto.replace(/\{\{nome\}\}/g, nome.trim().split(/\s+/)[0] || nome)

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      notify.ok('Mensagem copiada')
    } catch {
      notify.bad('O navegador não deixou copiar')
    }
  }

  function atualizar() {
    setAtualizando(true)
    router.refresh()
    // O refresh não avisa quando termina; 800ms é só o giro do ícone parar.
    setTimeout(() => setAtualizando(false), 800)
  }

  async function rodarReativacao() {
    setRodando(true)
    const r = await fetch('/api/reativacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executar: true }),
    })
    const j = await r.json().catch(() => ({}))
    setRodando(false)
    if (!r.ok) { notify.bad('Não foi possível rodar', j?.error); return }
    const n = Number(j?.reativados) || 0
    setUltimoResultado(n > 0 ? `${n} ${n === 1 ? 'lead entrou' : 'leads entraram'} na cadência agora` : 'nenhum lead novo para reativar')
    notify.ok('Reativação executada', n > 0 ? `${n} inscrito(s)` : 'Nada a reativar')
    /**
     * Recarrega os números do servidor: sem isto o contador continuava dizendo 0
     * depois de inscrever o lead — sucesso e número se contradizendo na mesma tela.
     */
    if (n > 0) router.refresh()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Gestão de Leads" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 scrollbar-thin">
        <div className="mx-auto w-full max-w-[1100px]">

          <div className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div>
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Gestão de Leads</h1>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Detecção de leads perdidos e automação de follow-up
                {soMeus && ' · seus leads'}
              </p>
            </div>
            <Button
              variant="outline"
              icon={<RefreshCw size={14} strokeWidth={1.8} className={atualizando ? 'animate-spin' : ''} />}
              onClick={atualizar}
            >
              Atualizar
            </Button>
          </div>

          {/* Abas sublinhadas, como no original. */}
          <div className="mb-4 flex gap-6 border-b border-line">
            {([
              ['perdidos', 'Leads Perdidos', TriangleAlert],
              ['followup', 'Follow-up Automático', Send],
            ] as const).map(([id, label, Icone]) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2.5 text-[13px] font-semibold transition-colors ${
                  aba === id ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink-2'
                }`}
              >
                <Icone size={14} strokeWidth={1.8} />{label}
              </button>
            ))}
          </div>

          {aba === 'perdidos' ? (
            <>
              {/* Total + as quatro faixas. Clicar filtra: no original os cards só
                  contam, e contar sem poder ver quem é rende pouco. */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Faixa
                  ativa={faixa === 'todos'}
                  onClick={() => setFaixa('todos')}
                  label="Total"
                  valor={leads.length}
                  tom={TOM_FAIXA.total}
                />
                {GRAVIDADES.map((g) => (
                  <Faixa
                    key={g.id}
                    ativa={faixa === g.id}
                    onClick={() => setFaixa(faixa === g.id ? 'todos' : g.id)}
                    label={g.label}
                    valor={contagem[g.id]}
                    tom={TOM_FAIXA[g.id]}
                  />
                ))}
              </div>

              <Card flush>
                {visiveis.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-14 text-center">
                    <TrendingDown size={26} strokeWidth={1.6} className="text-ink-3" />
                    <p className="mt-3 text-[15px] font-semibold text-ink">
                      {leads.length === 0 ? 'Nenhum lead perdido encontrado' : 'Nenhum lead nesta faixa'}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {leads.length === 0
                        ? 'Seus leads estão sendo bem atendidos!'
                        : 'Toque em outra faixa para ver os demais.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-line-soft">
                    {visiveis.map((l) => {
                      const g = gravidadeDoAtraso(l.dias)
                      const primeira = sugestoes[0]
                      return (
                        <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{l.nome}</span>
                              <Badge tone={g.tone}>{g.label}</Badge>
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                              {l.dias} {l.dias === 1 ? 'dia' : 'dias'} sem contato
                              {' · '}Etapa: {l.etapa}
                              {l.regiao && <> · Região: {l.regiao}</>}
                              {' · '}Corretor: {l.responsavel}
                              {l.valor > 0 && <> · <span className="num">{formatCurrency(l.valor)}</span></>}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {primeira && (
                              <>
                                <Button size="sm" variant="ghost" icon={<Copy size={13} strokeWidth={1.8} />} onClick={() => copiar(comNome(primeira.texto, l.nome))}>
                                  Copiar
                                </Button>
                                <a
                                  href={waLink(l.telefone, comNome(primeira.texto, l.nome))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1 rounded-control border border-line px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                                    l.telefone ? 'text-ink-2 hover:text-ink' : 'pointer-events-none opacity-40'
                                  }`}
                                >
                                  <MessageCircle size={13} strokeWidth={1.8} />WhatsApp
                                </a>
                              </>
                            )}
                            <Link
                              href="/leads"
                              className="inline-flex items-center gap-1 rounded-control border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
                            >
                              <ExternalLink size={13} strokeWidth={1.8} />Abrir
                            </Link>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </>
          ) : (
            <div className="space-y-3">
              {/* Tira da automação: o original não tem, e é o que responde "isso
                  acontece sozinho ou eu preciso lembrar?". */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3">
                <span className="flex items-start gap-2">
                  <Repeat size={15} strokeWidth={1.8} className={`mt-0.5 ${reativacao.ativo ? 'text-ok' : 'text-ink-3'}`} />
                  <span className="text-[12.5px] leading-snug text-ink-2">
                    {reativacao.ativo ? (
                      <>
                        Reativação <strong className="text-ok">ligada</strong>: lead sem tratativa há{' '}
                        <strong className="num">{reativacao.diasFrio}</strong> dias entra
                        {reativacao.cadenciaNome ? <> na cadência <strong>{reativacao.cadenciaNome}</strong></> : ' na cadência configurada'}
                        {reativacao.incluirPerdidos ? ', perdidos incluídos.' : '.'}
                        {' '}<span className="num">{reativacao.inscritosAtivos}</span> em cadência ativa.
                      </>
                    ) : (
                      <>
                        Reativação <strong>desligada</strong> — lead que esfria só volta se alguém lembrar.
                        Ligar leva um minuto em Cadências.
                      </>
                    )}
                    {ultimoResultado && <span className="ml-1 text-ink-3">· {ultimoResultado}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Link href="/admin/cadencias" className="text-[12.5px] font-semibold text-accent hover:underline">
                    {reativacao.ativo ? 'Ajustar' : 'Configurar'} →
                  </Link>
                  {podeExecutar && reativacao.ativo && (
                    <Button size="sm" variant="outline" loading={rodando} icon={<RefreshCw size={13} strokeWidth={1.8} />} onClick={rodarReativacao}>
                      Rodar agora
                    </Button>
                  )}
                </span>
              </div>

              {leads.length === 0 ? (
                <Card>
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <Send size={24} strokeWidth={1.6} className="text-ink-3" />
                    <p className="mt-3 text-[15px] font-semibold text-ink">Nenhum follow-up sugerido</p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      Ninguém sem contato há mais de {limiteDias} dias. Nada a cobrar hoje.
                    </p>
                  </div>
                </Card>
              ) : (
                leads.map((l) => {
                  const p = prioridadeDoFollowUp(l.dias)
                  const expandido = aberto === l.id
                  return (
                    <div key={l.id} className="overflow-hidden rounded-card border border-line bg-card">
                      <button
                        onClick={() => setAberto(expandido ? null : l.id)}
                        aria-expanded={expandido}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bg"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-ink">{l.nome}</span>
                            <Badge tone={p.tone}>{p.label}</Badge>
                          </span>
                          <span className="mt-1 block truncate text-[12px] text-ink-2">
                            {l.dias} {l.dias === 1 ? 'dia' : 'dias'} sem contato
                            <span className="mx-2 text-ink-3">·</span>Etapa: {l.etapa}
                            {l.regiao && <><span className="mx-2 text-ink-3">·</span>Região: {l.regiao}</>}
                            <span className="mx-2 text-ink-3">·</span>Corretor: {l.responsavel}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-3">
                          {sugestoes.length} {sugestoes.length === 1 ? 'sugestão' : 'sugestões'}
                          {expandido ? <ChevronUp size={15} strokeWidth={1.8} /> : <ChevronDown size={15} strokeWidth={1.8} />}
                        </span>
                      </button>

                      {expandido && (
                        <div className="border-t border-line-soft bg-bg px-4 py-3">
                          {sugestoes.length === 0 ? (
                            <p className="text-[12.5px] text-ink-2">
                              Nenhum texto cadastrado ainda. Escreva os seus em{' '}
                              <Link href="/admin/configuracoes?aba=modelos" className="font-semibold text-accent hover:underline">Configurações → Modelos</Link>
                              {' '}— o sistema não escreve a mensagem no seu lugar.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {sugestoes.map((s) => {
                                const texto = comNome(s.texto, l.nome)
                                return (
                                  <div key={s.nome} className="rounded-control border border-line bg-card p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <span className="flex items-center gap-2">
                                        <Badge tone="ok">WhatsApp</Badge>
                                        <span className="text-[11.5px] text-ink-3">{s.nome}</span>
                                      </span>
                                      <Button size="sm" variant="ghost" icon={<Copy size={13} strokeWidth={1.8} />} onClick={() => copiar(texto)}>
                                        Copiar
                                      </Button>
                                    </div>
                                    <p className="mt-2 text-[13px] leading-snug text-ink">{texto}</p>
                                    <a
                                      href={waLink(l.telefone, texto)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`mt-2.5 inline-flex items-center gap-1.5 rounded-control bg-ok px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity ${
                                        l.telefone ? 'hover:opacity-90' : 'pointer-events-none opacity-40'
                                      }`}
                                    >
                                      <Send size={13} strokeWidth={1.9} />Enviar via WhatsApp
                                    </a>
                                    {!l.telefone && (
                                      <span className="ml-2 text-[11.5px] text-ink-3">sem telefone cadastrado</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Faixa({ label, valor, tom, ativa, onClick }: {
  label: string; valor: number; tom: { caixa: string; numero: string }; ativa: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativa}
      className={`rounded-card border py-3 text-center transition-shadow ${tom.caixa} ${ativa ? 'ring-2 ring-ink/15' : ''}`}
    >
      <div className={`num text-[20px] font-bold tracking-[-0.02em] ${tom.numero}`}>{valor}</div>
      <div className="text-[11.5px] font-medium text-ink-2">{label}</div>
    </button>
  )
}
