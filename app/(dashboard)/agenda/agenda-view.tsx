'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Clock, MapPin, Phone, CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, notify } from '@/components/ui'
import { ListaEspera, type Espera } from '@/components/modules/saude/lista-espera'
import type { Tables } from '@/types/database'

/**
 * Agenda em CALENDÁRIO DO MÊS + painel do dia (pedido do dono da imobiliária,
 * 19/08/2026, tendo como referência o sistema que ele usa hoje).
 *
 * Por que trocar a lista cronológica: a lista responde "o que vem agora", e era boa
 * nisso. Quem gerencia pergunta outra coisa — "como está a semana", "que dia está
 * vazio", "cabe encaixar quinta?". Isso é forma, não texto: só o mês desenhado
 * responde de um olhar.
 *
 * O que a lista tinha e continua aqui: trocar status, rótulos de consulta/paciente
 * na clínica, lista de espera e o "Retorno".
 */

type Visita = Tables<'visitas'> & {
  lead_nome: string | null; lead_tel: string | null
  cliente_nome: string | null
  imovel_nome: string | null; imovel_bairro: string | null
}
type Opt = { id: number; nome: string | null }
type UsuarioMin = { id: string; nome: string }
type Tone = 'acc' | 'ok' | 'bad' | 'warn' | 'neutro'

const STATUS: { v: string; l: string; tone: Tone }[] = [
  { v: 'agendada', l: 'Agendada', tone: 'acc' },
  { v: 'realizada', l: 'Realizada', tone: 'ok' },
  { v: 'cancelada', l: 'Cancelada', tone: 'bad' },
  { v: 'no_show', l: 'Não compareceu', tone: 'warn' },
]
const stInfo = (s: string) => STATUS.find(x => x.v === s) ?? STATUS[0]

/**
 * Tipos de compromisso.
 *
 * Os valores são os do banco (`visitas_tipo_check`); o RÓTULO muda por segmento,
 * porque na clínica "visita" se chama consulta. `vistoria` existe só onde há imóvel
 * — é etapa do funil imobiliário, entre contrato e entrega de chaves, e até agora
 * não havia como distingui-la de uma visita comum.
 */
const TIPOS_IMOB = [
  { v: 'visita', l: 'Visita' },
  { v: 'vistoria', l: 'Vistoria' },
  { v: 'retorno', l: 'Retorno' },
  { v: 'apresentacao', l: 'Apresentação' },
  { v: 'follow_up', l: 'Follow-up' },
  { v: 'reuniao', l: 'Reunião' },
  { v: 'particular', l: 'Particular' },
  { v: 'outros', l: 'Outros' },
] as const
const TIPOS_SAUDE = [
  { v: 'visita', l: 'Consulta' },
  { v: 'retorno', l: 'Retorno' },
  { v: 'apresentacao', l: 'Exame' },
  { v: 'reuniao', l: 'Reunião' },
  { v: 'particular', l: 'Particular' },
  { v: 'outros', l: 'Outros' },
] as const

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/**
 * Chave do dia em horário LOCAL.
 *
 * `toISOString().slice(0,10)` — que a versão anterior usava para dizer "Hoje" — é
 * data em UTC: das 21h à meia-noite em Brasília ela já devolve o dia seguinte, e o
 * compromisso das 22h caía no dia errado. O calendário todo depende desta função.
 */
const chaveLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * Faixa de horário — com a data do fim quando ele cai em OUTRO dia.
 *
 * "09:00–11:30" num compromisso que termina depois de amanhã é mentira curta: quem
 * lê acha que acaba de manhã e marca outra coisa às 14h. Dia diferente, mostra a data.
 */
