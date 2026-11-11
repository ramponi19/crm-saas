'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Megaphone, Pause, Play, Square, Trash2, Send, ArrowLeft } from 'lucide-react'
import { Badge, Button, Card, ConfirmDialog, Input, Select, StatCard, notify } from '@/components/ui'
import { useFuso } from '@/components/fuso-provider'
import { agora, diaNoFuso, formatarDataHora, instanteLocal } from '@/lib/datas'
import { SITUACOES, descreverFiltro, variaveisDoModelo, type FiltroPublico, type Situacao } from '@/lib/transmissao/filtro'

// ── O que a API devolve ──────────────────────────────────────────────────────
type Status = 'rascunho' | 'agendada' | 'enviando' | 'pausada' | 'concluida' | 'encerrada'
interface Transmissao {
  id: number; nome: string; filial_id: number | null; modelo_id: number; status: Status; filtro: FiltroPublico
  parametros: string[]; agendada_para: string | null; iniciada_em: string | null; concluida_em: string | null
  total: number; created_at: string
}
interface Numeros {
  transmissao_id: number; total: number; pendentes: number; enviadas: number; entregues: number; lidas: number
  respondidas: number; falhas: number; puladas: number
}
// aprovado_em: lojas (id, ou 'null' = empresa sem loja) cujo NÚMERO tem o modelo aprovado (11/11/2026).
interface Modelo { id: number; nome: string; idioma: string; categoria: string; corpo: string; status: string; aprovado_em?: string[] }
interface Loja { id: number; nome: string }
interface Funil { id: number; nome: string; padrao: boolean }
interface Etapa { id: number; funil_id: number; label: string }
interface Form { lojas: Loja[]; origens: string[]; teto: number; tetoMax: number; enviadasNaHora: number; abreEm: string | null }
interface Dados {
  admin: boolean; transmissoes: Transmissao[]; numeros: Numeros[]; lojas: Loja[]; modelos: Modelo[]
  funis: Funil[]; etapas: Etapa[]; form: Form | null
}
interface Previa { total: number; aptos: number; opt_out: number; bloqueado: number; sem_telefone: number; modelo_7_dias: number; amostra: { nome: string | null; final: string }[] }

const ROTULO: Record<Status, string> = {
  rascunho: 'Rascunho', agendada: 'Agendada', enviando: 'Enviando', pausada: 'Pausada', concluida: 'Concluída', encerrada: 'Encerrada',
}
const TOM: Record<Status, 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'> = {
  rascunho: 'neutro', agendada: 'acc', enviando: 'acc', pausada: 'warn', concluida: 'ok', encerrada: 'neutro',
}

