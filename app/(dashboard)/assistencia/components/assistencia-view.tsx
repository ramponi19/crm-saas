'use client'
import { useState, useMemo } from 'react'
import { Plus, Wrench } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, StatCard, Table, Tabs, Badge, Button, EmptyState, type Column } from '@/components/ui'
import OSModal from './os-modal'
import ServicosCatalogo, { type ServicoReparo } from './servicos-catalogo'

interface OS {
  id: number
  protocolo: string | null
  tipo: string | null
  status: string | null
  defeito_relatado: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  imei_serial: string | null
  dentro_garantia: boolean | null
  dias_garantia_restantes: number | null
  data_entrada: string | null
  created_at: string | null
  observacoes: string | null
  estado_entrada: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes: { nome: string; telefone: string | null } | null
  produtos: { nome: string } | null
}
interface Props { ordens: OS[]; servicos: ServicoReparo[] }

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  em_analise:           { label: 'Em análise',          tone: 'acc'    },
  aguardando_aprovacao: { label: 'Aguardando aprovação', tone: 'warn'  },
  aprovado:             { label: 'Aprovado',            tone: 'ok'     },
  em_reparo:            { label: 'Em reparo',           tone: 'warn'   },
  aguardando_peca:      { label: 'Aguardando peça',     tone: 'warn'   },
  pronto:               { label: 'Pronto p/ retirada',  tone: 'ok'     },
  concluido:            { label: 'Concluído',           tone: 'ok'     },
  entregue:             { label: 'Entregue',            tone: 'neutro' },
  reprovado:            { label: 'Reprovado',           tone: 'bad'    },
}

const ORIGEM: Record<string, { label: string; tone: Tone }> = {
  garantia:       { label: 'Garantia',       tone: 'ok'   },
  reparo_externo: { label: 'Reparo externo', tone: 'warn' },
}

const FILTROS = [
  { value: 'todas',           label: 'Todas'            },
  { value: 'em_analise',      label: 'Em análise'       },
  { value: 'em_reparo',       label: 'Em reparo'        },
  { value: 'aguardando_peca', label: 'Aguardando peça'  },
  { value: 'concluido',       label: 'Concluídas'       },
]

const ABAS = [
  { value: 'ordens', label: 'Ordens de serviço' },
  { value: 'servicos', label: 'Serviços de reparo' },
]

export default function AssistenciaView({ ordens, servicos }: Props) {
  const [aba, setAba] = useState('ordens')
  const [filtro, setFiltro] = useState('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<OS | null>(null)
  const [isNew, setIsNew] = useState(false)

  const stats = useMemo(() => ({
    emAnalise:      ordens.filter(o => o.status === 'em_analise').length,
    emReparo:       ordens.filter(o => o.status === 'em_reparo').length,
    aguardando:     ordens.filter(o => o.status === 'aguardando_peca').length,
    concluidasMes:  ordens.filter(o => o.status === 'concluido' || o.status === 'entregue').length,
  }), [ordens])

  const filtrados = useMemo(() =>
    filtro === 'todas' ? ordens : ordens.filter(o => o.status === filtro)
  , [ordens, filtro])

  function openNova() { setSelecionada(null); setIsNew(true); setModalOpen(true) }
  function openOS(o: OS) { setSelecionada(o); setIsNew(false); setModalOpen(true) }

  const cols: Column<OS>[] = [
    {
      key: 'os', header: 'OS', className: 'num',
      render: (o) => <span className="font-semibold text-ink">{o.protocolo ?? `#OS-${o.id}`}</span>,
    },
    {
      key: 'aparelho', header: 'Aparelho',
      render: (o) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{o.produtos?.nome ?? '—'}</div>
          {o.clientes?.nome && <div className="truncate text-[11px] text-ink-3">{o.clientes.nome}</div>}
        </div>
      ),
    },
    {
      key: 'origem', header: 'Origem', hideOnMobile: true,
      render: (o) => { const s = ORIGEM[o.dentro_garantia ? 'garantia' : 'reparo_externo']; return <Badge tone={s.tone}>{s.label}</Badge> },
    },
    { key: 'defeito', header: 'Defeito', hideOnMobile: true, render: (o) => <span className="text-ink-2">{o.defeito_relatado ?? '—'}</span> },
    { key: 'tecnico', header: 'Técnico', hideOnMobile: true, render: () => <span className="text-ink-3">—</span> },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (o) => { const s = STATUS[o.status ?? ''] ?? { label: o.status ?? '—', tone: 'neutro' as Tone }; return <Badge tone={s.tone}>{s.label}</Badge> },
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Assistência" />

      <main className="flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="space-y-4">
          <Tabs items={ABAS} value={aba} onValueChange={setAba} />

          {aba === 'ordens' && (
            <>
              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
                <StatCard bare label="Em análise" value={stats.emAnalise} />
                <StatCard bare label="Em reparo" value={stats.emReparo} />
                <StatCard bare label="Aguardando peça" value={stats.aguardando} />
                <StatCard bare label="Concluídas no mês" value={stats.concluidasMes} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs items={FILTROS} value={filtro} onValueChange={setFiltro} className="border-b-0" />
                <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={openNova}>Nova ordem de serviço</Button>
              </div>

              <Card flush>
                <Table
                  columns={cols}
                  rows={filtrados}
                  rowKey={(o) => o.id}
                  onRowClick={openOS}
                  empty={<EmptyState icon={<Wrench size={22} strokeWidth={1.7} />} title="Nenhuma ordem encontrada" description="Ajuste o filtro ou abra uma nova ordem de serviço." action={<Button size="sm" onClick={openNova}>Nova ordem de serviço</Button>} />}
                />
              </Card>
            </>
          )}

          {aba === 'servicos' && <ServicosCatalogo servicos={servicos} />}
        </div>
      </main>

      {modalOpen && <OSModal os={isNew ? null : selecionada} isNew={isNew} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
