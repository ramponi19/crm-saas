'use client'

import { useState } from 'react'
import { Plug, Percent, Timer, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EvolutionCard } from './evolution-card'
import { OfficialCard } from './official-card'
import { DadosLojaCard } from './dados-loja-card'
import type { EvolutionConfig, OfficialConfig } from '@/lib/whatsapp/types'

interface Props {
  evolution: EvolutionConfig | null
  official: OfficialConfig | null
  dadosLoja: any
  preferencias: any
  taxas: Array<{ forma_pagamento: string; parcelas: number; percentual_taxa: number }>
}

const TABS = [
  { id: 'integracoes', label: 'Integrações',     Icon: Plug    },
  { id: 'taxas',       label: 'Taxas',            Icon: Percent },
  { id: 'sla',         label: 'SLA atendimento',  Icon: Timer   },
]

// Canais de atendimento (status real virá das configs salvas)
function buildIntegracoes(evolution: EvolutionConfig | null, official: OfficialConfig | null) {
  return [
    {
      nome: 'WhatsApp', color: '#25D366',
      ativo: !!evolution?.ativo || !!official?.ativo,
      desc: evolution?.instance
        ? `Evolution API · instância ${evolution.instance}`
        : official?.phone_number_id
        ? 'Meta Cloud API · número oficial'
        : 'Não configurado — conecte via Evolution ou Meta',
      svg: <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-1.14.07-1.84-.12-.42-.13-.97-.31-1.66-.61-2.93-1.27-4.85-4.22-5-4.42-.15-.2-1.2-1.59-1.2-3.03 0-1.44.76-2.15 1.02-2.44.27-.29.59-.37.79-.37.2 0 .39 0 .57.01.18.01.43-.07.67.51.24.6.83 2.04.9 2.19.07.15.12.32.02.51-.09.2-.14.32-.27.49-.14.17-.29.38-.41.51-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.12.59-.07.16-.2.68-.79.86-1.06.18-.27.36-.22.61-.13.25.09 1.58.74 1.86.88.27.14.46.2.52.31.07.12.07.66-.17 1.34z" fill="currentColor"/>,
    },
    {
      nome: 'Instagram Direct', color: '#E1487B', ativo: false,
      desc: 'Meta · conecte a conta @ comercial',
      svg: <><rect x="2" y="2" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/></>,
    },
    {
      nome: 'Messenger', color: '#3B9BFF', ativo: false,
      desc: 'Meta · conecte a página do Facebook',
      svg: <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.53-.04 1.91.53 3.92.5 5.81-.07C20.36 19.85 22 16.04 22 11.7 22 6.13 17.64 2 12 2z" fill="currentColor"/>,
    },
  ]
}

