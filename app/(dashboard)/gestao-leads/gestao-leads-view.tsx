'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, Badge, Button, EmptyState, Select, notify } from '@/components/ui'
import { GRAVIDADES, gravidadeDoAtraso, type Gravidade } from '@/lib/lead-parado'
import { formatCurrency } from '@/lib/utils'
import { CircleAlert, MessageCircle, Copy, RefreshCw, Repeat, ExternalLink } from 'lucide-react'

/**
 * Gestão de Leads — quem parou, e o que a automação está fazendo.
 *
 * Duas abas porque são duas perguntas: "quem eu preciso cobrar hoje" (parados) e
 * "o sistema está reciclando o que esfriou?" (reativação). A segunda é só leitura
 * mais o botão de rodar agora: a configuração vive em Administração → Cadências, e
 * ter dois lugares para configurar a mesma coisa é como se cria divergência.
 */

export interface LeadAtrasado {
  id: number
  nome: string
  telefone: string | null
  etapa: string
  responsavel: string
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

export function GestaoLeadsView({ leads, templates, reativacao, podeExecutar, limiteDias, soMeus }: {
  leads: LeadAtrasado[]
  templates: Record<string, string>
  reativacao: EstadoReativacao
  podeExecutar: boolean
  limiteDias: number
  soMeus: boolean
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'parados' | 'reativacao'>('parados')
  const [faixa, setFaixa] = useState<Gravidade | 'todos'>('todos')
  const chavesTemplate = Object.keys(templates)
  const [chaveMsg, setChaveMsg] = useState(chavesTemplate[0] ?? '')
  const [rodando, setRodando] = useState(false)
  const [ultimoResultado, setUltimoResultado] = useState<string | null>(null)

  /**
   * Só as faixas que PODEM acontecer nesta tela.
   *
   * A lista começa em `limiteDias`, então "Atenção" (abaixo disso) seria um card
   * estruturalmente zerado para sempre — e card sempre zero faz duvidar dos outros
   * três. Derivado do limite, não escrito à mão: mudar o limite ajusta sozinho.
   */
  const faixasVisiveis = useMemo(() => {
    const cabem = GRAVIDADES.filter((g) => g.desde >= limiteDias)
    return cabem.map((g, i) => {
      const acima = cabem[i - 1]
      return { ...g, intervalo: acima ? `${g.desde} a ${acima.desde - 1} dias` : `${g.desde}+ dias` }
    })
  }, [limiteDias])

  const contagem = useMemo(() => {
    const c: Record<Gravidade, number> = { critico: 0, alto: 0, moderado: 0, atencao: 0 }
    for (const l of leads) c[gravidadeDoAtraso(l.dias).id] += 1
    return c
  }, [leads])

  const visiveis = useMemo(
    () => (faixa === 'todos' ? leads : leads.filter((l) => gravidadeDoAtraso(l.dias).id === faixa)),
    [leads, faixa],
  )

  /** Texto da loja com o nome do lead — a mesma variável que a Fila do dia usa. */
  const mensagemPara = (nome: string) =>
    (templates[chaveMsg] ?? '').replace(/\{\{nome\}\}/g, nome.split(' ')[0] || nome)

  async function copiar(nome: string) {
    const msg = mensagemPara(nome)
    if (!msg) { notify.warn('Nenhum texto escolhido', 'Cadastre modelos em Administração → Modelos.'); return }
    try {
      await navigator.clipboard.writeText(msg)
      notify.ok('Mensagem copiada')
    } catch {
      notify.bad('O navegador não deixou copiar')
    }
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
    setUltimoResultado(n > 0 ? `${n} ${n === 1 ? 'lead entrou' : 'leads entraram'} na cadência agora` : 'Nenhum lead novo para reativar')
    notify.ok('Reativação executada', n > 0 ? `${n} inscrito(s)` : 'Nada a reativar')
    /**
     * Recarrega os números do servidor.
     *
     * Sem isto, rodar a reativação inscrevia o lead e o card "Na fila da automação"
     * continuava dizendo 0 — o dono clica, vê a mensagem de sucesso e o contador
     * contradizendo, e passa a não acreditar em nenhum dos dois.
     */
    if (n > 0) router.refresh()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Gestão de Leads" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 scrollbar-thin">
        <div className="mx-auto w-full max-w-[1100px]">

          <div className="py-4">
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Gestão de Leads</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Quem parou de andar e o que a automação está reciclando
              {soMeus && ' · mostrando apenas os seus leads'}
            </p>
          </div>

          <div className="mb-4 flex gap-1 rounded-control border border-line bg-card p-1">
            {([['parados', 'Leads parados'], ['reativacao', 'Reativação automática']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                className={`rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  aba === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-bg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {aba === 'parados' ? (
            <>
              {/* Faixas como FILTRO, não só placar: o número sem o "me mostre quais"
                  obriga o gestor a procurar na lista o que ele acabou de contar. */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Faixa
                  ativa={faixa === 'todos'}
                  onClick={() => setFaixa('todos')}
                  label="Total"
                  valor={leads.length}
                  tone="neutro"
                />
                {faixasVisiveis.map((g) => (
                  <Faixa
                    key={g.id}
                    ativa={faixa === g.id}
                    onClick={() => setFaixa(faixa === g.id ? 'todos' : g.id)}
                    label={g.label}
                    valor={contagem[g.id]}
                    tone={g.tone}
                    rodape={g.intervalo}
                  />
                ))}
              </div>

              {chavesTemplate.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-ink-2">Mensagem:</span>
                  <Select
                    aria-label="Modelo de mensagem"
                    value={chaveMsg}
                    onChange={(e) => setChaveMsg(e.target.value)}
                    className="min-w-[200px]"
                  >
                    {chavesTemplate.map((k) => <option key={k} value={k}>{k}</option>)}
                  </Select>
                  <Link href="/admin/modelos" className="text-[12px] font-semibold text-accent hover:underline">
                    Editar modelos →
                  </Link>
                </div>
              )}

              <Card flush>
                {visiveis.length === 0 ? (
                  <EmptyState
                    icon={<CircleAlert size={20} strokeWidth={1.7} />}
                    title={leads.length === 0 ? 'Nenhum lead parado' : 'Nenhum lead nesta faixa'}
                    description={
                      leads.length === 0
                        ? `Ninguém sem tratativa há mais de ${limiteDias} dias. Carteira em dia.`
                        : 'Troque a faixa acima para ver as outras.'
                    }
                  />
                ) : (
                  <div className="divide-y divide-line-soft">
                    {visiveis.map((l) => {
                      const g = gravidadeDoAtraso(l.dias)
                      const msg = mensagemPara(l.nome)
                      return (
                        <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{l.nome}</span>
                              <Badge tone={g.tone}>{g.label}</Badge>
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                              {l.etapa} · {l.responsavel}
                              {l.valor > 0 && <> · <span className="num">{formatCurrency(l.valor)}</span></>}
                            </span>
                          </span>
                          <span className="num shrink-0 text-right text-[12px] text-ink-2">
                            {l.dias} {l.dias === 1 ? 'dia' : 'dias'}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {chavesTemplate.length > 0 && (
                              <>
                                <Button size="sm" variant="ghost" icon={<Copy size={13} strokeWidth={1.8} />} onClick={() => copiar(l.nome)}>
                                  Copiar
                                </Button>
                                {/* Link wa.me, não envio pela API: abrir conversa é
                                    ação da pessoa, e não passa perto da política da Meta. */}
                                <a
                                  href={waLink(l.telefone, msg)}
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
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={<span className="inline-flex items-center gap-2"><Repeat size={15} strokeWidth={1.8} className="text-accent" />Reativação de leads frios</span>}>
                {reativacao.ativo ? (
                  <>
                    <p className="text-[13px] leading-snug text-ink-2">
                      Ligada. Lead sem tratativa há <strong className="num">{reativacao.diasFrio}</strong> dias entra
                      {reativacao.cadenciaNome ? <> na cadência <strong>{reativacao.cadenciaNome}</strong></> : ' na cadência configurada'}
                      {reativacao.incluirPerdidos ? ', e os perdidos também entram.' : '. Leads perdidos ficam de fora.'}
                    </p>
                    <p className="mt-2 text-[12px] text-ink-3">
                      A inscrição só AGENDA a tarefa — quem fala com o cliente é o corretor, pela Fila do dia.
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] leading-snug text-ink-2">
                    Desligada. Lead que esfria fica esfriado: ninguém volta a chamá-lo, a não ser que
                    alguém lembre. Ligar leva um minuto em Administração → Cadências.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href="/admin/cadencias" className="text-[12.5px] font-semibold text-accent hover:underline">
                    {reativacao.ativo ? 'Ajustar em Cadências →' : 'Configurar em Cadências →'}
                  </Link>
                  {podeExecutar && reativacao.ativo && (
                    <Button size="sm" variant="outline" loading={rodando} icon={<RefreshCw size={13} strokeWidth={1.8} />} onClick={rodarReativacao}>
                      Rodar agora
                    </Button>
                  )}
                </div>
                {ultimoResultado && <p className="mt-2 text-[12px] text-ink-2">{ultimoResultado}</p>}
              </Card>

              <Card title="Na fila da automação">
                <div className="num text-[26px] font-bold tracking-[-0.03em] text-ink">{reativacao.inscritosAtivos}</div>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  {reativacao.inscritosAtivos === 1 ? 'lead com cadência ativa' : 'leads com cadência ativa'}
                </p>
                <p className="mt-2 text-[12px] leading-snug text-ink-3">
                  Conta todas as cadências, não só a de reativação: é o total de gente que o sistema
                  vai lembrar de cobrar. As tarefas do dia aparecem na <Link href="/fila" className="font-semibold text-accent hover:underline">Fila do dia</Link>.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Faixa({ label, valor, tone, rodape, ativa, onClick }: {
  label: string; valor: number; tone: 'bad' | 'warn' | 'neutro'; rodape?: string; ativa: boolean; onClick: () => void
}) {
  const cor = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <button
      onClick={onClick}
      aria-pressed={ativa}
      className={`rounded-card border bg-card p-3 text-left transition-colors ${
        ativa ? 'border-ink' : 'border-line hover:border-ink/30'
      }`}
    >
      <div className={`num text-[20px] font-bold tracking-[-0.02em] ${cor}`}>{valor}</div>
      <div className="text-[11.5px] font-semibold text-ink-2">{label}</div>
      {rodape && <div className="text-[10.5px] text-ink-3">{rodape}</div>}
    </button>
  )
}
