'use client'

import { useState, useEffect } from 'react'
import { Plug, Percent, Timer, Save, Link as LinkIcon, Copy, Wallet, MessageSquareText, Clock, Download, Bell, Ban, Zap, GitBranch } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Input, Button, Badge, Tabs, Modal, notify } from '@/components/ui'
import { MeiosPagamentoCard } from './meios-pagamento-card'
import { TemplatesCard } from './templates-card'
import { HorarioCard } from './horario-card'
import { ExportarDadosCard } from './exportar-dados-card'
import { NotificacoesCard } from './notificacoes-card'
import { MotivosPerdaCard } from './motivos-perda-card'
import { AutomacoesCard } from './automacoes-card'
import { FunisCard } from './funis-card'
import { PortaisCard } from './portais-card'
import { CardapioCard } from './cardapio-card'
import type { EvolutionConfig, OfficialConfig } from '@/lib/whatsapp/types'
import type { Json } from '@/types/database'

interface MetaConfig { ativo?: boolean; page_id?: string; access_token?: string }

interface Props {
  evolution: EvolutionConfig | null
  official: OfficialConfig | null
  instagram: MetaConfig | null
  messenger: MetaConfig | null
  dadosLoja: unknown
  preferencias: unknown
  taxas: Array<{ forma_pagamento: string; bandeira: string | null; parcelas: number; percentual_taxa: number }>
  segmento?: string | null
  slug?: string | null
}

const WEBHOOK_URL = 'https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads'

const TABS = [
  { id: 'integracoes', label: 'Integrações',     Icon: Plug    },
  { id: 'pagamentos',  label: 'Meios de pagamento', Icon: Wallet },
  { id: 'taxas',       label: 'Taxas',            Icon: Percent },
  { id: 'sla',         label: 'SLA atendimento',  Icon: Timer   },
  { id: 'funis',       label: 'Funis',            Icon: GitBranch },
  { id: 'motivos',     label: 'Motivos de perda', Icon: Ban     },
  { id: 'automacoes',  label: 'Automações',       Icon: Zap     },
  { id: 'horario',     label: 'Horário',          Icon: Clock   },
  { id: 'modelos',     label: 'Modelos WhatsApp', Icon: MessageSquareText },
  { id: 'notificacoes', label: 'Notificações',    Icon: Bell    },
  { id: 'dados',       label: 'Dados',            Icon: Download },
]

type Provider = 'evolution' | 'meta'

interface IntegracaoCanal {
  id: string
  nome: string
  color: string
  ativo: boolean
  desc: string
  provider: Provider
  svg: React.ReactNode
}

// Campos por provider (espelha o modelo)
const PROVIDER_FIELDS: Record<string, Array<{ key: string; label: string; placeholder: string }>> = {
  evolution: [
    { key: 'url',     label: 'URL da API',   placeholder: 'https://evo.suaempresa.com' },
    { key: 'inst',    label: 'Instância',    placeholder: 'jmstore-01' },
    { key: 'apikey',  label: 'API Key',      placeholder: '••••••••••••' },
  ],
  oficial: [
    { key: 'phone_number_id', label: 'Phone Number ID',          placeholder: '123456789012345' },
    { key: 'waba_id',         label: 'WABA ID',                  placeholder: '123456789012345' },
    { key: 'access_token',    label: 'Token de acesso permanente', placeholder: 'EAAxxxxx...' },
    { key: 'webhook_verify_token', label: 'Token de verificação do webhook', placeholder: 'um-token-secreto' },
  ],
  meta: [
    { key: 'pageid', label: 'ID da página / conta', placeholder: '1029384756' },
    { key: 'token',  label: 'Token de acesso',      placeholder: 'EAAB••••••••' },
  ],
}

const supabase = createClient()

