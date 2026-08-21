'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Modal, Button, Badge, Input, Select, Textarea, notify,
} from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { formatarData } from '@/lib/datas'
import {
  TIPO_NEGOCIO, STATUS_APROVACAO, ORIGENS_IMOB, TIPOS_IMOVEL, CARACTERISTICAS,
  rotuloTipoNegocio, statusAprovacao,
} from './cliente-imob-tipos'
import {
  MessageCircle, Phone, Mail, Pencil, Home, Link2,
  Handshake, CalendarCheck, PhoneCall,
} from 'lucide-react'

/**
 * Ficha do cliente na imobiliária — a mesma do CRM que o dono usa (copiada com
 * autorização dele): header com WhatsApp/Ligar/Email, a faixa de ETAPA DO PIPELINE
 * e as sub-abas Dados · Imóvel de Interesse · Histórico.
 *
 * Vive separada da ficha do varejo de propósito. A do varejo pergunta CPF validado,
 * estado civil e profissão porque alimenta o contrato de venda; forçar as duas na
 * mesma tela geraria um formulário que ninguém preenche inteiro — e mexer nela
 * arriscaria a JM, que usa aquela todo dia.
 *
 * A ETAPA não é campo do cliente: mora em `leads.kanban_status`, do lead vinculado.
 * Cliente sem lead não tem jornada, e a faixa diz isso em vez de mostrar etapa falsa.
 */

interface Cliente {
  id?: number
  nome: string
  email?: string | null
  telefone?: string | null
  cpf_cnpj?: string | null
  cidade?: string | null
  observacoes?: string | null
  origem_cliente?: string | null
  created_at?: string | null
  lead_id?: number | null
  tipo_negocio?: string | null
  status_aprovacao?: string | null
  proprietario?: boolean | null
  corretor_id?: string | null
  valor_pretendido?: number | null
  regiao_interesse?: string | null
}

interface Jornada {
  etapaId: string | null
  etapaLabel: string | null
  score: number | null
  corretorNome: string | null
}

interface Preferencias {
  id?: number
  preco_min: number | null
  preco_max: number | null
  cidades: string[] | null
  bairros: string[] | null
  tipos: string[] | null
  quartos_min: number | null
  quartos_max: number | null
  suites_min: number | null
  vagas_min: number | null
  area_min: number | null
  area_max: number | null
  caracteristicas: string[] | null
  observacoes: string | null
}

interface ItemHistorico {
  quando: string
  tipo: 'mensagem' | 'chamada' | 'visita' | 'negocio'
  titulo: string
  detalhe?: string | null
}

const soDigitos = (t?: string | null) => (t || '').replace(/\D/g, '')
function waLink(tel?: string | null) {
  let d = soDigitos(tel)
  if (d && d.length <= 11 && !d.startsWith('55')) d = '55' + d
  return `https://wa.me/${d}`
}

const ICONE_HISTORICO = {
  mensagem: MessageCircle,
  chamada: PhoneCall,
  visita: CalendarCheck,
  negocio: Handshake,
} as const

