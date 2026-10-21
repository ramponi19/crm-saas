'use client'

import { useState, useEffect } from 'react'
import { Percent, Timer, Save, Link as LinkIcon, Wallet, MessageSquareText, Clock, Download, Bell, Ban, Zap, GitBranch, FileText, ArrowLeftRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { Card, Input, Button, Tabs, notify } from '@/components/ui'
import { MeiosPagamentoCard } from './meios-pagamento-card'
import { TemplatesCard } from './templates-card'
import { AssinaturaCard } from './assinatura-card'
import { DevolucaoCard } from './devolucao-card'
import { HorarioCard } from './horario-card'
import { ExportarDadosCard } from './exportar-dados-card'
import { NotificacoesCard } from './notificacoes-card'
import { MotivosPerdaCard } from './motivos-perda-card'
import { AutomacoesCard } from './automacoes-card'
import { FunisCard } from './funis-card'
import { PortaisCard } from './portais-card'
import { CardapioCard } from './cardapio-card'
import { AgendamentoCard } from './agendamento-card'
import { VeiculosPortalCard } from './veiculos-portal-card'
import { ContratoCard } from './contrato-card'
import { TrocaCard } from './troca-card'
import type { Json } from '@/types/database'

interface Props {
  /** Canais ativos em canais_conectados, por tipo (sem token: ele não sai do servidor). */
  dadosLoja: unknown
  preferencias: unknown
  taxas: Array<{ forma_pagamento: string; bandeira: string | null; parcelas: number; percentual_taxa: number }>
  segmento?: string | null
  slug?: string | null
  /**
   * Aba fixa: a tela de Configurações (navegação nova, 21/10/2026) mostra cada aba
   * como seção própria, com o menu lateral dela no lugar desta barra de abas.
   */
  aba?: string
}


const TABS = [
  { id: 'pagamentos',  label: 'Meios de pagamento', Icon: Wallet },
  { id: 'taxas',       label: 'Taxas',            Icon: Percent },
  { id: 'sla',         label: 'SLA atendimento',  Icon: Timer   },
  { id: 'funis',       label: 'Funis',            Icon: GitBranch },
  { id: 'motivos',     label: 'Motivos de perda', Icon: Ban     },
  { id: 'automacoes',  label: 'Automações',       Icon: Zap     },
  { id: 'contrato',    label: 'Contrato',         Icon: FileText },
  { id: 'troca',       label: 'Troca',            Icon: ArrowLeftRight },
  { id: 'horario',     label: 'Horário',          Icon: Clock   },
  { id: 'modelos',     label: 'Modelos WhatsApp', Icon: MessageSquareText },
  { id: 'notificacoes', label: 'Notificações',    Icon: Bell    },
  { id: 'dados',       label: 'Dados',            Icon: Download },
]


const supabase = createClient()

export function ConfiguracoesView({ taxas, segmento, slug, aba: abaFixa }: Props) {
  /**
   * A aba pode vir na URL (`?aba=modelos`).
   *
   * Sem isso, qualquer tela que mande o lojista "editar os textos de mensagem" o
   * deixava na primeira aba, procurando um campo que está a doze abas de distância —
   * foi o que aconteceu com o link da Gestão de Leads.
   *
   * Integrações SAIU daqui (etapa 0): era um cartão de status apontando para
   * /admin/integracoes, onde o conector mora. `?aba=integracoes` responde 308 para
   * lá (next.config.ts).
   */
  const params = useSearchParams()
  const [abaEscolhida, setAba] = useState(params.get('aba') || 'pagamentos')
  const aba = abaFixa ?? abaEscolhida
  /**
   * As abas extra vêm do contrato, não de uma cascata de `if`.
   *
   * Eram quatro comparações aqui (imobiliária, food, saúde, concessionária), e
   * cada vertical nova acrescentava um degrau nessa escada — nesta tela, que todo
   * segmento abre. Agora o segmento declara em `abasExtraConfiguracoes` o que quer.
   *
   * O ícone fica AQUI e não no contrato de propósito: `lib/segmentos.ts` é
   * config, e importar componente de ícone ali o transformaria em código de tela.
   */
  const extras = SEGMENTOS[normalizarSegmento(segmento)].abasExtraConfiguracoes
  const tabs = extras.length
    ? [...TABS, ...extras.map((e) => ({ ...e, Icon: LinkIcon }))]
    : TABS
  const [empresaId, setEmpresaId] = useState<number | null>(null)

  useEffect(() => {
    empresaAtualId(supabase).then((id) => { if (id) setEmpresaId(id) })
  }, [])

  /**
   * Id da empresa na hora de salvar.
   *
   * A busca acima roda UMA vez; se falhar (rede oscilando, token renovando), o
   * estado fica nulo e todo botão de salvar passa a recusar com "Empresa não
   * carregada" até alguém dar F5 — e quem usa não tem como adivinhar isso.
   */
  async function garantirEmpresaId(): Promise<number | null> {
    if (empresaId) return empresaId
    const id = await empresaAtualId(supabase)
    if (id) setEmpresaId(id)
    return id
  }

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
    // `maybeSingle`: empresa que nunca salvou o SLA não tem esta linha — ausência é
    // o estado PADRÃO, não erro. Com `single()` a tela registrava um erro no console
    // a cada abertura, e ruído constante é o que faz ninguém mais olhar o console.
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'sla_atendimento').maybeSingle()
      .then(({ data }) => {
        if (data?.valor && typeof data.valor === 'object') {
          const v = data.valor as { verde?: number; amarelo?: number; vermelho?: number }
          setSlaValues([v.verde ?? 15, v.amarelo ?? 30, v.vermelho ?? 60])
        }
      })
  }, [empresaId])

  async function salvarTaxas() {
    const empId = await garantirEmpresaId()
    if (!empId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    const empresa_id = empId
    setSavingTaxas(true)
    try {
      const rows: Array<{ empresa_id: number; forma_pagamento: string; bandeira: string | null; parcelas: number; percentual_taxa: number; ativo: boolean }> = []
      for (let p = 1; p <= 18; p++) {
        const visa   = taxasVisa[p]   ? parseFloat(taxasVisa[p].replace(',', '.'))   : null
        const outros = taxasOutros[p] ? parseFloat(taxasOutros[p].replace(',', '.')) : null
        const link   = taxasLink[p]   ? parseFloat(taxasLink[p].replace(',', '.'))   : null
        if (visa   != null && !isNaN(visa))   rows.push({ empresa_id, forma_pagamento: 'maquininha', bandeira: 'visa_master', parcelas: p, percentual_taxa: visa,   ativo: true })
        if (outros != null && !isNaN(outros)) rows.push({ empresa_id, forma_pagamento: 'maquininha', bandeira: 'outros',      parcelas: p, percentual_taxa: outros, ativo: true })
        if (link   != null && !isNaN(link))   rows.push({ empresa_id, forma_pagamento: 'link',        bandeira: null,          parcelas: p, percentual_taxa: link,   ativo: true })
      }

      // Backup p/ rollback: DELETE+INSERT não é transacional no client. Se o insert
      // falhar, restauramos as taxas antigas — o PDV nunca fica sem taxas.
      const { data: backup } = await supabase.from('taxas_pagamento')
        .select('forma_pagamento, bandeira, parcelas, percentual_taxa, ativo').eq('empresa_id', empresa_id)

      await supabase.from('taxas_pagamento').delete().eq('empresa_id', empresa_id)

      if (rows.length > 0) {
        const { error } = await supabase.from('taxas_pagamento').insert(rows)
        if (error) {
          if (backup?.length) await supabase.from('taxas_pagamento').insert(backup.map((b) => ({ ...b, empresa_id })))
          notify.bad('Erro ao salvar taxas: ' + error.message); return
        }
      }
      notify.ok('Taxas salvas com sucesso!')
    } finally { setSavingTaxas(false) }
  }

  async function salvarSLA() {
    const empId = await garantirEmpresaId()
    if (!empId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    setSavingSLA(true)
    try {
      const [verde, amarelo, vermelho] = slaValues
      const { error } = await supabase.from('configuracoes_sistema')
        .upsert({ empresa_id: empId, chave: 'sla_atendimento', valor: { verde, amarelo, vermelho } as unknown as Json }, { onConflict: 'empresa_id,chave' })
      if (error) { notify.bad('Erro ao salvar SLA'); return }
      notify.ok('Regras de SLA salvas!')
    } finally { setSavingSLA(false) }
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
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[980px] space-y-4">

        {/* Tabs (só quando a tela não fixou a aba) */}
        {!abaFixa && <Tabs
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
        />}

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
                <div className="grid gap-3 border-b border-line-soft px-1 pb-[10px] text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3"
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
          <div className="space-y-4">
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
          <DevolucaoCard />
          </div>
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
        {aba === 'modelos' && (
          <div className="space-y-4">
            <AssinaturaCard />
            <TemplatesCard />
          </div>
        )}

        {/* ── NOTIFICAÇÕES (por usuário) ── */}
        {aba === 'notificacoes' && <NotificacoesCard />}

        {/* ── EXPORTAR DADOS ── */}
        {aba === 'dados' && <ExportarDadosCard />}
        {aba === 'portais' && <PortaisCard slug={slug ?? null} />}
        {aba === 'cardapio' && <CardapioCard slug={slug ?? null} />}
        {aba === 'agendamento' && <AgendamentoCard slug={slug ?? null} />}
        {aba === 'veiculos-portais' && <VeiculosPortalCard slug={slug ?? null} />}
        {aba === 'contrato' && <ContratoCard />}
        {aba === 'troca' && <TrocaCard />}

      </div>

    </main>
  )
}
