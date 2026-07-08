'use client'

import { useState, useMemo } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, Table, Button, Badge, StatCard, Tabs, EmptyState, type Column } from '@/components/ui'
import GarantiaModal from './garantia-modal'

interface Garantia {
  id: number
  protocolo: string | null
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
  tipo: string | null
  cliente_id: number | null
  produto_id: number | null
  clientes: { nome: string; telefone: string | null } | null
  produtos: { nome: string } | null
}

interface Props { garantias: Garantia[] }

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  em_analise: { label: 'Em análise', tone: 'warn' },
  aprovado:   { label: 'Aprovado',   tone: 'acc' },
  em_reparo:  { label: 'Em reparo',  tone: 'acc' },
  concluido:  { label: 'Concluído',  tone: 'ok' },
  entregue:   { label: 'Entregue',   tone: 'neutro' },
  recusado:   { label: 'Reprovado',  tone: 'bad' },
}

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS[status ?? ''] ?? { label: status ?? '—', tone: 'neutro' as Tone }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

function fmtPrazo(dias: number | null) {
  if (dias === null) return '—'
  if (dias < 0) return 'Expirada'
  if (dias === 0) return 'Hoje'
  return `${dias} dias`
}

export default function GarantiaView({ garantias }: Props) {
  const [filtro, setFiltro] = useState('todas')
  const [modalOpen, setModalOpen] = useState(false)
  const [selecionada, setSelecionada] = useState<Garantia | null>(null)
  const [isNew, setIsNew] = useState(false)

  const stats = useMemo(() => ({
    emAnalise:      garantias.filter(g => g.status === 'em_analise').length,
    emReparo:       garantias.filter(g => g.status === 'em_reparo').length,
    dentroGarantia: garantias.filter(g => g.dentro_garantia).length,
    concluidasMes:  garantias.filter(g => g.status === 'concluido' || g.status === 'entregue').length,
  }), [garantias])

  const filtrados = useMemo(() => {
    if (filtro === 'todas') return garantias
    if (filtro === 'em_analise') return garantias.filter(g => g.status === 'em_analise')
    if (filtro === 'em_reparo')  return garantias.filter(g => g.status === 'em_reparo')
    if (filtro === 'concluidas') return garantias.filter(g => g.status === 'concluido' || g.status === 'entregue')
    return garantias
  }, [garantias, filtro])

  const FILTROS = [
    { value: 'todas',      label: 'Todas'      },
    { value: 'em_analise', label: 'Em análise' },
    { value: 'em_reparo',  label: 'Em reparo'  },
    { value: 'concluidas', label: 'Concluídas' },
  ]

  function openGarantia(g: Garantia) { setSelecionada(g); setIsNew(false); setModalOpen(true) }
  function openNovo() { setSelecionada(null); setIsNew(true); setModalOpen(true) }

  const cols: Column<Garantia>[] = [
    {
      key: 'protocolo', header: 'Protocolo',
      render: (g) => <span className="num font-semibold text-ink">{g.protocolo ?? `#GA-${g.id}`}</span>,
    },
    {
      key: 'cliente', header: 'Cliente / Produto',
      render: (g) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{g.clientes?.nome ?? '—'}</div>
          <div className="truncate text-[11px] text-ink-3">
            {g.produtos?.nome ?? '—'}{g.imei_serial ? ` · IMEI ··${g.imei_serial.slice(-4)}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'tipo', header: 'Tipo', hideOnMobile: true,
      render: (g) => <span className="text-ink-2">{g.tipo ? g.tipo.charAt(0).toUpperCase() + g.tipo.slice(1) : '—'}</span>,
    },
    {
      key: 'prazo', header: 'Prazo', hideOnMobile: true,
      render: (g) => (
        <span className={g.dias_garantia_restantes != null && g.dias_garantia_restantes < 0 ? 'text-ink' : 'text-ink-2'}>
          {fmtPrazo(g.dias_garantia_restantes)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', align: 'right', render: (g) => <StatusBadge status={g.status} /> },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Garantia" />

      <div className="grid shrink-0 grid-cols-2 gap-3 px-6 py-4 md:grid-cols-4">
        <StatCard label="Em análise" value={stats.emAnalise} />
        <StatCard label="Em reparo" value={stats.emReparo} />
        <StatCard label="Dentro da garantia" value={stats.dentroGarantia} />
        <StatCard label="Concluídas no mês" value={stats.concluidasMes} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 pb-4">
        <Tabs items={FILTROS} value={filtro} onValueChange={setFiltro} className="border-b-0" />
        <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={openNovo}>Novo protocolo</Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <Card flush>
          <Table
            columns={cols}
            rows={filtrados}
            rowKey={(g) => g.id}
            onRowClick={openGarantia}
            empty={<EmptyState icon={<ShieldCheck size={22} strokeWidth={1.7} />} title="Nenhuma garantia encontrada" description="Registre um novo protocolo de garantia." action={<Button size="sm" onClick={openNovo}>Novo protocolo</Button>} />}
          />
        </Card>
      </div>

      {modalOpen && (
        <GarantiaModal garantia={isNew ? null : selecionada} isNew={isNew} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