export function ConfiguracoesView({ evolution, official, dadosLoja, preferencias, taxas }: Props) {
  const [aba, setAba] = useState('integracoes')
  const integracoes = buildIntegracoes(evolution, official)

  // Monta linhas de taxas 1-18 com crédito (maquininha) e link
  const credMap = Object.fromEntries(
    taxas.filter(t => t.forma_pagamento === 'maquininha').map(t => [t.parcelas, t.percentual_taxa])
  )
  const linkMap = Object.fromEntries(
    taxas.filter(t => t.forma_pagamento === 'link').map(t => [t.parcelas, t.percentual_taxa])
  )
  const maxParc = Math.max(18, ...taxas.map(t => t.parcelas))
  const taxaRows = Array.from({ length: maxParc }, (_, i) => i + 1).map(n => ({
    n, cred: credMap[n], link: linkMap[n],
  }))

  // SLA — espelha o modelo
  const slaRows = [
    { label: 'Resposta ideal',  desc: 'Lead respondido dentro deste tempo fica verde', color: '#34D399', min: 15 },
    { label: 'Alerta de atraso', desc: 'Bolinha amarela: atenção, lead esperando',      color: '#F4B740', min: 30 },
    { label: 'Atraso crítico',   desc: 'Bolinha vermelha: SLA estourado',                color: '#F0656B', min: 60 },
  ]

  const fmtPct = (v?: number) => v != null ? `${v.toFixed(2).replace('.', ',')}%` : '—'
  const inputCls = "w-full text-center bg-white/[0.04] border border-white/[0.08] rounded-[9px] py-[9px] text-[13px] text-[#E9EEF4] font-mono outline-none focus:border-[rgba(215,40,47,0.5)]"

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin px-[30px] py-7">
      <div className="max-w-[980px] mx-auto animate-fade-up space-y-4">

        {/* Tabs */}
        <div className="flex gap-[5px] bg-[#0E1A2B] border border-white/[0.06] rounded-[13px] p-[5px] w-max overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setAba(id)}
              className={cn(
                'flex items-center gap-2 px-[16px] py-[9px] rounded-[9px] text-[13.5px] font-semibold transition-all whitespace-nowrap',
                aba === id
                  ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white shadow-[0_4px_14px_rgba(215,40,47,0.35)]'
                  : 'text-[#6B7C92] hover:text-[#C4CCD6] hover:bg-white/[0.04]'
              )}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* ── INTEGRAÇÕES ── */}
        {aba === 'integracoes' && (
          <div className="space-y-4">
            <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">CANAIS DE ATENDIMENTO</div>
              <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px] mb-1">Integrações</h3>
              <p className="text-[12.5px] text-[#8A9BB0] mb-[18px]">
                WhatsApp via <strong className="text-[#C4CCD6]">Evolution API</strong>; Instagram e Messenger via Meta.
                Conecte cada canal para a caixa de entrada unificada dos leads.
              </p>
              <div className="flex flex-col gap-3">
                {integracoes.map((i, idx) => (
                  <div key={idx} className="flex items-center gap-[14px] p-[14px_16px] rounded-[14px] bg-white/[0.03] border border-white/[0.06]">
                    <svg width={28} height={28} viewBox="0 0 24 24" className="flex-none" style={{ color: i.color }}>{i.svg}</svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold text-[#E9EEF4]">{i.nome}</div>
                      <div className="text-[11.5px] text-[#6B7C92]">{i.desc}</div>
                    </div>
                    <span className="px-[11px] py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                      style={{
                        background: i.ativo ? 'rgba(52,211,153,0.13)' : 'rgba(107,124,146,0.18)',
                        color: i.ativo ? '#34D399' : '#8A9BB0',
                      }}>
                      {i.ativo ? 'Conectado' : 'Inativo'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cards de config WhatsApp existentes */}
            <EvolutionCard config={evolution} onSaved={() => location.reload()} />
            <OfficialCard config={official} onSaved={() => location.reload()} />
            <DadosLojaCard config={dadosLoja} onSaved={() => location.reload()} />
          </div>
        )}

        {/* ── TAXAS ── */}
        {aba === 'taxas' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-[6px]">
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">MAQUININHA · % POR PARCELA</div>
                <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px]">Taxas de crédito e link</h3>
              </div>
              <button className="flex items-center gap-2 px-5 py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13px] hover:-translate-y-[2px] transition-all shadow-[0_6px_18px_rgba(215,40,47,0.32)]">
                <Save size={17} /> Salvar taxas
              </button>
            </div>
            <p className="text-[12.5px] text-[#8A9BB0] mb-4">
              Estes valores alimentam o <strong className="text-[#C4CCD6]">PDV</strong> e o{' '}
              <strong className="text-[#C4CCD6]">Simulador de Parcelas</strong> em tempo real.
            </p>
            <div className="grid gap-3 px-1 pb-[10px] font-mono text-[9.5px] tracking-[0.1em] text-[#4F6178] border-b border-white/[0.06]"
              style={{ gridTemplateColumns: '.8fr 1fr 1fr' }}>
              <div>PARCELAS</div>
              <div className="text-center">CRÉDITO (%)</div>
              <div className="text-center">LINK (%)</div>
            </div>
            {taxaRows.map(t => (
              <div key={t.n} className="grid gap-3 items-center px-1 py-2 border-b border-white/[0.04]"
                style={{ gridTemplateColumns: '.8fr 1fr 1fr' }}>
                <div className="text-[14px] font-bold text-[#F4F6F9]">{t.n}x</div>
                <input defaultValue={t.cred != null ? t.cred.toFixed(2).replace('.', ',') : ''}
                  placeholder="—" className={inputCls} />
                <input defaultValue={t.link != null ? t.link.toFixed(2).replace('.', ',') : ''}
                  placeholder="—" className={inputCls} />
              </div>
            ))}
          </div>
        )}

        {/* ── SLA ── */}
        {aba === 'sla' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[20px] p-[24px_26px]">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-[6px]">
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] text-[#6B7C92]">TEMPO DE RESPOSTA · LEADS</div>
                <h3 className="font-serif font-medium text-[20px] text-[#F4F6F9] mt-[5px]">SLA de atendimento</h3>
              </div>
              <button className="flex items-center gap-2 px-5 py-[11px] rounded-[11px] bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white font-semibold text-[13px] hover:-translate-y-[2px] transition-all shadow-[0_6px_18px_rgba(215,40,47,0.32)]">
                <Save size={17} /> Salvar regras
              </button>
            </div>
            <p className="text-[12.5px] text-[#8A9BB0] mb-[18px] leading-[1.5]">
              Define a cor da <strong className="text-[#C4CCD6]">bolinha de status</strong> em cada card de lead no Kanban,
              conforme o tempo de espera sem resposta.
            </p>
            <div className="flex flex-col gap-3">
              {slaRows.map((s, i) => (
                <div key={i} className="flex items-center gap-4 p-[16px_18px] rounded-[14px] bg-white/[0.03] border border-white/[0.06]">
                  <span className="w-[16px] h-[16px] rounded-full flex-none"
                    style={{ background: s.color, boxShadow: `0 0 12px ${s.color}` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[#E9EEF4]">{s.label}</div>
                    <div className="text-[11.5px] text-[#6B7C92]">{s.desc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input defaultValue={s.min}
                      className="w-[64px] text-center bg-white/[0.04] border border-white/[0.08] rounded-[9px] py-[9px] text-[13px] text-[#E9EEF4] font-mono outline-none focus:border-[rgba(215,40,47,0.5)]" />
                    <span className="text-[12px] text-[#8A9BB0]">min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