const faixa = (inicio: string, fim: string | null) => {
  if (!fim) return hora(inicio)
  const a = new Date(inicio), b = new Date(fim)
  const mesmoDia = chaveLocal(a) === chaveLocal(b)
  return mesmoDia
    ? `${hora(inicio)}–${hora(fim)}`
    : `${hora(inicio)} → ${b.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora(fim)}`
}
/** Valor para `datetime-local`, que não aceita fuso — tem de ser hora local. */
const paraCampo = (d: Date) => `${chaveLocal(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default function AgendaView({ inicial, leads, clientes, imoveis, usuarios, empresaId, meuId, isGestor, segmento }: {
  inicial: Visita[]; leads: Opt[]; clientes: Opt[]; imoveis: Opt[]; usuarios: UsuarioMin[]
  empresaId: number; meuId: string; isGestor: boolean; segmento?: string | null
}) {
  const supabase = createClient()
  // Os rótulos da agenda (consulta/paciente/profissional) são o comportamento;
  // saúde é só quem o usa hoje.
  const isSaude = !!SEGMENTOS[normalizarSegmento(segmento)].capacidades.agendaClinica
  const TIPOS = isSaude ? TIPOS_SAUDE : TIPOS_IMOB
  const rotuloTipo = (v: string | null) => TIPOS.find(t => t.v === v)?.l ?? TIPOS[0].l
  const L = {
    novo: isSaude ? 'Nova consulta' : 'Novo compromisso',
    pessoa: isSaude ? 'Paciente (lead)' : 'Lead',
    prof: isSaude ? 'Profissional' : 'Corretor',
    subtitulo: isSaude ? 'Gerencie suas consultas e retornos' : 'Gerencie seus compromissos e visitas',
    nenhum: isSaude ? 'Nenhuma consulta neste dia' : 'Nenhum compromisso neste dia',
  }

  const [lista, setLista] = useState<Visita[]>(inicial)
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const hoje = new Date()
  const [mes, setMes] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() })
  const [diaSel, setDiaSel] = useState<string>(chaveLocal(hoje))
  /** 'minha' = só os meus; 'supervisao' = da equipe (só gestor tem a aba). */
  const [aba, setAba] = useState<'minha' | 'supervisao'>('minha')
  const [deQuem, setDeQuem] = useState<string>('')

  const vazio = {
    titulo: '', tipo: 'visita' as string, data_hora: '', fim: '',
    lead_id: '', cliente_id: '', imovel_id: '', corretor_id: meuId,
    local: '', participantes: '', observacoes: '',
  }
  const [form, setForm] = useState(vazio)
  const set = (k: keyof typeof vazio, v: string) => setForm(f => ({ ...f, [k]: v }))

  /**
   * O recorte da aba.
   *
   * "Minha agenda" é sempre a minha, inclusive para o gestor — ele também atende. A
   * supervisão sem ninguém escolhido mostra a equipe inteira, que é a pergunta
   * "quem está com o dia cheio".
   */
  const visiveis = useMemo(() => {
    if (aba === 'minha') return lista.filter(v => v.corretor_id === meuId)
    return deQuem ? lista.filter(v => v.corretor_id === deQuem) : lista
  }, [lista, aba, deQuem, meuId])

  /** Compromissos por dia (chave local) — alimenta o calendário e o painel. */
  const porDia = useMemo(() => {
    const m = new Map<string, Visita[]>()
    for (const v of visiveis) {
      const k = chaveLocal(new Date(v.data_hora))
      const arr = m.get(k)
      if (arr) arr.push(v); else m.set(k, [v])
    }
    for (const arr of m.values()) arr.sort((a, b) => a.data_hora.localeCompare(b.data_hora))
    return m
  }, [visiveis])

  /** Semanas do mês: só os dias deste mês, com os vazios do começo. */
  const semanas = useMemo(() => {
    const primeiro = new Date(mes.ano, mes.mes, 1)
    const total = new Date(mes.ano, mes.mes + 1, 0).getDate()
    const celulas: (number | null)[] = Array(primeiro.getDay()).fill(null)
    for (let d = 1; d <= total; d++) celulas.push(d)
    while (celulas.length % 7 !== 0) celulas.push(null)
    const out: (number | null)[][] = []
    for (let i = 0; i < celulas.length; i += 7) out.push(celulas.slice(i, i + 7))
    return out
  }, [mes])

  const chaveDoDia = (dia: number) => chaveLocal(new Date(mes.ano, mes.mes, dia))
  const nomeDoMes = new Date(mes.ano, mes.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mover = (delta: number) => setMes(m => {
    const d = new Date(m.ano, m.mes + delta, 1)
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })

  const doDia = porDia.get(diaSel) ?? []
  const rotuloDoDia = (() => {
    const [a, m, d] = diaSel.split('-').map(Number)
    return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  })()

  /** Abrir o modal já no dia escolhido: 9h do dia clicado é o padrão útil. */
  function abrirNovo() {
    const [a, m, d] = diaSel.split('-').map(Number)
    setForm({
      ...vazio,
      data_hora: paraCampo(new Date(a, m - 1, d, 9, 0)),
      corretor_id: aba === 'supervisao' && deQuem ? deQuem : meuId,
    })
    setModal(true)
  }

  // Agendar retorno: reabre o modal com a pessoa e uma data sugerida (+30 dias).
  function agendarRetorno(v: Visita) {
    const dt = new Date(Date.now() + 30 * 864e5)
    dt.setHours(9, 0, 0, 0)
    setForm({
      ...vazio,
      tipo: 'retorno',
      titulo: v.titulo ? `Retorno — ${v.titulo}` : '',
      lead_id: v.lead_id ? String(v.lead_id) : '',
      cliente_id: v.cliente_id ? String(v.cliente_id) : '',
      data_hora: paraCampo(dt),
    })
    setModal(true)
  }

  // Encaixar alguém da lista de espera: abre o modal com os dados na observação.
  function agendarDaEspera(e: Espera) {
    setForm({
      ...vazio,
      titulo: e.nome,
      observacoes: `${e.nome}${e.telefone ? ` · ${e.telefone}` : ''}${e.observacao ? ` — ${e.observacao}` : ''} (lista de espera)`,
    })
    setModal(true)
  }

  async function salvar() {
    if (!form.data_hora) { notify.warn('Informe data e hora'); return }
    /**
     * O fim é conferido AQUI e no banco (`visitas_fim_depois_check`).
     *
     * Aqui para dizer o que está errado; lá para que nenhum outro caminho grave um
     * compromisso que termina antes de começar.
     */
    if (form.fim && new Date(form.fim) < new Date(form.data_hora)) {
      notify.warn('O horário de término é antes do início'); return
    }
    setLoading(true)
    const payload = {
      empresa_id: empresaId,
      titulo: form.titulo.trim() || null,
      tipo: form.tipo,
      lead_id: form.lead_id ? Number(form.lead_id) : null,
      cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      imovel_id: form.imovel_id ? Number(form.imovel_id) : null,
      corretor_id: form.corretor_id || meuId,
      data_hora: new Date(form.data_hora).toISOString(),
      fim: form.fim ? new Date(form.fim).toISOString() : null,
      local: form.local.trim() || null,
      participantes: form.participantes.trim() || null,
      status: 'agendada',
      observacoes: form.observacoes.trim() || null,
    }
    const { data, error } = await supabase.from('visitas')
      .insert(payload)
      .select('*, leads(nome, telefone), clientes(nome), imoveis(titulo, codigo, bairro)')
      .single()
    setLoading(false)
    if (error) { notify.bad(error.message); return }
    const d = data as unknown as Tables<'visitas'> & {
      leads?: { nome: string | null; telefone: string | null } | null
      clientes?: { nome: string | null } | null
      imoveis?: { titulo: string | null; codigo: string | null; bairro: string | null } | null
    }
    const nova: Visita = {
      ...d,
      lead_nome: d.leads?.nome ?? null,
      lead_tel: d.leads?.telefone ?? null,
      cliente_nome: d.clientes?.nome ?? null,
      imovel_nome: d.imoveis ? (d.imoveis.titulo || d.imoveis.codigo) : null,
      imovel_bairro: d.imoveis?.bairro ?? null,
    }
    setLista(l => [...l, nova].sort((a, b) => a.data_hora.localeCompare(b.data_hora)))
    /**
     * Pular para o dia agendado, e não voltar para hoje.
     *
     * Quem marca para quinta quer ver a quinta — é ali que ele confere se não pôs
     * dois clientes no mesmo horário.
     */
    const dia = new Date(nova.data_hora)
    setMes({ ano: dia.getFullYear(), mes: dia.getMonth() })
    setDiaSel(chaveLocal(dia))
    setForm(vazio); setModal(false)
    notify.ok(isSaude ? 'Consulta agendada' : 'Compromisso agendado')
  }

  async function mudarStatus(v: Visita, status: string) {
    const { error } = await supabase.from('visitas').update({ status }).eq('id', v.id)
    if (error) { notify.bad(error.message); return }
    setLista(l => l.map(x => x.id === v.id ? { ...x, status } : x))
  }

  const nomePorId = new Map(usuarios.map(u => [u.id, u.nome]))
  /** Quem é o compromisso, na ordem em que a pessoa aparece na tela. */
  const quem = (v: Visita) => v.titulo || v.lead_nome || v.cliente_nome || rotuloTipo(v.tipo)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Agenda" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 scrollbar-thin">
        <div className="mx-auto w-full max-w-[1100px]">

          <div className="flex flex-wrap items-end justify-between gap-3 py-4">
            <div>
              <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Agenda</h1>
              <p className="mt-0.5 text-[13px] text-ink-2">{L.subtitulo}</p>
            </div>
            <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={abrirNovo}>{L.novo}</Button>
          </div>

          {/* Abas + de quem é a agenda. Supervisão só existe para quem gerencia. */}
          {isGestor && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-control border border-line bg-card p-1">
                {([['minha', 'Minha agenda'], ['supervisao', 'Supervisão']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => { setAba(id); if (id === 'minha') setDeQuem('') }}
                    className={`rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      aba === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-bg'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {aba === 'supervisao' && (
                <div className="min-w-[220px]">
                  <Select value={deQuem} onChange={e => setDeQuem(e.target.value)} aria-label="Agenda de quem">
                    <option value="">Equipe inteira</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </Select>
                </div>
              )}
            </div>
          )}

          {isSaude && (
            <div className="mb-4">
              <ListaEspera empresaId={empresaId} onAgendar={agendarDaEspera} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            {/* ── Calendário do mês ── */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={() => mover(-1)}
                  aria-label="Mês anterior"
                  className="grid size-9 place-items-center rounded-control border border-line text-ink-2 transition-colors hover:text-ink"
                >
                  <ChevronLeft size={16} strokeWidth={1.8} />
                </button>
                <span className="text-[15px] font-bold capitalize tracking-[-0.02em] text-ink">{nomeDoMes}</span>
                <button
                  onClick={() => mover(1)}
                  aria-label="Próximo mês"
                  className="grid size-9 place-items-center rounded-control border border-line text-ink-2 transition-colors hover:text-ink"
                >
                  <ChevronRight size={16} strokeWidth={1.8} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {DIAS.map(d => (
                  <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{d}</div>
                ))}
                {semanas.flat().map((dia, i) => {
                  if (dia === null) return <div key={`v${i}`} />
                  const k = chaveDoDia(dia)
                  const itens = porDia.get(k) ?? []
                  const selecionado = k === diaSel
                  const eHoje = k === chaveLocal(hoje)
                  return (
                    <button
                      key={k}
                      onClick={() => setDiaSel(k)}
                      aria-label={`${dia} — ${itens.length} ${itens.length === 1 ? 'compromisso' : 'compromissos'}`}
                      aria-current={selecionado ? 'date' : undefined}
                      className={`relative flex h-[62px] flex-col items-center justify-center rounded-control border text-[13px] transition-colors ${
                        selecionado
                          ? 'border-ink bg-ink font-bold text-white'
                          : eHoje
                            ? 'border-accent bg-card font-semibold text-ink hover:bg-raised'
                            : 'border-line bg-card text-ink-2 hover:bg-raised'
                      }`}
                    >
                      <span className="num">{dia}</span>
                      {/*
                        A contagem no próprio dia é o que a lista não dava: dá para ver
                        a semana cheia e o dia livre sem clicar em nada.
                      */}
                      {itens.length > 0 && (
                        <span className={`num mt-1 rounded-full px-1.5 text-[10px] font-semibold leading-[15px] ${
                          selecionado ? 'bg-white/20 text-white' : 'bg-accent-soft text-accent'
                        }`}>
                          {itens.length}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* ── Painel do dia ── */}
            <Card
              title={<span className="capitalize">{rotuloDoDia}</span>}
              actions={doDia.length > 0 ? <span className="num text-[11.5px] text-ink-3">{doDia.length} {doDia.length === 1 ? 'item' : 'itens'}</span> : undefined}
              flush
            >
              {doDia.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={20} strokeWidth={1.7} />}
                  title={L.nenhum}
                  description="Escolha outro dia no calendário ou agende agora."
                  action={<Button size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={abrirNovo}>{L.novo}</Button>}
                />
              ) : (
                <div className="divide-y divide-line-soft">
                  {doDia.map(v => {
                    const st = stInfo(v.status)
                    return (
                      <div key={v.id} className="p-3.5">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex shrink-0 items-center gap-1 text-ink">
                            <Clock size={13} strokeWidth={1.7} className="text-ink-3" />
                            <span className="num text-[14px] font-semibold leading-none">
                              {faixa(v.data_hora, v.fim)}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{quem(v)}</span>
                              <Badge tone="neutro">{rotuloTipo(v.tipo)}</Badge>
                            </span>
                            {(v.lead_nome || v.cliente_nome) && v.titulo && (
                              <span className="mt-0.5 block truncate text-[12px] text-ink-2">{v.lead_nome || v.cliente_nome}</span>
                            )}
                            {v.imovel_nome && (
                              <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-2">
                                <MapPin size={12} strokeWidth={1.7} />{v.imovel_nome}{v.imovel_bairro ? ` · ${v.imovel_bairro}` : ''}
                              </span>
                            )}
                            {v.local && (
                              <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-2">
                                <MapPin size={12} strokeWidth={1.7} />{v.local}
                              </span>
                            )}
                            {v.lead_tel && (
                              <span className="num mt-0.5 flex items-center gap-1 text-[12px] text-ink-2">
                                <Phone size={12} strokeWidth={1.7} />{v.lead_tel}
                              </span>
                            )}
                            {v.participantes && (
                              <span className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-ink-3">
                                <Users size={12} strokeWidth={1.7} />{v.participantes}
                              </span>
                            )}
                            {/* Na supervisão, de quem é o compromisso é o dado principal. */}
                            {aba === 'supervisao' && v.corretor_id && (
                              <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                                {nomePorId.get(v.corretor_id) ?? '—'}
                              </span>
                            )}
                            {v.observacoes && (
                              <span className="mt-1 block text-[12px] leading-snug text-ink-2">{v.observacoes}</span>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="relative">
                            <Badge tone={st.tone} dot>{st.l}</Badge>
                            <select
                              value={v.status}
                              onChange={e => mudarStatus(v, e.target.value)}
                              aria-label="Alterar status"
                              className="absolute inset-0 w-full cursor-pointer opacity-0"
                            >
                              {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                            </select>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => agendarRetorno(v)}>Retorno</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={modal}
        onClose={() => { if (!loading) setModal(false) }}
        title={L.novo}
        size="lg"
        disableOverlayClose={loading}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={salvar} loading={loading}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Título"
            placeholder={isSaude ? 'Ex: Consulta de retorno' : 'Ex: Visita ao imóvel'}
            hint="Opcional — sem título, aparece o nome de quem vai ser atendido."
            value={form.titulo}
            onChange={e => set('titulo', e.target.value)}
          />

          {/* Tipo em botões, e não em select: são poucos e a escolha é o que muda a
              cara do compromisso na agenda. */}
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-ink-2">Tipo</div>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map(t => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => set('tipo', t.v)}
                  className={`rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    form.tipo === t.v ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:bg-bg'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Início" required type="datetime-local" value={form.data_hora} onChange={e => set('data_hora', e.target.value)} />
            <Input label="Até" type="datetime-local" hint="Opcional." value={form.fim} onChange={e => set('fim', e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={L.pessoa} value={form.lead_id} onChange={e => set('lead_id', e.target.value)}>
              <option value="">— selecionar —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.nome || `#${l.id}`}</option>)}
            </Select>
            <Select label="Cliente da carteira" value={form.cliente_id} onChange={e => set('cliente_id', e.target.value)}>
              <option value="">— selecionar —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome || `#${c.id}`}</option>)}
            </Select>
          </div>

          {!isSaude && (
            <Select label="Imóvel" value={form.imovel_id} onChange={e => set('imovel_id', e.target.value)}>
              <option value="">— selecionar —</option>
              {imoveis.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Select>
          )}

          <Input
            label="Local"
            placeholder="Ex: Av. Rondon Pacheco, 1000"
            hint="Onde encontrar — vale para reunião e compromisso fora do imóvel."
            value={form.local}
            onChange={e => set('local', e.target.value)}
          />

          {isGestor && (
            <Select label={L.prof} value={form.corretor_id} onChange={e => set('corretor_id', e.target.value)}>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
          )}

          <Input
            label="Participantes"
            placeholder="email@exemplo.com, 34 99999-0000"
            hint="Quem vai além da equipe — proprietário, cônjuge, despachante."
            value={form.participantes}
            onChange={e => set('participantes', e.target.value)}
          />

          <Textarea label="Descrição" rows={2} placeholder="Notas do compromisso" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