export default function ClienteModalImob({ cliente, isNew, etapas, equipe, jornada, onClose }: {
  cliente: Cliente | null
  isNew: boolean
  etapas: { id: string; label: string; tipo: string | null }[]
  equipe: { id: string; nome: string }[]
  jornada?: Jornada
  onClose: () => void
}) {
  const supabase = createClient()
  const [aba, setAba] = useState<'dados' | 'imovel' | 'historico'>('dados')
  const [editando, setEditando] = useState(isNew)
  const [salvando, setSalvando] = useState(false)
  const [etapaAtual, setEtapaAtual] = useState<string | null>(jornada?.etapaId ?? null)
  const [leadId, setLeadId] = useState<number | null>(cliente?.lead_id ?? null)

  const vazio = {
    nome: '', cpf_cnpj: '', telefone: '', email: '',
    origem_cliente: '', corretor_id: '', tipo_negocio: '',
    valor_pretendido: '', regiao_interesse: '', status_aprovacao: 'pendente',
    observacoes: '', proprietario: false,
  }
  const [form, setForm] = useState(() => cliente ? {
    nome: cliente.nome ?? '',
    cpf_cnpj: cliente.cpf_cnpj ?? '',
    telefone: cliente.telefone ?? '',
    email: cliente.email ?? '',
    origem_cliente: cliente.origem_cliente ?? '',
    corretor_id: cliente.corretor_id ?? '',
    tipo_negocio: cliente.tipo_negocio ?? '',
    valor_pretendido: cliente.valor_pretendido != null ? String(cliente.valor_pretendido) : '',
    regiao_interesse: cliente.regiao_interesse ?? '',
    status_aprovacao: cliente.status_aprovacao ?? 'pendente',
    observacoes: cliente.observacoes ?? '',
    proprietario: !!cliente.proprietario,
  } : vazio)
  const set = (k: keyof typeof vazio, v: string) => setForm((f) => ({ ...f, [k]: v }))
  /** `proprietario` é booleano; `set` só serve para texto. */
  const setBool = (k: 'proprietario', v: boolean) => setForm((f) => ({ ...f, [k]: v }))

  const [prefs, setPrefs] = useState<Preferencias | null>(null)
  const [editandoPrefs, setEditandoPrefs] = useState(false)
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null)

  const st = statusAprovacao(cliente?.status_aprovacao)

  /**
   * Preferências e histórico são carregados ao ABRIR a ficha, não na lista.
   *
   * A lista de clientes já faz cinco consultas; puxar mensagem, chamada, visita e
   * negócio de todo mundo para mostrar de um só deixaria a tela lenta para todos por
   * causa de quem talvez ninguém abra.
   */
  useEffect(() => {
    if (!cliente?.id) return
    let vivo = true
    ;(async () => {
      const filtros = leadId != null
        ? `cliente_id.eq.${cliente.id},lead_id.eq.${leadId}`
        : `cliente_id.eq.${cliente.id}`
      const { data: pf } = await supabase.from('lead_perfil_busca')
        .select('id, preco_min, preco_max, cidades, bairros, tipos, quartos_min, quartos_max, suites_min, vagas_min, area_min, area_max, caracteristicas, observacoes')
        .or(filtros).limit(1).maybeSingle()
      if (vivo) setPrefs((pf ?? null) as Preferencias | null)
    })()
    return () => { vivo = false }
  }, [cliente?.id, leadId, supabase])

  async function carregarHistorico() {
    if (!cliente?.id || historico) return
    const itens: ItemHistorico[] = []

    const [msgs, chamadas, visitas, negocios] = await Promise.all([
      leadId != null
        ? supabase.from('lead_mensagens').select('direcao, conteudo, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(15)
        : Promise.resolve({ data: [] }),
      leadId != null
        ? supabase.from('chamadas').select('direcao, resultado, duracao_seg, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(15)
        : Promise.resolve({ data: [] }),
      supabase.from('visitas').select('titulo, tipo, status, data_hora').eq('cliente_id', cliente.id).order('data_hora', { ascending: false }).limit(15),
      supabase.from('negocios_imobiliarios').select('tipo, valor, status, created_at').eq('cliente_id', cliente.id).order('created_at', { ascending: false }).limit(10),
    ])

    for (const m of ((msgs.data ?? []) as { direcao: string; conteudo: string | null; created_at: string }[])) {
      itens.push({
        quando: m.created_at, tipo: 'mensagem',
        titulo: m.direcao === 'recebida' ? 'Mensagem do cliente' : 'Mensagem enviada',
        detalhe: (m.conteudo ?? '').slice(0, 120),
      })
    }
    for (const c of ((chamadas.data ?? []) as { direcao: string; resultado: string | null; duracao_seg: number | null; created_at: string }[])) {
      itens.push({
        quando: c.created_at, tipo: 'chamada',
        titulo: c.direcao === 'entrada' ? 'Ligação recebida' : 'Ligação feita',
        detalhe: [c.resultado, c.duracao_seg ? `${Math.round(c.duracao_seg / 60)} min` : null].filter(Boolean).join(' · ') || null,
      })
    }
    for (const v of ((visitas.data ?? []) as { titulo: string | null; tipo: string | null; status: string; data_hora: string }[])) {
      itens.push({
        quando: v.data_hora, tipo: 'visita',
        titulo: v.titulo || 'Compromisso',
        detalhe: [v.tipo, v.status].filter(Boolean).join(' · '),
      })
    }
    for (const n of ((negocios.data ?? []) as { tipo: string; valor: number; status: string; created_at: string }[])) {
      itens.push({
        quando: n.created_at, tipo: 'negocio',
        titulo: `Negócio de ${n.tipo === 'locacao' ? 'locação' : 'venda'}`,
        detalhe: `${formatCurrency(Number(n.valor) || 0)} · ${n.status}`,
      })
    }

    itens.sort((a, b) => b.quando.localeCompare(a.quando))
    setHistorico(itens)
  }

  useEffect(() => { if (aba === 'historico') void carregarHistorico() }, [aba]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvarDados() {
    if (!form.nome.trim()) { notify.warn('Informe o nome'); return }
    setSalvando(true)
    const dados = {
      nome: form.nome.trim(),
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      origem_cliente: form.origem_cliente || null,
      corretor_id: form.corretor_id || null,
      tipo_negocio: form.tipo_negocio || null,
      valor_pretendido: form.valor_pretendido ? Number(String(form.valor_pretendido).replace(/\./g, '').replace(',', '.')) : null,
      regiao_interesse: form.regiao_interesse.trim() || null,
      status_aprovacao: form.status_aprovacao || 'pendente',
      observacoes: form.observacoes.trim() || null,
      /**
       * Papel de proprietário — o que substituiu a tela "Proprietários".
       *
       * Marcar aqui é para quem cadastra o dono ANTES de ter o imóvel; quando o
       * imóvel é salvo apontando para ele, o banco marca sozinho (trigger), porque
       * imóvel também entra por import de portal e por API.
       */
      proprietario: form.proprietario,
    }
    if (isNew) {
      const { data: emp } = await supabase.rpc('get_empresa_id')
      const { error } = await supabase.from('clientes').insert({ ...dados, empresa_id: emp } as never)
      setSalvando(false)
      if (error) { notify.bad('Não foi possível salvar', error.message); return }
      notify.ok('Cliente cadastrado')
      onClose()
      return
    }
    const { error } = await supabase.from('clientes').update(dados as never).eq('id', cliente!.id!)
    setSalvando(false)
    if (error) { notify.bad('Não foi possível salvar', error.message); return }
    notify.ok('Cliente salvo')
    setEditando(false)
  }

  /**
   * Mover de etapa mexe no LEAD, não no cliente.
   *
   * É o mesmo campo que o kanban arrasta (`leads.kanban_status`), então mover aqui e
   * mover lá são a mesma ação — não existem duas etapas para a mesma pessoa.
   */
  async function moverEtapa(id: string) {
    if (leadId == null) return
    const antes = etapaAtual
    setEtapaAtual(id)
    const { error } = await supabase.from('leads').update({ kanban_status: id } as never).eq('id', leadId)
    if (error) { setEtapaAtual(antes); notify.bad('Não foi possível mover', error.message); return }
    notify.ok('Etapa atualizada')
  }

  /** Cria o lead da pessoa e amarra ao cliente — a ponte que faltava no nosso modelo. */
  async function vincularAoFunil() {
    if (!cliente?.id) return
    setSalvando(true)
    const { data: emp } = await supabase.rpc('get_empresa_id')
    /**
     * Sem empresa não se cria lead.
     *
     * O tipo gerado do banco cobrou isto quando o `as never` saiu: `get_empresa_id()`
     * devolve `number | null`, e sem a guarda um null viraria insert com empresa nula
     * — lead órfão que a RLS esconde de todo mundo, inclusive de quem o criou.
     */
    if (typeof emp !== 'number') { setSalvando(false); notify.bad('Não foi possível identificar a empresa'); return }
    const primeira = etapas[0]?.id ?? 'novo'
    /**
     * `leads` NÃO tem coluna de e-mail — só telefone e instagram.
     *
     * A primeira versão mandava `email` aqui e o insert falharia em produção com
     * "column does not exist"; o cliente ficaria sem lead e a tela diria erro cru. O
     * e-mail continua no cadastro do cliente, que é onde ele já vive.
     */
    const { data: novo, error } = await supabase.from('leads').insert({
      empresa_id: emp,
      nome: cliente.nome,
      telefone: cliente.telefone ?? null,
      origem: cliente.origem_cliente ?? 'manual',
      kanban_status: primeira,
      responsavel_id: cliente.corretor_id ?? null,
      valor_estimado: cliente.valor_pretendido ?? null,
      ativo: true,
      /**
       * SEM `as never` de propósito.
       *
       * A primeira versão mandava `email` aqui e `leads` não tem essa coluna — o
       * insert falharia só em produção, com erro cru na tela. Sem o cast, o
       * TypeScript compara o payload com as colunas reais e a build quebra antes.
       */
    }).select('id').single<{ id: number }>()
    if (error || !novo) { setSalvando(false); notify.bad('Não foi possível criar o lead', error?.message); return }
    const { error: e2 } = await supabase.from('clientes').update({ lead_id: novo.id } as never).eq('id', cliente.id)
    setSalvando(false)
    if (e2) { notify.bad('Lead criado, mas não vinculou', e2.message); return }
    setLeadId(novo.id)
    setEtapaAtual(primeira)
    notify.ok('Cliente entrou no funil')
  }

  return (
    <Modal
      open
      onClose={() => { if (!salvando) onClose() }}
      size="lg"
      disableOverlayClose={salvando}
      title={isNew ? 'Novo Cliente' : (
        <span className="block">
          <span className="block text-[15px] font-bold text-ink">{cliente?.nome}</span>
          <span className="block text-[11.5px] font-normal text-ink-3">
            {cliente?.cpf_cnpj || 'sem CPF'}
            {rotuloTipoNegocio(cliente?.tipo_negocio) && <> • {rotuloTipoNegocio(cliente?.tipo_negocio)}</>}
          </span>
        </span>
      )}
      footer={editando ? (
        <>
          <Button variant="ghost" onClick={() => (isNew ? onClose() : setEditando(false))} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvarDados} loading={salvando}>Salvar</Button>
        </>
      ) : (
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
      )}
    >
      {isNew || editando ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input wrapperClassName="sm:col-span-2" label="Nome completo" required value={form.nome} onChange={(e) => set('nome', e.target.value)} />
          <Input label="CPF" value={form.cpf_cnpj} onChange={(e) => set('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
          <Input label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(34) 99999-0000" />
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Select label="Origem do lead" value={form.origem_cliente} onChange={(e) => set('origem_cliente', e.target.value)}>
            <option value="">Selecione…</option>
            {ORIGENS_IMOB.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </Select>
          <Select label="Corretor responsável" value={form.corretor_id} onChange={(e) => set('corretor_id', e.target.value)}>
            <option value="">Selecione…</option>
            {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Select>
          <Select label="Tipo de cliente" value={form.tipo_negocio} onChange={(e) => set('tipo_negocio', e.target.value)}>
            <option value="">Selecione…</option>
            {TIPO_NEGOCIO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Input label="Valor pretendido (R$)" className="num" value={form.valor_pretendido} onChange={(e) => set('valor_pretendido', e.target.value)} placeholder="450000" />
          <Input label="Região de interesse" value={form.regiao_interesse} onChange={(e) => set('regiao_interesse', e.target.value)} placeholder="Zona Sul, Centro" />
          <Select label="Status de aprovação" value={form.status_aprovacao} onChange={(e) => set('status_aprovacao', e.target.value)}>
            {STATUS_APROVACAO.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
          {/* Papel, ao lado dos dados da pessoa: um proprietário pode também estar
              comprando, então isto NÃO é o tipo de negócio dele — acumula com ele. */}
          <label className="flex items-center gap-2 text-[13px] text-ink sm:col-span-2">
            <input
              type="checkbox"
              checked={form.proprietario}
              onChange={(e) => setBool('proprietario', e.target.checked)}
              className="h-4 w-4"
            />
            É proprietário de imóvel na carteira
          </label>
          <Textarea wrapperClassName="sm:col-span-2" label="Observações" rows={2} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Ações rápidas, como no original. */}
          <div className="flex flex-wrap gap-2">
            <AcaoRapida href={cliente?.telefone ? waLink(cliente.telefone) : null} icone={<MessageCircle size={14} strokeWidth={1.8} />} label="WhatsApp" />
            <AcaoRapida href={cliente?.telefone ? `tel:${soDigitos(cliente.telefone)}` : null} icone={<Phone size={14} strokeWidth={1.8} />} label="Ligar" />
            <AcaoRapida href={cliente?.email ? `mailto:${cliente.email}` : null} icone={<Mail size={14} strokeWidth={1.8} />} label="E-mail" />
            <span className="ml-auto"><Badge tone={st.tone}>{st.l}</Badge></span>
          </div>

          {/* Etapa do Pipeline */}
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-ink-2">Etapa do Pipeline</div>
            {leadId == null ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-bg px-3 py-2.5">
                <span className="text-[12.5px] text-ink-2">
                  Este cliente não está no funil, então não tem etapa nem score.
                </span>
                <Button size="sm" variant="outline" loading={salvando} icon={<Link2 size={13} strokeWidth={1.8} />} onClick={vincularAoFunil}>
                  Colocar no funil
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {etapas.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => moverEtapa(e.id)}
                    className={`rounded-control border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                      etapaAtual === e.id ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:bg-bg'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sub-abas */}
          <div className="flex items-center justify-between gap-3 border-b border-line">
            <div className="flex gap-5">
              {([['dados', 'Dados'], ['imovel', 'Imóvel de Interesse'], ['historico', 'Histórico']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setAba(id)}
                  className={`-mb-px border-b-2 pb-2 text-[12.5px] font-semibold transition-colors ${
                    aba === id ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {aba === 'dados' && (
              <Button size="sm" variant="ghost" icon={<Pencil size={13} strokeWidth={1.8} />} onClick={() => setEditando(true)}>Editar</Button>
            )}
          </div>

          {aba === 'dados' && (
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Campo rotulo="Telefone" valor={cliente?.telefone} num />
              <Campo rotulo="E-mail" valor={cliente?.email} />
              <Campo rotulo="Corretor" valor={jornada?.corretorNome} />
              <Campo rotulo="Origem" valor={cliente?.origem_cliente} />
              <Campo rotulo="Valor pretendido" valor={cliente?.valor_pretendido ? formatCurrency(Number(cliente.valor_pretendido)) : null} num />
              <Campo rotulo="Região" valor={cliente?.regiao_interesse} />
              <Campo rotulo="Etapa" valor={jornada?.etapaLabel} />
              <Campo rotulo="Cadastro" valor={formatarData(cliente?.created_at ?? null, { day: '2-digit', month: '2-digit', year: 'numeric' }, '—')} num />
              {cliente?.observacoes && (
                <div className="sm:col-span-2">
                  <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">Observações</div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink">{cliente.observacoes}</p>
                </div>
              )}
              <div className="sm:col-span-2 flex items-center gap-2 border-t border-line-soft pt-3">
                <span className="text-[12px] text-ink-2">Lead Score:</span>
                {jornada?.score != null
                  ? <Badge tone={jornada.score >= 65 ? 'bad' : jornada.score >= 35 ? 'warn' : 'neutro'}>{jornada.score}</Badge>
                  : <span className="text-[12px] text-ink-3">sem lead no funil</span>}
              </div>
            </div>
          )}

          {aba === 'imovel' && (
            <PreferenciasImovel
              prefs={prefs}
              editando={editandoPrefs}
              onEditar={() => setEditandoPrefs(true)}
              onCancelar={() => setEditandoPrefs(false)}
              onSalvar={async (dados) => {
                if (!cliente?.id) return
                const payload = { ...dados, cliente_id: cliente.id, lead_id: leadId, ativo: true }
                const { data: emp } = await supabase.rpc('get_empresa_id')
                const { error } = prefs?.id
                  ? await supabase.from('lead_perfil_busca').update(payload as never).eq('id', prefs.id)
                  : await supabase.from('lead_perfil_busca').insert({ ...payload, empresa_id: emp } as never)
                if (error) { notify.bad('Não foi possível salvar', error.message); return }
                notify.ok('Preferências salvas')
                setEditandoPrefs(false)
                const { data: pf } = await supabase.from('lead_perfil_busca')
                  .select('id, preco_min, preco_max, cidades, bairros, tipos, quartos_min, quartos_max, suites_min, vagas_min, area_min, area_max, caracteristicas, observacoes')
                  .eq('cliente_id', cliente.id).limit(1).maybeSingle()
                setPrefs((pf ?? null) as Preferencias | null)
              }}
            />
          )}

          {aba === 'historico' && (
            <div>
              {historico === null ? (
                <p className="py-6 text-center text-[12.5px] text-ink-3">Carregando…</p>
              ) : historico.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-3">Nenhuma interação registrada</p>
              ) : (
                <div className="divide-y divide-line-soft">
                  {historico.map((h, i) => {
                    const Icone = ICONE_HISTORICO[h.tipo]
                    return (
                      <div key={i} className="flex items-start gap-3 py-2.5">
                        <Icone size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium text-ink">{h.titulo}</span>
                          {h.detalhe && <span className="block truncate text-[11.5px] text-ink-3">{h.detalhe}</span>}
                        </span>
                        <span className="num shrink-0 text-[11.5px] text-ink-3">
                          {formatarData(h.quando, { day: '2-digit', month: '2-digit', year: '2-digit' }, '')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function AcaoRapida({ href, icone, label }: { href: string | null; icone: React.ReactNode; label: string }) {
  const classe = `inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
    href ? 'text-ink-2 hover:text-ink' : 'pointer-events-none opacity-40'
  }`
  return (
    <a href={href ?? '#'} target="_blank" rel="noopener noreferrer" className={classe} aria-disabled={!href}>
      {icone}{label}
    </a>
  )
}

function Campo({ rotulo, valor, num = false }: { rotulo: string; valor?: string | null; num?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">{rotulo}</div>
      <div className={`text-[13px] text-ink ${num ? 'num' : ''}`}>{valor || '—'}</div>
    </div>
  )
}

/** Ficha "Preferências de Imóvel" — os 10 tipos e as 15 características do modelo. */
function PreferenciasImovel({ prefs, editando, onEditar, onCancelar, onSalvar }: {
  prefs: Preferencias | null
  editando: boolean
  onEditar: () => void
  onCancelar: () => void
  onSalvar: (dados: Record<string, unknown>) => Promise<void>
}) {
  const [f, setF] = useState(() => ({
    preco_min: prefs?.preco_min != null ? String(prefs.preco_min) : '',
    preco_max: prefs?.preco_max != null ? String(prefs.preco_max) : '',
    locais: [...(prefs?.bairros ?? []), ...(prefs?.cidades ?? [])].join(', '),
    tipos: prefs?.tipos ?? [],
    quartos_min: prefs?.quartos_min != null ? String(prefs.quartos_min) : '',
    quartos_max: prefs?.quartos_max != null ? String(prefs.quartos_max) : '',
    suites_min: prefs?.suites_min != null ? String(prefs.suites_min) : '',
    vagas_min: prefs?.vagas_min != null ? String(prefs.vagas_min) : '',
    area_min: prefs?.area_min != null ? String(prefs.area_min) : '',
    area_max: prefs?.area_max != null ? String(prefs.area_max) : '',
    caracteristicas: prefs?.caracteristicas ?? [],
    observacoes: prefs?.observacoes ?? '',
  }))
  const [salvando, setSalvando] = useState(false)

  const alternar = (campo: 'tipos' | 'caracteristicas', valor: string) =>
    setF((x) => ({
      ...x,
      [campo]: x[campo].includes(valor) ? x[campo].filter((v) => v !== valor) : [...x[campo], valor],
    }))

  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')))

  const temAlgo = useMemo(() => {
    if (!prefs) return false
    return !!(prefs.preco_min || prefs.preco_max || prefs.tipos?.length || prefs.caracteristicas?.length ||
      prefs.bairros?.length || prefs.cidades?.length || prefs.quartos_min || prefs.observacoes)
  }, [prefs])

  if (!editando) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Home size={14} strokeWidth={1.8} className="text-accent" />Preferências de Imóvel
          </span>
          <Button size="sm" variant="ghost" icon={<Pencil size={13} strokeWidth={1.8} />} onClick={onEditar}>Editar</Button>
        </div>
        {!temAlgo ? (
          <div className="py-8 text-center">
            <p className="text-[13px] text-ink-3">Nenhuma preferência cadastrada</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={onEditar}>Adicionar preferências</Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Campo rotulo="Faixa de preço" num valor={
                prefs!.preco_min || prefs!.preco_max
                  ? `${prefs!.preco_min ? formatCurrency(Number(prefs!.preco_min)) : '—'} a ${prefs!.preco_max ? formatCurrency(Number(prefs!.preco_max)) : '—'}`
                  : null
              } />
              <Campo rotulo="Localizações" valor={[...(prefs!.bairros ?? []), ...(prefs!.cidades ?? [])].join(', ') || null} />
              <Campo rotulo="Quartos" num valor={prefs!.quartos_min || prefs!.quartos_max ? `${prefs!.quartos_min ?? '—'} a ${prefs!.quartos_max ?? '—'}` : null} />
              <Campo rotulo="Suítes / Vagas" num valor={
                prefs!.suites_min || prefs!.vagas_min ? `${prefs!.suites_min ?? 0} suíte(s) · ${prefs!.vagas_min ?? 0} vaga(s)` : null
              } />
              <Campo rotulo="Área (m²)" num valor={prefs!.area_min || prefs!.area_max ? `${prefs!.area_min ?? '—'} a ${prefs!.area_max ?? '—'}` : null} />
            </div>
            {!!prefs!.tipos?.length && (
              <Chips titulo="Tipos de imóvel" itens={prefs!.tipos} />
            )}
            {!!prefs!.caracteristicas?.length && (
              <Chips titulo="Características desejadas" itens={prefs!.caracteristicas} />
            )}
            {prefs!.observacoes && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">Observações</div>
                <p className="text-[13px] leading-snug text-ink">{prefs!.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Home size={14} strokeWidth={1.8} className="text-accent" />Preferências de Imóvel
        </span>
        <span className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button
            size="sm"
            loading={salvando}
            onClick={async () => {
              setSalvando(true)
              /**
               * "Localizações" é um campo só na tela e duas colunas no banco.
               *
               * O match cruza BAIRRO e CIDADE separados; obrigar o corretor a decidir
               * em qual caixa "Zona Sul" entra é atrito. Gravamos em `bairros`, que é
               * o mais específico, e a cidade continua vindo do imóvel.
               */
              const locais = f.locais.split(',').map((x) => x.trim()).filter(Boolean)
              await onSalvar({
                preco_min: num(f.preco_min), preco_max: num(f.preco_max),
                bairros: locais, cidades: [],
                tipos: f.tipos,
                quartos_min: num(f.quartos_min), quartos_max: num(f.quartos_max),
                suites_min: num(f.suites_min), vagas_min: num(f.vagas_min),
                area_min: num(f.area_min), area_max: num(f.area_max),
                caracteristicas: f.caracteristicas,
                observacoes: f.observacoes.trim() || null,
              })
              setSalvando(false)
            }}
          >
            Salvar
          </Button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Valor mínimo (R$)" className="num" value={f.preco_min} onChange={(e) => setF({ ...f, preco_min: e.target.value })} placeholder="Ex: 200000" />
        <Input label="Valor máximo (R$)" className="num" value={f.preco_max} onChange={(e) => setF({ ...f, preco_max: e.target.value })} placeholder="Ex: 500000" />
      </div>
      <Input
        label="Localizações de interesse"
        value={f.locais}
        onChange={(e) => setF({ ...f, locais: e.target.value })}
        placeholder="Zona Sul, Centro"
        hint="Separe por vírgula."
      />

      <Selecionaveis titulo="Tipos de imóvel" opcoes={TIPOS_IMOVEL} marcados={f.tipos} onToggle={(v) => alternar('tipos', v)} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Input label="Quartos (mín)" className="num" value={f.quartos_min} onChange={(e) => setF({ ...f, quartos_min: e.target.value })} />
        <Input label="Quartos (máx)" className="num" value={f.quartos_max} onChange={(e) => setF({ ...f, quartos_max: e.target.value })} />
        <Input label="Suítes (mín)" className="num" value={f.suites_min} onChange={(e) => setF({ ...f, suites_min: e.target.value })} />
        <Input label="Vagas (mín)" className="num" value={f.vagas_min} onChange={(e) => setF({ ...f, vagas_min: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Área mínima (m²)" className="num" value={f.area_min} onChange={(e) => setF({ ...f, area_min: e.target.value })} />
        <Input label="Área máxima (m²)" className="num" value={f.area_max} onChange={(e) => setF({ ...f, area_max: e.target.value })} />
      </div>

      <Selecionaveis titulo="Características desejadas" opcoes={CARACTERISTICAS} marcados={f.caracteristicas} onToggle={(v) => alternar('caracteristicas', v)} />

      <Textarea label="Observações" rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} placeholder="Detalhes adicionais sobre o imóvel desejado…" />
    </div>
  )
}

function Chips({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-[0.05em] text-ink-3">{titulo}</div>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((i) => <Badge key={i} tone="neutro">{i}</Badge>)}
      </div>
    </div>
  )
}

function Selecionaveis({ titulo, opcoes, marcados, onToggle }: {
  titulo: string; opcoes: string[]; marcados: string[]; onToggle: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold text-ink-2">{titulo}</div>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const on = marcados.includes(o)
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`rounded-control border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink-2 hover:bg-bg'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}