export function ConfiguracoesView({ evolution, official, instagram, messenger, taxas, segmento, slug }: Props) {
  const [aba, setAba]       = useState('integracoes')
  const tabs = segmento === 'imobiliaria'
    ? [...TABS, { id: 'portais', label: 'Portais', Icon: LinkIcon }]
    : segmento === 'food'
    ? [...TABS, { id: 'cardapio', label: 'Cardápio', Icon: LinkIcon }]
    : TABS
  const [modalCanal, setModalCanal] = useState<IntegracaoCanal | null>(null)
  const [modalValues, setModalValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [waProvider, setWaProvider] = useState<'evolution' | 'oficial'>('evolution')
  const [empresaId, setEmpresaId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('empresa_usuarios').select('empresa_id').eq('usuario_id', user.id).eq('ativo', true).single()
        .then(({ data }) => { if (data) setEmpresaId(data.empresa_id) })
    })
  }, [])

  // Taxas — estado controlado (visa_master / outros / link)
  const [taxasVisa, setTaxasVisa] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {}
    taxas.filter(t => t.forma_pagamento === 'maquininha' && t.bandeira === 'visa_master').forEach(t => { m[t.parcelas] = t.percentual_taxa.toFixed(2).replace('.', ',') })
    return m
  })
  const [taxasOutros, setTaxasOutros] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {}
    taxas.filter(t => t.forma_pagamento === 'maquininha' && t.bandeira === 'outros').forEach(t => { m[t.parcelas] = t.percentual_taxa.toFixed(2).replace('.', ',') })
    return m
  })
  const [taxasLink, setTaxasLink] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {}
    taxas.filter(t => t.forma_pagamento === 'link').forEach(t => { m[t.parcelas] = t.percentual_taxa.toFixed(2).replace('.', ',') })
    return m
  })
  const [savingTaxas, setSavingTaxas] = useState(false)

  // SLA — estado controlado
  const [slaValues, setSlaValues] = useState([15, 30, 60])
  const [savingSLA, setSavingSLA] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'sla_atendimento').single()
      .then(({ data }) => {
        if (data?.valor && typeof data.valor === 'object') {
          const v = data.valor as { verde?: number; amarelo?: number; vermelho?: number }
          setSlaValues([v.verde ?? 15, v.amarelo ?? 30, v.vermelho ?? 60])
        }
      })
  }, [empresaId])

  async function salvarTaxas() {
    if (!empresaId) { notify.bad('Empresa não carregada'); return }
    const empresa_id = empresaId
    setSavingTaxas(true)
    try {

      await supabase.from('taxas_pagamento').delete().eq('empresa_id', empresa_id)

      const rows: Array<{ empresa_id: number; forma_pagamento: string; bandeira: string | null; parcelas: number; percentual_taxa: number; ativo: boolean }> = []
      for (let p = 1; p <= 18; p++) {
        const visa   = taxasVisa[p]   ? parseFloat(taxasVisa[p].replace(',', '.'))   : null
        const outros = taxasOutros[p] ? parseFloat(taxasOutros[p].replace(',', '.')) : null
        const link   = taxasLink[p]   ? parseFloat(taxasLink[p].replace(',', '.'))   : null
        if (visa   != null && !isNaN(visa))   rows.push({ empresa_id, forma_pagamento: 'maquininha', bandeira: 'visa_master', parcelas: p, percentual_taxa: visa,   ativo: true })
        if (outros != null && !isNaN(outros)) rows.push({ empresa_id, forma_pagamento: 'maquininha', bandeira: 'outros',      parcelas: p, percentual_taxa: outros, ativo: true })
        if (link   != null && !isNaN(link))   rows.push({ empresa_id, forma_pagamento: 'link',        bandeira: null,          parcelas: p, percentual_taxa: link,   ativo: true })
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('taxas_pagamento').insert(rows)
        if (error) { notify.bad('Erro ao salvar taxas: ' + error.message); return }
      }
      notify.ok('Taxas salvas com sucesso!')
    } finally { setSavingTaxas(false) }
  }

  async function salvarSLA() {
    if (!empresaId) { notify.bad('Empresa não carregada'); return }
    setSavingSLA(true)
    try {
      const [verde, amarelo, vermelho] = slaValues
      const { error } = await supabase.from('configuracoes_sistema')
        .upsert({ empresa_id: empresaId, chave: 'sla_atendimento', valor: { verde, amarelo, vermelho } as unknown as Json }, { onConflict: 'empresa_id,chave' })
      if (error) { notify.bad('Erro ao salvar SLA'); return }
      notify.ok('Regras de SLA salvas!')
    } finally { setSavingSLA(false) }
  }

  const integracoes: IntegracaoCanal[] = [
    {
      id: 'whatsapp', nome: 'WhatsApp', color: '#25D366', provider: 'evolution',
      ativo: !!evolution?.ativo || !!official?.ativo,
      desc: official?.phone_number_id
        ? 'Meta Cloud API · número oficial'
        : evolution?.instance
        ? 'Meta Cloud API · conectado'
        : 'Meta Cloud API · configure sua conta',
      svg: <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-1.14.07-1.84-.12-.42-.13-.97-.31-1.66-.61-2.93-1.27-4.85-4.22-5-4.42-.15-.2-1.2-1.59-1.2-3.03 0-1.44.76-2.15 1.02-2.44.27-.29.59-.37.79-.37.2 0 .39 0 .57.01.18.01.43-.07.67.51.24.6.83 2.04.9 2.19.07.15.12.32.02.51-.09.2-.14.32-.27.49-.14.17-.29.38-.41.51-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.12.59-.07.16-.2.68-.79.86-1.06.18-.27.36-.22.61-.13.25.09 1.58.74 1.86.88.27.14.46.2.52.31.07.12.07.66-.17 1.34z" fill="currentColor"/>,
    },
    {
      id: 'instagram', nome: 'Instagram Direct', color: '#E1487B', provider: 'meta',
      ativo: !!instagram?.ativo,
      desc: instagram?.page_id ? `Meta · página ${instagram.page_id}` : 'Meta · conecte a conta @ comercial',
      svg: <><rect x="2" y="2" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/></>,
    },
    {
      id: 'messenger', nome: 'Messenger', color: '#3B9BFF', provider: 'meta',
      ativo: !!messenger?.ativo,
      desc: messenger?.page_id ? `Meta · página ${messenger.page_id}` : 'Meta · conecte a página do Facebook',
      svg: <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.53-.04 1.91.53 3.92.5 5.81-.07C20.36 19.85 22 16.04 22 11.7 22 6.13 17.64 2 12 2z" fill="currentColor"/>,
    },
  ]

  function openModal(canal: IntegracaoCanal) {
    setModalCanal(canal)
    const init: Record<string, string> = {}
    if (canal.id === 'whatsapp') {
      setWaProvider('oficial')
      if (evolution) {
        init.url = evolution.api_url ?? ''
        init.inst = evolution.instance ?? ''
        init.apikey = evolution.api_key ?? ''
      }
      if (official) {
        init.phone_number_id = official.phone_number_id ?? ''
        init.waba_id = official.waba_id ?? ''
        init.access_token = official.access_token ?? ''
        init.webhook_verify_token = official.webhook_verify_token ?? ''
      }
    } else if (canal.provider === 'meta') {
      const cfg = canal.id === 'instagram' ? instagram : canal.id === 'messenger' ? messenger : null
      if (cfg) {
        init.pageid = cfg.page_id ?? ''
        init.token = cfg.access_token ?? ''
      }
    }
    setModalValues(init)
  }

  function copyWebhook() {
    navigator.clipboard?.writeText(WEBHOOK_URL)
    notify.ok('URL do webhook copiada!')
  }

  async function saveModal() {
    if (!modalCanal) return
    if (!empresaId) { notify.bad('Empresa não carregada'); return }
    setSaving(true)
    const upsert = (chave: string, valor: unknown) =>
      supabase.from('configuracoes_sistema')
        .upsert({ empresa_id: empresaId, chave, valor: valor as Json }, { onConflict: 'empresa_id,chave' })
    try {
      if (modalCanal.id === 'whatsapp') {
        if (waProvider === 'evolution') {
          const cfg: EvolutionConfig = {
            ativo: true,
            api_url: modalValues.url ?? '',
            api_key: modalValues.apikey ?? '',
            instance: modalValues.inst ?? '',
          }
          await upsert('whatsapp_evolution', cfg)
          if (official) await upsert('whatsapp_official', { ...official, ativo: false })
        } else {
          const cfg: OfficialConfig = {
            ativo: true,
            provider: 'meta',
            phone_number_id: modalValues.phone_number_id ?? '',
            waba_id: modalValues.waba_id ?? '',
            access_token: modalValues.access_token ?? '',
            webhook_verify_token: modalValues.webhook_verify_token ?? '',
            api_version: official?.api_version ?? 'v19.0',
            api_url: official?.api_url ?? 'https://graph.facebook.com',
          }
          await upsert('whatsapp_official', cfg)
          if (evolution) await upsert('whatsapp_evolution', { ...evolution, ativo: false })
        }
      } else {
        await upsert(`meta_${modalCanal.id}`, {
          ativo: true, page_id: modalValues.pageid ?? '', access_token: modalValues.token ?? '',
        })
      }
      notify.ok(`${modalCanal.nome} configurado!`)
      setModalCanal(null)
      setTimeout(() => location.reload(), 600)
    } catch {
      notify.bad('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // Taxas 1-18
  const maxParc = Math.max(18, ...taxas.map(t => t.parcelas ?? 1))
  const taxaRows = Array.from({ length: maxParc }, (_, i) => i + 1)

  const slaRows = [
    { label: 'Resposta ideal',   desc: 'Lead respondido dentro deste tempo fica verde', color: '#34D399', min: 15 },
    { label: 'Alerta de atraso', desc: 'Bolinha amarela: atenção, lead esperando',      color: '#F4B740', min: 30 },
    { label: 'Atraso crítico',   desc: 'Bolinha vermelha: SLA estourado',                color: '#DC2626', min: 60 },
  ]

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[980px] space-y-4">

        {/* Tabs */}
        <Tabs
          items={tabs.map(({ id, label, Icon }) => ({
            value: id,
            label: (
              <span className="flex items-center gap-2">
                <Icon size={15} strokeWidth={1.7} /> {label}
              </span>
            ),
          }))}
          value={aba}
          onValueChange={setAba}
        />

        {/* ── INTEGRAÇÕES ── */}
        {aba === 'integracoes' && (
          <Card title="Integrações">
            <p className="-mt-0.5 mb-[18px] text-[12.5px] text-ink-2">
              WhatsApp, Instagram e Messenger via <strong className="text-ink">Meta Cloud API</strong>.
              Conecte cada canal para a caixa de entrada unificada dos leads.
            </p>
            <div className="flex flex-col gap-3">
              {integracoes.map(i => (
                <div key={i.id} className="flex items-center gap-3.5 rounded-card border border-line bg-raised px-4 py-3.5">
                  <svg width={28} height={28} viewBox="0 0 24 24" className="flex-none" style={{ color: i.color }}>{i.svg}</svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-ink">{i.nome}</div>
                    <div className="text-[11.5px] text-ink-2">{i.desc}</div>
                  </div>
                  <Badge tone={i.ativo ? 'ok' : 'neutro'} dot>{i.ativo ? 'Conectado' : 'Inativo'}</Badge>
                  <Button variant="outline" size="sm" onClick={() => openModal(i)}>Configurar</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── MEIOS DE PAGAMENTO ── */}
        {aba === 'pagamentos' && <MeiosPagamentoCard />}

        {/* ── TAXAS ── */}
        {aba === 'taxas' && (
          <Card
            title="Taxas de crédito e link"
            actions={
              <Button onClick={salvarTaxas} loading={savingTaxas} icon={<Save size={15} strokeWidth={1.7} />}>
                {savingTaxas ? 'Salvando...' : 'Salvar taxas'}
              </Button>
            }
          >
            <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
              Estes valores alimentam o <strong className="text-ink">PDV</strong> e o{' '}
              <strong className="text-ink">Simulador de Parcelas</strong> em tempo real.
            </p>
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid gap-3 border-b border-line-soft px-1 pb-[10px] text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-3"
                  style={{ gridTemplateColumns: '.6fr 1fr 1fr 1fr' }}>
                  <div>Parcelas</div>
                  <div className="text-center">Visa / Master (%)</div>
                  <div className="text-center">Elo / Amex / Outros (%)</div>
                  <div className="text-center">Link (%)</div>
                </div>
                {taxaRows.map(n => (
                  <div key={n} className="grid items-center gap-3 border-b border-line-soft px-1 py-2"
                    style={{ gridTemplateColumns: '.6fr 1fr 1fr 1fr' }}>
                    <div className="text-[14px] font-bold text-ink">{n}x</div>
                    <Input value={taxasVisa[n] ?? ''}   onChange={e => setTaxasVisa(v   => ({ ...v, [n]: e.target.value }))} placeholder="—" className="text-center" />
                    <Input value={taxasOutros[n] ?? ''} onChange={e => setTaxasOutros(v => ({ ...v, [n]: e.target.value }))} placeholder="—" className="text-center" />
                    <Input value={taxasLink[n] ?? ''}   onChange={e => setTaxasLink(v   => ({ ...v, [n]: e.target.value }))} placeholder="—" className="text-center" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* ── SLA ── */}
        {aba === 'sla' && (
          <Card
            title="SLA de atendimento"
            actions={
              <Button onClick={salvarSLA} loading={savingSLA} icon={<Save size={15} strokeWidth={1.7} />}>
                {savingSLA ? 'Salvando...' : 'Salvar regras'}
              </Button>
            }
          >
            <p className="-mt-0.5 mb-[18px] text-[12.5px] leading-[1.5] text-ink-2">
              Define a cor da <strong className="text-ink">bolinha de status</strong> em cada card de lead no Kanban,
              conforme o tempo de espera sem resposta.
            </p>
            <div className="flex flex-col gap-3">
              {slaRows.map((s, i) => (
                <div key={i} className="flex items-center gap-4 rounded-card border border-line bg-raised px-[18px] py-4">
                  <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-ink">{s.label}</div>
                    <div className="text-[11.5px] text-ink-2">{s.desc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={slaValues[i]} onChange={e => setSlaValues(v => v.map((x, j) => j === i ? Number(e.target.value) : x))} className="w-[64px] text-center" />
                    <span className="text-[12px] text-ink-2">min</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── FUNIS ── */}
        {aba === 'funis' && <FunisCard />}

        {/* ── MOTIVOS DE PERDA ── */}
        {aba === 'motivos' && <MotivosPerdaCard />}

        {/* ── AUTOMAÇÕES ── */}
        {aba === 'automacoes' && <AutomacoesCard />}

        {/* ── HORÁRIO DE FUNCIONAMENTO ── */}
        {aba === 'horario' && <HorarioCard />}

        {/* ── MODELOS DE MENSAGEM ── */}
        {aba === 'modelos' && <TemplatesCard />}

        {/* ── NOTIFICAÇÕES (por usuário) ── */}
        {aba === 'notificacoes' && <NotificacoesCard />}

        {/* ── EXPORTAR DADOS ── */}
        {aba === 'dados' && <ExportarDadosCard />}
        {aba === 'portais' && <PortaisCard slug={slug ?? null} />}
        {aba === 'cardapio' && <CardapioCard slug={slug ?? null} />}

      </div>

      {/* ── MODAL CONFIGURAR ── */}
      {modalCanal && (
        <Modal
          open
          onClose={() => setModalCanal(null)}
          size="sm"
          title={
            <span className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-control" style={{ background: modalCanal.color + '22', color: modalCanal.color }}>
                <svg width={20} height={20} viewBox="0 0 24 24">{modalCanal.svg}</svg>
              </span>
              Configurar {modalCanal.nome}
            </span>
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalCanal(null)} disabled={saving}>Cancelar</Button>
              <Button onClick={saveModal} loading={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
            </>
          }
        >
          <div className="mb-3 text-[12px] text-ink-3">Meta Cloud API</div>

          {/* Seletor de provider — só WhatsApp */}
          {modalCanal.id === 'whatsapp' && (
            <div className="mb-4 flex items-center gap-2 rounded-control border border-line bg-raised px-3 py-2.5">
              <span className="text-[12.5px] font-semibold text-ink">API Oficial</span>
              <Badge tone="ok">Recomendado</Badge>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {(PROVIDER_FIELDS[modalCanal.id === 'whatsapp' ? waProvider : modalCanal.provider]).map(f => (
              <Input
                key={f.key}
                label={f.label}
                placeholder={f.placeholder}
                value={modalValues[f.key] ?? ''}
                onChange={e => setModalValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
            ))}
          </div>

          {/* Webhook URL */}
          <div className="mt-[18px] rounded-card border border-accent/20 bg-accent-soft px-4 py-3.5">
            <div className="mb-2 flex items-center gap-2">
              <LinkIcon size={16} strokeWidth={1.7} className="text-accent" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">URL do webhook</span>
            </div>
            <div className="flex items-center gap-2.5">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-control border border-line bg-bg px-3 py-2 text-[12px] text-ink-2">
                {WEBHOOK_URL}
              </code>
              <Button variant="outline" size="sm" icon={<Copy size={14} strokeWidth={1.7} />} onClick={copyWebhook}>Copiar</Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              Configure esta URL no painel da Meta para receber as mensagens.
            </p>
          </div>
        </Modal>
      )}
    </main>
  )
}