async function post(corpo: Record<string, unknown>) {
  const r = await fetch('/api/transmissao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `Falhou (HTTP ${r.status})`)
  return j
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

export function TransmissaoView() {
  const fuso = useFuso()
  const [dados, setDados] = useState<Dados | null>(null)
  // ?id= abre o acompanhamento direto (é para onde o card do lead aponta). No servidor a tela
  // mostra só o carregando, então ler a URL aqui não descasa a hidratação.
  const [aberta, setAberta] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : Number(new URLSearchParams(window.location.search).get('id')) || null)
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    const r = await fetch('/api/transmissao')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível carregar as transmissões.'); return }
    setDados(j as Dados)
  }, [])

  // Carregar ao abrir: o setState acontece depois do fetch (assíncrono), não durante o
  // efeito — é a busca de dados que a regra não distingue (mesmo caso do Automatize).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar])

  if (!dados) return <div className="flex items-center gap-2 p-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  if (aberta) return <Acompanhamento id={aberta} dados={dados} fuso={fuso} voltar={() => { setAberta(null); carregar() }} recarregarLista={carregar} />

  const porId = new Map(dados.numeros.map((n) => [Number(n.transmissao_id), n]))
  const lojaNome = new Map(dados.lojas.map((l) => [l.id, l.nome]))
  const modeloNome = new Map(dados.modelos.map((m) => [m.id, m.nome]))

  return (
    <div className="space-y-4">
      {dados.admin && dados.form && <Teto form={dados.form} fuso={fuso} recarregar={carregar} />}

      {dados.admin && (criando
        ? <NovaTransmissao dados={dados} fuso={fuso} fechar={() => setCriando(false)} pronto={async (id) => { setCriando(false); await carregar(); if (id) setAberta(id) }} />
        : <div><Button icon={<Megaphone size={15} strokeWidth={1.7} />} onClick={() => setCriando(true)}>Nova transmissão</Button></div>)}

      <Card title="Transmissões" flush>
        {dados.transmissoes.length === 0 ? (
          <p className="p-6 text-sm text-ink-3">
            {dados.admin ? 'Nenhuma transmissão ainda. Monte a lista por filtro e veja quantos recebem antes de enviar.' : 'Nenhuma transmissão nesta loja ainda.'}
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {dados.transmissoes.map((t) => {
              const n = porId.get(t.id)
              return (
                <li key={t.id}>
                  <button type="button" data-transmissao-linha={t.id} onClick={() => setAberta(t.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-bg">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-ink">{t.nome}</span>
                        <Badge tone={TOM[t.status]} dot>{ROTULO[t.status]}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                        {(t.filial_id && lojaNome.get(t.filial_id)) || 'Loja única'} · {modeloNome.get(t.modelo_id) ?? 'modelo'} ·{' '}
                        {t.status === 'agendada' && t.agendada_para ? `para ${formatarDataHora(t.agendada_para, undefined, '', fuso)}` : formatarDataHora(t.created_at, undefined, '', fuso)}
                      </div>
                    </div>
                    {n && t.status !== 'rascunho' && (
                      <div className="num flex gap-4 text-[11.5px] text-ink-2">
                        <span title="Enviadas">{n.enviadas}/{Number(n.total) - Number(n.puladas)} enviadas</span>
                        <span title="Lidas">{n.lidas} lidas</span>
                        <span title="Responderam" className="font-semibold text-ink">{n.respondidas} responderam</span>
                        {Number(n.falhas) > 0 && <span className="text-bad">{n.falhas} falhas</span>}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ── O teto por hora e o horário ──────────────────────────────────────────────
function Teto({ form, fuso, recarregar }: { form: Form; fuso: string; recarregar: () => Promise<void> }) {
  const [valor, setValor] = useState(String(form.teto))
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    try { await post({ op: 'teto', teto_hora: Number(valor) }); notify.ok('Teto por hora salvo.'); await recarregar() }
    catch (e) { notify.bad((e as Error).message) }
    finally { setSalvando(false) }
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-card px-4 py-3 text-[12.5px] text-ink-2">
      <Input label="Teto por hora (todas as transmissões)" type="number" min={1} max={form.tetoMax} value={valor}
        onChange={(e) => setValor(e.target.value)} wrapperClassName="w-56" data-teto-input />
      <Button variant="outline" size="sm" onClick={salvar} loading={salvando} disabled={Number(valor) === form.teto}>Salvar</Button>
      <span className="pb-2">{form.enviadasNaHora} enviadas na última hora.</span>
      <span className="pb-2">
        {form.abreEm
          ? <>Fora do horário de atendimento: a fila volta a andar em <strong className="text-ink">{formatarDataHora(form.abreEm, undefined, '', fuso)}</strong>.</>
          : 'Dentro do horário de atendimento.'}
      </span>
    </div>
  )
}

// ── Nova transmissão: modelo, lista por filtro com prévia, envio ─────────────
function NovaTransmissao({ dados, fuso, fechar, pronto }: { dados: Dados; fuso: string; fechar: () => void; pronto: (id: number | null) => Promise<void> }) {
  const lojas = dados.form?.lojas ?? []
  const [nome, setNome] = useState('')
  const [loja, setLoja] = useState<number | ''>(lojas.length === 1 ? lojas[0].id : '')
  // Só o que está aprovado NO NÚMERO da loja escolhida: a Meta aprova por conta de WhatsApp.
  const chaveLoja = loja ? String(loja) : 'null'
  const aprovados = dados.modelos.filter((m) => (m.aprovado_em ?? []).includes(chaveLoja))
  const [modeloEscolhido, setModeloId] = useState<number | ''>(aprovados[0]?.id ?? '')
  // Trocou a loja e o modelo escolhido não existe no número dela: vale o primeiro que existe.
  const modeloId: number | '' = aprovados.some((m) => m.id === modeloEscolhido) ? modeloEscolhido : (aprovados[0]?.id ?? '')
  const [parametros, setParametros] = useState<string[]>([])
  const [filtro, setFiltro] = useState<FiltroPublico>({})
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erroPrevia, setErroPrevia] = useState('')
  const [contando, setContando] = useState(false)
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [dia, setDia] = useState(() => diaNoFuso(agora(), fuso))
  const [hora, setHora] = useState('10:00')
  const [confirmar, setConfirmar] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const modelo = aprovados.find((m) => m.id === modeloId) ?? null
  const nVars = variaveisDoModelo(modelo?.corpo)
  const etapasDoFunil = dados.etapas.filter((e) => !filtro.funil_id || e.funil_id === filtro.funil_id)
  const precisaLoja = lojas.length > 1 || dados.lojas.length > 1

  // Prévia da contagem: refeita meio segundo depois da última mudança.
  useEffect(() => {
    if (precisaLoja && !loja) return
    const t = setTimeout(async () => {
      setContando(true)
      try {
        const j = await post({ op: 'previa', filial_id: loja || null, filtro, modelo_id: modeloId || null })
        setPrevia(j.previa as Previa); setErroPrevia('')
      } catch (e) { setPrevia(null); setErroPrevia((e as Error).message) }
      finally { setContando(false) }
    }, 500)
    return () => clearTimeout(t)
  }, [loja, filtro, modeloId, precisaLoja])

  const alterna = <K extends 'etapa_ids' | 'situacoes' | 'origens'>(chave: K, v: NonNullable<FiltroPublico[K]>[number]) =>
    setFiltro((f) => {
      const atual = (f[chave] ?? []) as (typeof v)[]
      const nova = atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v]
      return { ...f, [chave]: nova.length ? nova : undefined }
    })
  const dias = (chave: 'sem_mensagem_ha_dias' | 'com_mensagem_nos_dias', v: string) =>
    setFiltro((f) => ({ ...f, [chave]: Number(v) > 0 ? Math.floor(Number(v)) : undefined }))

  const nomes = useMemo(() => ({
    funis: new Map(dados.funis.map((f) => [f.id, f.nome])),
    etapas: new Map(dados.etapas.map((e) => [e.id, e.label])),
  }), [dados.funis, dados.etapas])

  const pronta = !!nome.trim() && !!modelo && (!precisaLoja || !!loja) && parametros.slice(0, nVars).filter((p) => p?.trim()).length === nVars
  const agendarPara = quando === 'agendar' ? instanteLocal(dia, hora, fuso) : null

  async function salvar(disparar: boolean) {
    setSalvando(true)
    try {
      const { id } = await post({ op: 'criar', nome, filial_id: loja || null, modelo_id: modeloId, parametros: parametros.slice(0, nVars), filtro })
      if (disparar) {
        const j = await post({ op: 'disparar', id, ...(agendarPara ? { agendar_para: agendarPara.toISOString() } : {}) })
        notify.ok(j.status === 'agendada' ? 'Transmissão agendada.' : 'Transmissão disparada.', `${j.contatos} contatos na lista.`)
      } else notify.ok('Rascunho salvo.')
      await pronto(disparar ? id : null)
    } catch (e) { notify.bad((e as Error).message) }
    finally { setSalvando(false); setConfirmar(false) }
  }

  const chip = (ativo: boolean) => `rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${ativo ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:text-ink'}`

  return (
    <Card title="Nova transmissão" actions={<Button variant="ghost" size="sm" onClick={fechar}>Cancelar</Button>} data-transmissao-form>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nome (só para a loja)" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Retorno de quem sumiu — novembro" maxLength={120} />
            {precisaLoja && (
              <Select label="Loja (o WhatsApp que envia)" value={loja} onChange={(e) => { setLoja(Number(e.target.value) || ''); setParametros([]) }}>
                <option value="">Escolha a loja</option>
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </Select>
            )}
          </div>

          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-ink">Mensagem</h4>
            {precisaLoja && !loja ? (
              <p className="text-[12.5px] text-ink-3">Escolha a loja: cada número de WhatsApp tem os seus modelos aprovados.</p>
            ) : aprovados.length === 0 ? (
              <p className="text-[12.5px] text-warn">Nenhum modelo aprovado pela Meta no WhatsApp desta loja. Crie (ou sincronize) e espere a aprovação em Automações → Modelos.</p>
            ) : (
              <>
                <Select label="Modelo aprovado" value={modeloId} onChange={(e) => { setModeloId(Number(e.target.value) || ''); setParametros([]) }}>
                  {aprovados.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.categoria.toLowerCase()})</option>)}
                </Select>
                {modelo && <p className="whitespace-pre-wrap rounded-control bg-bg px-3 py-2 text-[12.5px] text-ink-2" data-modelo-corpo>{modelo.corpo}</p>}
                {Array.from({ length: nVars }, (_, i) => (
                  <Input key={i} label={`Variável {{${i + 1}}}`} value={parametros[i] ?? ''} placeholder="{{nome}} = nome do contato"
                    onChange={(e) => setParametros((p) => { const n = [...p]; n[i] = e.target.value; return n })} />
                ))}
              </>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-ink">Quem recebe</h4>
            <Select label="Funil" value={filtro.funil_id ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, funil_id: Number(e.target.value) || undefined, etapa_ids: undefined }))}>
              <option value="">Qualquer funil</option>
              {dados.funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Select>
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-ink-2">Etapa</div>
              <div className="flex flex-wrap gap-1.5">
                {etapasDoFunil.map((e) => (
                  <button key={e.id} type="button" data-filtro-etapa={e.id} className={chip(!!filtro.etapa_ids?.includes(e.id))} onClick={() => alterna('etapa_ids', e.id)}>{e.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-ink-2">Situação do negócio</div>
              <div className="flex flex-wrap gap-1.5">
                {SITUACOES.map((s) => (
                  <button key={s.id} type="button" data-filtro-situacao={s.id} className={chip(!!filtro.situacoes?.includes(s.id))} onClick={() => alterna('situacoes', s.id as Situacao)}>{s.rotulo}</button>
                ))}
              </div>
            </div>
            {(dados.form?.origens.length ?? 0) > 0 && (
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-ink-2">Origem do contato</div>
                <div className="flex flex-wrap gap-1.5">
                  {dados.form!.origens.map((o) => (
                    <button key={o} type="button" data-filtro-origem={o} className={chip(!!filtro.origens?.includes(o))} onClick={() => alterna('origens', o)}>{o}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Sem mensagem há mais de (dias)" type="number" min={1} value={filtro.sem_mensagem_ha_dias ?? ''} onChange={(e) => dias('sem_mensagem_ha_dias', e.target.value)} data-filtro-sem />
              <Input label="Com mensagem nos últimos (dias)" type="number" min={1} value={filtro.com_mensagem_nos_dias ?? ''} onChange={(e) => dias('com_mensagem_nos_dias', e.target.value)} data-filtro-com />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-ink">Quando</h4>
            <div className="flex gap-1.5">
              <button type="button" className={chip(quando === 'agora')} onClick={() => setQuando('agora')}>Agora</button>
              <button type="button" className={chip(quando === 'agendar')} onClick={() => setQuando('agendar')}>Agendar</button>
            </div>
            {quando === 'agendar' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
                <Input label="Hora (da loja)" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
            )}
            <p className="text-[11.5px] text-ink-3">
              Sai até {dados.form?.teto ?? 50} por hora, só no horário de atendimento da loja; o que não couber espera a hora seguinte (o envio roda de hora em hora).
              {quando === 'agendar' && ' Agendada, começa na primeira rodada depois do horário escolhido.'}
            </p>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" data-previa>
          <div className="rounded-card border border-line bg-bg p-4">
            <div className="text-[11px] font-medium text-ink-3">Recebem</div>
            <div className="num mt-1 text-[28px] font-bold leading-none tracking-[-0.035em] text-ink" data-previa-aptos>
              {contando && !previa ? '…' : previa ? previa.aptos : '—'}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-2">{descreverFiltro(filtro, nomes)}</p>
            {erroPrevia && <p className="mt-2 text-[11.5px] text-bad">{erroPrevia}</p>}
            {precisaLoja && !loja && <p className="mt-2 text-[11.5px] text-ink-3">Escolha a loja para contar.</p>}
            {previa && previa.total > previa.aptos && (
              <ul className="mt-3 space-y-0.5 text-[11.5px] text-ink-2" data-previa-fora>
                <li className="font-medium text-ink">{previa.total - previa.aptos} ficam fora:</li>
                {previa.opt_out > 0 && <li>{previa.opt_out} pediram para não receber</li>}
                {previa.bloqueado > 0 && <li>{previa.bloqueado} bloqueados</li>}
                {previa.sem_telefone > 0 && <li>{previa.sem_telefone} sem telefone</li>}
                {previa.modelo_7_dias > 0 && <li>{previa.modelo_7_dias} receberam este modelo há menos de 7 dias</li>}
              </ul>
            )}
            {previa && previa.amostra.length > 0 && (
              <p className="mt-3 text-[11px] text-ink-3">Ex.: {previa.amostra.map((a) => `${a.nome ?? 'sem nome'} (…${a.final})`).join(', ')}</p>
            )}
          </div>
          <Button className="w-full" icon={<Send size={15} strokeWidth={1.7} />} disabled={!pronta || !previa?.aptos || salvando}
            onClick={() => setConfirmar(true)} data-disparar>
            {quando === 'agendar' ? 'Agendar' : 'Disparar'}{previa?.aptos ? ` para ${previa.aptos}` : ''}
          </Button>
          <Button className="w-full" variant="outline" disabled={!pronta || salvando} onClick={() => salvar(false)}>Salvar rascunho</Button>
        </aside>
      </div>

      <ConfirmDialog open={confirmar} onClose={() => setConfirmar(false)} onConfirm={() => salvar(true)} loading={salvando}
        title={quando === 'agendar' ? 'Agendar transmissão?' : 'Disparar transmissão?'} confirmLabel={quando === 'agendar' ? 'Agendar' : 'Disparar'}
        description={<>
          <strong>{previa?.aptos ?? 0}</strong> contatos recebem o modelo <strong>{modelo?.nome}</strong>
          {agendarPara ? <> a partir de {formatarDataHora(agendarPara, undefined, '', fuso)}</> : null}. A lista é congelada agora; dá para pausar a qualquer momento.
        </>} />
    </Card>
  )
}

// ── O acompanhamento de uma transmissão ──────────────────────────────────────
interface EnvioLinha { id: number; negocio_id: number | null; nome: string | null; final: string | null; status: string; motivo: string | null; enviada_em: string | null; entrega: string | null; respondida_em: string | null }
interface Detalhe { transmissao: Transmissao; numeros: Numeros | null; total: number; pagina: number; porPagina: number; envios: EnvioLinha[] }

const FILTROS = [
  { id: '', rotulo: 'Todos' }, { id: 'respondida', rotulo: 'Responderam' }, { id: 'enviada', rotulo: 'Enviadas' },
  { id: 'pendente', rotulo: 'Na fila' }, { id: 'falhou', rotulo: 'Falhas' }, { id: 'pulada', rotulo: 'Fora da lista' },
]
const ENTREGA: Record<string, string> = { enviada: 'enviada', entregue: 'entregue', lida: 'lida', falhou: 'falhou na entrega', falha_envio: 'falhou' }

function Acompanhamento({ id, dados, fuso, voltar, recarregarLista }: { id: number; dados: Dados; fuso: string; voltar: () => void; recarregarLista: () => Promise<void> }) {
  const [d, setD] = useState<Detalhe | null>(null)
  const [situacao, setSituacao] = useState('')
  const [pagina, setPagina] = useState(0)
  const [acao, setAcao] = useState<'' | 'pausar' | 'retomar' | 'encerrar' | 'disparar' | 'apagar'>('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/transmissao/${id}?situacao=${situacao}&pagina=${pagina}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível abrir a transmissão.'); return }
    setD(j as Detalhe)
  }, [id, situacao, pagina])

  // Busca de dados: o setState é depois do fetch, não durante o efeito.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar])

  // Enquanto envia, os números andam: relê a cada 20 s, só com a aba à vista.
  const enviando = d?.transmissao.status === 'enviando'
  useEffect(() => {
    if (!enviando) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 20_000)
    return () => clearInterval(t)
  }, [enviando, carregar])

  async function executar() {
    if (!acao) return
    setOcupado(true)
    try {
      await post({ op: acao, id })
      notify.ok({ pausar: 'Transmissão pausada.', retomar: 'Transmissão retomada.', encerrar: 'Transmissão encerrada.', disparar: 'Transmissão disparada.', apagar: 'Rascunho apagado.' }[acao])
      if (acao === 'apagar') { voltar(); return }
      await Promise.all([carregar(), recarregarLista()])
    } catch (e) { notify.bad((e as Error).message) }
    finally { setOcupado(false); setAcao('') }
  }

  if (!d) return <div className="flex items-center gap-2 p-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  const t = d.transmissao
  const n = d.numeros
  const modelo = dados.modelos.find((m) => m.id === t.modelo_id)
  const loja = dados.lojas.find((l) => l.id === t.filial_id)
  const nomes = { funis: new Map(dados.funis.map((f) => [f.id, f.nome])), etapas: new Map(dados.etapas.map((e) => [e.id, e.label])) }
  const naLista = n ? Number(n.total) - Number(n.puladas) : 0

  return (
    <div className="space-y-4" data-acompanhamento={id}>
      <button type="button" onClick={voltar} className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Transmissões</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{t.nome}</h2>
            <Badge tone={TOM[t.status]} dot data-status={t.status}>{ROTULO[t.status]}</Badge>
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            {loja?.nome ?? 'Loja única'} · modelo {modelo?.nome ?? `#${t.modelo_id}`} · {descreverFiltro(t.filtro ?? {}, nomes)}
            {t.status === 'agendada' && t.agendada_para ? ` · começa em ${formatarDataHora(t.agendada_para, undefined, '', fuso)}` : ''}
          </p>
        </div>
        {dados.admin && (
          <div className="flex gap-2">
            {t.status === 'rascunho' && <Button size="sm" icon={<Send size={14} />} onClick={() => setAcao('disparar')}>Disparar</Button>}
            {t.status === 'rascunho' && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setAcao('apagar')}>Apagar</Button>}
            {(t.status === 'enviando' || t.status === 'agendada') && <Button size="sm" variant="outline" icon={<Pause size={14} />} onClick={() => setAcao('pausar')} data-pausar>Pausar</Button>}
            {t.status === 'pausada' && <Button size="sm" icon={<Play size={14} />} onClick={() => setAcao('retomar')} data-retomar>Retomar</Button>}
            {['enviando', 'agendada', 'pausada'].includes(t.status) && <Button size="sm" variant="ghost" icon={<Square size={14} />} onClick={() => setAcao('encerrar')}>Encerrar</Button>}
          </div>
        )}
      </div>

      {n && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-numeros>
          <StatCard label="Na fila" value={n.pendentes} data-numero="pendentes" />
          <StatCard label="Enviadas" value={n.enviadas} delta={`de ${naLista}`} data-numero="enviadas" />
          <StatCard label="Entregues" value={n.entregues} delta={pct(Number(n.entregues), Number(n.enviadas))} data-numero="entregues" />
          <StatCard label="Lidas" value={n.lidas} delta={pct(Number(n.lidas), Number(n.enviadas))} data-numero="lidas" />
          <StatCard label="Responderam" value={n.respondidas} delta={pct(Number(n.respondidas), Number(n.enviadas))} data-numero="respondidas" />
          <StatCard label="Falhas" value={n.falhas} delta={n.puladas ? `${n.puladas} fora da lista` : undefined} data-numero="falhas" />
        </div>
      )}

      <Card flush title={
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" onClick={() => { setSituacao(f.id); setPagina(0) }}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${situacao === f.id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}>{f.rotulo}</button>
          ))}
        </div>
      }>
        {d.envios.length === 0 ? <p className="p-6 text-sm text-ink-3">Ninguém aqui.</p> : (
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[11px] text-ink-3">
              <tr><th className="px-4 py-2 font-medium">Contato</th><th className="px-4 py-2 font-medium">Envio</th><th className="px-4 py-2 font-medium">Entrega</th><th className="px-4 py-2 font-medium">Respondeu</th></tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {d.envios.map((e) => (
                <tr key={e.id} data-envio={e.id} data-envio-status={e.status}>
                  <td className="px-4 py-2">
                    {e.negocio_id ? <a href={`/leads?lead=${e.negocio_id}`} className="font-medium text-ink hover:underline">{e.nome ?? 'Sem nome'}</a> : <span className="font-medium text-ink">{e.nome ?? 'Sem nome'}</span>}
                    {e.final && <span className="ml-1.5 text-ink-3">…{e.final}</span>}
                  </td>
                  <td className="px-4 py-2 text-ink-2">
                    {e.status === 'enviada' ? formatarDataHora(e.enviada_em, undefined, '', fuso)
                      : e.status === 'pendente' || e.status === 'enviando' ? 'na fila'
                        : <span className={e.status === 'falhou' ? 'text-bad' : 'text-ink-3'}>{e.status === 'falhou' ? 'falhou' : 'fora'}{e.motivo ? `: ${e.motivo}` : ''}</span>}
                  </td>
                  <td className="px-4 py-2 text-ink-2">{e.entrega ? ENTREGA[e.entrega] ?? e.entrega : '—'}</td>
                  <td className="px-4 py-2">{e.respondida_em ? <span className="font-medium text-ok">{formatarDataHora(e.respondida_em, undefined, '', fuso)}</span> : <span className="text-ink-3">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d.total > d.porPagina && (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-2 text-[12px] text-ink-2">
            <span>{d.pagina * d.porPagina + 1}–{Math.min(d.total, (d.pagina + 1) * d.porPagina)} de {d.total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="ghost" disabled={(pagina + 1) * d.porPagina >= d.total} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog open={!!acao} onClose={() => setAcao('')} onConfirm={executar} loading={ocupado}
        tone={acao === 'encerrar' || acao === 'apagar' ? 'danger' : 'primary'}
        title={{ '': '', pausar: 'Pausar a transmissão?', retomar: 'Retomar a transmissão?', encerrar: 'Encerrar a transmissão?', disparar: 'Disparar a transmissão?', apagar: 'Apagar o rascunho?' }[acao]}
        confirmLabel={{ '': '', pausar: 'Pausar', retomar: 'Retomar', encerrar: 'Encerrar', disparar: 'Disparar', apagar: 'Apagar' }[acao]}
        description={{
          '': '', pausar: 'O que ainda não saiu fica na fila, parado, até você retomar.', retomar: 'A fila volta a andar no horário de atendimento, dentro do teto por hora.',
          encerrar: 'O que não saiu não sai mais (fica registrado como não enviado). Não dá para desfazer.',
          disparar: 'A lista é montada agora, com o filtro salvo, e o envio começa.', apagar: 'O rascunho some; nada foi enviado.',
        }[acao]} />
    </div>
  )
}

