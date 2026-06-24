'use client'

import { useState, useEffect } from 'react'
import { Plug, Percent, Timer, Save, X, Link as LinkIcon, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
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
}

const WEBHOOK_URL = 'https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads'

const TABS = [
  { id: 'integracoes', label: 'Integrações',     Icon: Plug    },
  { id: 'taxas',       label: 'Taxas',            Icon: Percent },
  { id: 'sla',         label: 'SLA atendimento',  Icon: Timer   },
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

export function ConfiguracoesView({ evolution, official, instagram, messenger, taxas }: Props) {
  const [aba, setAba]       = useState('integracoes')
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
    if (!empresaId) { toast.error('Empresa não carregada'); return }
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
        if (error) { toast.error('Erro ao salvar taxas: ' + error.message); return }
      }
      toast.success('Taxas salvas com sucesso!')
    } finally { setSavingTaxas(false) }
  }

  async function salvarSLA() {
    if (!empresaId) { toast.error('Empresa não carregada'); return }
    setSavingSLA(true)
    try {
      const [verde, amarelo, vermelho] = slaValues
      const { error } = await supabase.from('configuracoes_sistema')
        .upsert({ empresa_id: empresaId, chave: 'sla_atendimento', valor: { verde, amarelo, vermelho } as unknown as Json }, { onConflict: 'empresa_id,chave' })
      if (error) { toast.error('Erro ao salvar SLA'); return }
      toast.success('Regras de SLA salvas!')
    } finally { setSavingSLA(false) }
  }

  const integracoes: IntegracaoCanal[] = [
    {
      id: 'whatsapp', nome: 'WhatsApp', color: '#25D366', provider: 'evolution',
      ativo: !!evolution?.ativo || !!official?.ativo,
      desc: evolution?.instance
        ? `Evolution API · instância ${evolution.instance}`
        : official?.phone_number_id
        ? 'Meta Cloud API · número oficial'
        : 'Conecte via Evolution API ou Meta Cloud',
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
      // Detecta qual provider está ativo
      const usaOficial = !!official?.ativo && !evolution?.ativo
      setWaProvider(usaOficial ? 'oficial' : 'evolution')
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
    toast.success('URL do webhook copiada!')
  }

  async function saveModal() {
    if (!modalCanal) return
    if (!empresaId) { toast.error('Empresa não carregada'); return }
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
      toast.success(`${modalCanal.nome} configurado!`)
      setModalCanal(null)
      setTimeout(() => location.reload(), 600)
    } catch {
      toast.error('Erro ao salvar')
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
    { label: 'Atraso crítico',   desc: 'Bolinha vermelha: SLA estourado',                color: '#F0656B', min: 60 },
  ]

  const inputCls = "w-full text-center bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] rounded-[9px] py-[9px] text-[13px] text-[#1F2A39] font-mono outline-none focus:border-[rgba(215,40,47,0.5)]"

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
      <div className="max-w-[980px] mx-auto animate-fade-up space-y-4">

        {/* Tabs */}
        <div className="flex gap-[5px] bg-white border border-[#16212E]/[0.08] rounded-[13px] p-[5px] w-max overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setAba(id)}
              className={cn('flex items-center gap-2 px-[16px] py-[9px] rounded-[9px] text-[13.5px] font-semibold transition-all whitespace-nowrap',
                aba === id ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white shadow-[0_4px_14px_rgba(215,40,47,0.35)]'
                           : 'text-[#788698] hover:text-[#16212E] hover:bg-[#16212E]/[0.04]')}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* ── INTEGRAÇÕES ── */}
        {aba === 'integracoes' && (
            <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px]">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#788698]">CANAIS DE ATENDIMENTO</div>
              <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px] mb-1">Integrações</h3>
              <p className="text-[12.5px] text-[#788698] mb-[18px]">
                WhatsApp via <strong className="text-[#16212E]">Evolution API</strong>; Instagram e Messenger via Meta.
                Conecte cada canal para a caixa de entrada unificada dos leads.
              </p>
              <div className="flex flex-col gap-3">
                {integracoes.map(i => (
                  <div key={i.id} className="flex items-center gap-[14px] p-[14px_16px] rounded-[14px] bg-[#16212E]/[0.04] border border-[#16212E]/[0.08]">
                    <svg width={28} height={28} viewBox="0 0 24 24" className="flex-none" style={{ color: i.color }}>{i.svg}</svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-[#1F2A39]">{i.nome}</div>
                      <div className="text-[11.5px] text-[#788698]">{i.desc}</div>
                    </div>
                    <span className="px-[11px] py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                      style={{ background: i.ativo ? 'rgba(52,211,153,0.13)' : 'rgba(107,124,146,0.18)', color: i.ativo ? '#34D399' : '#8A9BB0' }}>
                      {i.ativo ? 'Conectado' : 'Inativo'}
                    </span>
                    <button onClick={() => openModal(i)}
                      className="px-[14px] py-2 rounded-[10px] bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] text-[#16212E] text-[12.5px] font-semibold hover:bg-[#16212E]/[0.04] transition-colors whitespace-nowrap">
                      Configurar
                    </button>
                  </div>
                ))}
              </div>
            </div>
        )}

        {/* ── TAXAS ── */}
        {aba === 'taxas' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px]">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-[6px]">
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] text-[#788698]">MAQUININHA · % POR PARCELA</div>
                <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px]">Taxas de crédito e link</h3>
              </div>
              <button onClick={salvarTaxas} disabled={savingTaxas}
                className="flex items-center gap-2 px-5 py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13px] hover:-translate-y-[2px] transition-all shadow-[0_6px_18px_rgba(215,40,47,0.32)] disabled:opacity-50">
                <Save size={17} /> {savingTaxas ? 'Salvando...' : 'Salvar taxas'}
              </button>
            </div>
            <p className="text-[12.5px] text-[#788698] mb-4">
              Estes valores alimentam o <strong className="text-[#16212E]">PDV</strong> e o{' '}
              <strong className="text-[#16212E]">Simulador de Parcelas</strong> em tempo real.
            </p>
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid gap-3 px-1 pb-[10px] font-mono text-[9.5px] tracking-[0.1em] text-[#9AA7B6] border-b border-[#16212E]/[0.08]"
                  style={{ gridTemplateColumns: '.6fr 1fr 1fr 1fr' }}>
                  <div>PARCELAS</div>
                  <div className="text-center">VISA / MASTER (%)</div>
                  <div className="text-center">ELO / AMEX / OUTROS (%)</div>
                  <div className="text-center">LINK (%)</div>
                </div>
                {taxaRows.map(n => (
                  <div key={n} className="grid gap-3 items-center px-1 py-2 border-b border-[#16212E]/[0.08]"
                    style={{ gridTemplateColumns: '.6fr 1fr 1fr 1fr' }}>
                    <div className="text-[14px] font-bold text-[#16212E]">{n}x</div>
                    <input value={taxasVisa[n] ?? ''}   onChange={e => setTaxasVisa(v   => ({ ...v, [n]: e.target.value }))} placeholder="—" className={inputCls} />
                    <input value={taxasOutros[n] ?? ''} onChange={e => setTaxasOutros(v => ({ ...v, [n]: e.target.value }))} placeholder="—" className={inputCls} />
                    <input value={taxasLink[n] ?? ''}   onChange={e => setTaxasLink(v   => ({ ...v, [n]: e.target.value }))} placeholder="—" className={inputCls} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLA ── */}
        {aba === 'sla' && (
          <div className="bg-white border border-[#16212E]/[0.08] rounded-[20px] p-[24px_26px]">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-[6px]">
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] text-[#788698]">TEMPO DE RESPOSTA · LEADS</div>
                <h3 className="font-serif font-medium text-[20px] text-[#16212E] mt-[5px]">SLA de atendimento</h3>
              </div>
              <button onClick={salvarSLA} disabled={savingSLA}
                className="flex items-center gap-2 px-5 py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13px] hover:-translate-y-[2px] transition-all shadow-[0_6px_18px_rgba(215,40,47,0.32)] disabled:opacity-50">
                <Save size={17} /> {savingSLA ? 'Salvando...' : 'Salvar regras'}
              </button>
            </div>
            <p className="text-[12.5px] text-[#788698] mb-[18px] leading-[1.5]">
              Define a cor da <strong className="text-[#16212E]">bolinha de status</strong> em cada card de lead no Kanban,
              conforme o tempo de espera sem resposta.
            </p>
            <div className="flex flex-col gap-3">
              {slaRows.map((s, i) => (
                <div key={i} className="flex items-center gap-4 p-[16px_18px] rounded-[14px] bg-[#16212E]/[0.04] border border-[#16212E]/[0.08]">
                  <span className="w-[16px] h-[16px] rounded-full flex-none" style={{ background: s.color, boxShadow: `0 0 12px ${s.color}` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[#1F2A39]">{s.label}</div>
                    <div className="text-[11.5px] text-[#788698]">{s.desc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={slaValues[i]} onChange={e => setSlaValues(v => v.map((x, j) => j === i ? Number(e.target.value) : x))} className="w-[64px] text-center bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] rounded-[9px] py-[9px] text-[13px] text-[#1F2A39] font-mono outline-none focus:border-[rgba(215,40,47,0.5)]" />
                    <span className="text-[12px] text-[#788698]">min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL CONFIGURAR ── */}
      {modalCanal && (
        <div onClick={() => setModalCanal(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center p-6" style={{ background: 'rgba(5,9,16,0.62)' }}>
          <div onClick={e => e.stopPropagation()}
            className="w-[480px] max-w-[94vw] max-h-[90vh] overflow-y-auto scrollbar-thin p-6 rounded-[18px]"
            style={{ background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', animation: 'popIn 0.3s ease' }}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center flex-none" style={{ background: modalCanal.color + '22' }}>
                  <svg width={26} height={26} viewBox="0 0 24 24" style={{ color: modalCanal.color }}>{modalCanal.svg}</svg>
                </div>
                <div>
                  <h3 className="font-serif font-medium text-[20px] text-[#16212E]">Configurar {modalCanal.nome}</h3>
                  <div className="text-[12px] text-[#7E8EA2] mt-[2px]">
                    {modalCanal.id === 'whatsapp'
                      ? (waProvider === 'evolution' ? 'Evolution API' : 'Meta Cloud API (oficial)')
                      : 'Meta Cloud API'}
                  </div>
                </div>
              </div>
              <button onClick={() => setModalCanal(null)}
                className="w-[34px] h-[34px] rounded-[9px] bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] text-[#9FB0C2] flex items-center justify-center flex-none hover:bg-[#16212E]/[0.04] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Seletor de provider — só WhatsApp */}
            {modalCanal.id === 'whatsapp' && (
              <div className="flex gap-2 mb-4 p-1 bg-[#16212E]/[0.04] rounded-[11px] border border-[#16212E]/[0.08]">
                {([
                  { k: 'evolution', label: 'Evolution API', tag: 'Legado' },
                  { k: 'oficial',   label: 'API Oficial',   tag: 'Recomendado' },
                ] as const).map(opt => (
                  <button key={opt.k} onClick={() => setWaProvider(opt.k)}
                    className={cn('flex-1 flex items-center justify-center gap-2 py-[9px] rounded-[8px] text-[12.5px] font-semibold transition-all',
                      waProvider === opt.k ? 'bg-[#16212E]/[0.04] text-[#16212E]' : 'text-[#788698] hover:text-[#16212E]')}>
                    {opt.label}
                    <span className="text-[9px] font-mono px-[6px] py-[2px] rounded-full"
                      style={{ background: opt.k === 'oficial' ? 'rgba(52,211,153,0.15)' : 'rgba(244,183,64,0.15)',
                               color: opt.k === 'oficial' ? '#34D399' : '#F4B740' }}>
                      {opt.tag}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {(PROVIDER_FIELDS[modalCanal.id === 'whatsapp' ? waProvider : modalCanal.provider]).map(f => (
                <div key={f.key}>
                  <label className="font-mono text-[10px] tracking-[0.12em] text-[#788698] uppercase mb-[6px] block">{f.label}</label>
                  <input value={modalValues[f.key] ?? ''} placeholder={f.placeholder}
                    onChange={e => setModalValues(v => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full bg-[#16212E]/[0.04] border border-[#16212E]/[0.08] rounded-[10px] px-3 py-[10px] text-[13px] text-[#1F2A39] placeholder:text-[#9AA7B6] outline-none focus:border-[rgba(215,40,47,0.5)] transition-colors" />
                </div>
              ))}
            </div>

            {/* Webhook URL */}
            <div className="mt-[18px] p-[14px_16px] rounded-[13px]" style={{ background: 'rgba(127,176,232,0.06)', border: '1px solid rgba(127,176,232,0.18)' }}>
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon size={16} className="text-[#9CC2EE]" />
                <span className="font-mono text-[10px] tracking-[0.12em] text-[#9CC2EE]">URL DO WEBHOOK</span>
              </div>
              <div className="flex items-center gap-[10px]">
                <code className="flex-1 min-w-0 font-mono text-[12px] text-[#1F2A39] bg-[#16212E]/[0.06] border border-[#16212E]/[0.08] rounded-[8px] px-3 py-[9px] overflow-x-auto whitespace-nowrap">
                  {WEBHOOK_URL}
                </code>
                <button onClick={copyWebhook}
                  className="flex items-center gap-[6px] px-[13px] py-[9px] rounded-[9px] border border-[#16212E]/[0.08] bg-[#16212E]/[0.04] text-[#16212E] text-[12px] font-semibold hover:bg-[#16212E]/[0.04] transition-colors flex-none">
                  <Copy size={14} /> Copiar
                </button>
              </div>
              <p className="text-[11px] text-[#7E8EA2] mt-2">
                Configure esta URL no painel do {modalCanal.provider === 'evolution' ? 'Evolution' : 'Meta'} para receber as mensagens.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalCanal(null)}
                className="flex-1 py-[11px] rounded-[11px] border border-[#16212E]/[0.08] bg-[#16212E]/[0.04] text-[#16212E] font-semibold text-[13.5px] hover:bg-[#16212E]/[0.04] transition-colors">
                Cancelar
              </button>
              <button onClick={saveModal} disabled={saving}
                className="flex-1 py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13.5px] hover:-translate-y-[1px] transition-all disabled:opacity-40 shadow-[0_6px_18px_rgba(215,40,47,0.32)]">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
