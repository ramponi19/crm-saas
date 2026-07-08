'use client'

import { useState } from 'react'
import {
  Plus, Search, Trash2, Bell, Pencil, Inbox, Filter, MoreHorizontal,
} from 'lucide-react'
import {
  Button, IconButton, Input, Select, Textarea, Modal, Drawer, ConfirmDialog,
  Table, Card, StatCard, Badge, Tabs, EmptyState, Skeleton, notify, type Column,
} from '@/components/ui'

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 border-b border-line-soft pb-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

const SWATCHES = [
  ['bg', 'bg-bg'], ['card', 'bg-card'], ['raised', 'bg-raised'],
  ['ink', 'bg-ink'], ['ink-2', 'bg-ink-2'], ['ink-3', 'bg-ink-3'],
  ['accent', 'bg-accent'], ['ok', 'bg-ok'], ['warn', 'bg-warn'], ['bad', 'bg-bad'],
]

const TYPE_SCALE = [
  ['10.5px', 'label-uppercase', 'text-[10.5px] uppercase tracking-[0.06em] font-semibold text-ink-3'],
  ['11px', 'meta', 'text-[11px] text-ink-3'],
  ['12px', 'dense', 'text-[12px] text-ink-2'],
  ['13px', 'body', 'text-[13px] text-ink'],
  ['15px', 'lead', 'text-[15px] text-ink'],
  ['17px', 'título-card', 'text-[17px] font-semibold tracking-[-0.02em] text-ink'],
  ['22px', 'título-página', 'text-[22px] font-bold tracking-[-0.03em] text-ink'],
  ['26px', 'número-kpi', 'text-[26px] font-bold tracking-[-0.035em] text-ink num'],
]

type Venda = { id: number; cliente: string; valor: string; status: 'ok' | 'acc' | 'warn' }
const VENDAS: Venda[] = [
  { id: 1284, cliente: 'Ana Paula Costa', valor: 'R$ 3.450', status: 'ok' },
  { id: 1285, cliente: 'Vanessa Torres', valor: 'R$ 7.900', status: 'acc' },
  { id: 1286, cliente: 'Escritório RC', valor: 'R$ 12.000', status: 'warn' },
]

const KANBAN = [
  { label: 'Novo', dot: 'bg-ink-3', count: 6 },
  { label: 'Em contato', dot: 'bg-ink-2', count: 5 },
  { label: 'Negociação', dot: 'bg-accent', count: 4, sum: 'R$ 19,9 mil' },
  { label: 'Fechamento', dot: 'bg-warn', count: 3 },
  { label: 'Convertido', dot: 'bg-ok', count: 5 },
]

export function DesignShowcase() {
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [tab, setTab] = useState('resumo')
  const [showEmpty, setShowEmpty] = useState(false)

  const cols: Column<Venda>[] = [
    { key: 'id', header: '#', render: (r) => <span className="num text-ink-2">{r.id}</span>, className: 'num w-[70px]' },
    { key: 'cliente', header: 'Cliente', render: (r) => <span className="font-medium">{r.cliente}</span> },
    { key: 'valor', header: 'Valor', align: 'right', render: (r) => <span className="num">{r.valor}</span>, hideOnMobile: true },
    {
      key: 'status', header: 'Status', align: 'right',
      render: (r) => <Badge tone={r.status} dot>{r.status === 'ok' ? 'Pago' : r.status === 'acc' ? 'Negociação' : 'Pendente'}</Badge>,
    },
  ]

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <header className="mb-9">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Nexus · Direção Precisão</div>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ink">Design System — contrato visual</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            16 componentes do kit + tokens. Nenhuma view do produto deve reinventar estes elementos.
          </p>
        </header>

        <Section title="Paleta" hint="Cor é informação, não decoração. Único vermelho de marca é o quadrado do logo.">
          <div className="flex flex-wrap gap-3">
            {SWATCHES.map(([name, cls]) => (
              <div key={name} className="w-[92px]">
                <div className={`h-14 rounded-card border border-line ${cls}`} />
                <div className="mt-1.5 text-[11px] font-medium text-ink-2">{name}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tipografia" hint="Geist. 8 degraus permitidos + hero. Títulos 700, números tabulares.">
          <Card>
            <div className="flex flex-col gap-3">
              {TYPE_SCALE.map(([size, name, cls]) => (
                <div key={name} className="flex items-baseline gap-4">
                  <span className="num w-[52px] flex-shrink-0 text-[11px] text-ink-3">{size}</span>
                  <span className="w-[110px] flex-shrink-0 text-[11px] text-ink-3">{name}</span>
                  <span className={cls}>Venda com processo</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="Botões">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button>Primário</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Perigo</Button>
              <Button icon={<Plus size={15} strokeWidth={1.7} />}>Com ícone</Button>
              <Button loading>Salvando</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Pequeno</Button>
              <Button size="md">Médio</Button>
              <Button size="lg">Grande</Button>
              <IconButton aria-label="Buscar"><Search size={16} strokeWidth={1.7} /></IconButton>
              <IconButton aria-label="Editar" variant="outline"><Pencil size={16} strokeWidth={1.7} /></IconButton>
              <IconButton aria-label="Excluir" variant="danger"><Trash2 size={16} strokeWidth={1.7} /></IconButton>
              <IconButton aria-label="Mais" ><MoreHorizontal size={16} strokeWidth={1.7} /></IconButton>
            </div>
          </div>
        </Section>

        <Section title="Formulário">
          <div className="grid max-w-[560px] gap-4">
            <Input label="Nome do cliente" placeholder="Ex.: Ana Paula" hint="Como aparece nas vendas." />
            <Input label="Buscar" placeholder="Produto, cliente…" icon={<Search size={15} strokeWidth={1.7} />} />
            <Input label="E-mail" placeholder="cliente@email.com" error="E-mail inválido." defaultValue="cliente@" />
            <Select label="Forma de pagamento" defaultValue="pix">
              <option value="pix">Pix</option>
              <option value="credito">Cartão de crédito</option>
              <option value="dinheiro">Dinheiro</option>
            </Select>
            <Textarea label="Observações" placeholder="Anotações internas…" hint="Não aparece para o cliente." />
          </div>
        </Section>

        <Section title="Badges / chips">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Novo</Badge>
            <Badge tone="acc" dot>Negociação</Badge>
            <Badge tone="ok" dot>Pago</Badge>
            <Badge tone="warn" dot>Pendente</Badge>
            <Badge tone="bad" dot>SLA estourado</Badge>
          </div>
        </Section>

        <Section title="KPIs (StatCard)" hint="Agrupados num card com bordas internas — como no dashboard.">
          <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-card md:grid-cols-4 [&>*]:border-line-soft [&>*:not(:last-child)]:border-r">
            <StatCard bare label="Vendas hoje" value="R$ 8.420" delta="+12,4% vs ontem" deltaTone="ok" spark={[.3, .45, .38, .6, .52, .74, 1]} />
            <StatCard bare label="Leads novos" value="14" delta="9 WhatsApp · 5 Instagram" deltaTone="neutral" spark={[.4, .34, .58, .46, .7, .62, .88]} />
            <StatCard bare label="Tempo de resposta" value="4m 02s" delta="dentro da meta de 5m" deltaTone="ok" spark={[.8, .64, .7, .52, .44, .38, .3]} />
            <StatCard bare label="A receber — julho" value="R$ 23.180" delta="R$ 1.240 vence hoje" deltaTone="bad" spark={[.35, .5, .42, .66, .58, .72, .92]} />
          </div>
        </Section>

        <Section title="Card + Tabs">
          <Card
            title="Cliente"
            actions={<IconButton aria-label="Mais"><MoreHorizontal size={16} strokeWidth={1.7} /></IconButton>}
          >
            <Tabs
              items={[
                { value: 'resumo', label: 'Resumo' },
                { value: 'vendas', label: 'Vendas', badge: 6 },
                { value: 'notas', label: 'Notas' },
              ]}
              value={tab}
              onValueChange={setTab}
              className="mb-4"
            />
            <p className="text-[13px] text-ink-2">
              Conteúdo da aba <b className="text-ink">{tab}</b>. Cards usam borda, nunca sombra — a sombra é reservada a modais e dropdowns.
            </p>
          </Card>
        </Section>

        <Section title="Tabela" hint="Densa, hover, empty embutido.">
          <Card flush>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] font-semibold text-ink">Últimas vendas</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" icon={<Filter size={14} strokeWidth={1.7} />}>Filtrar</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowEmpty((v) => !v)}>
                  {showEmpty ? 'Com dados' : 'Ver vazio'}
                </Button>
              </div>
            </div>
            <Table
              columns={cols}
              rows={showEmpty ? [] : VENDAS}
              rowKey={(r) => r.id}
              onRowClick={(r) => notify.info('Venda aberta', `#${r.id} · ${r.cliente}`)}
              empty={<EmptyState icon={<Inbox size={22} strokeWidth={1.7} />} title="Nenhuma venda no período" description="Ajuste o filtro ou registre uma venda no PDV." action={<Button size="sm">Nova venda</Button>} />}
            />
          </Card>
        </Section>

        <Section title="Kanban (peças do contrato)" hint="Coluna sem fundo cinza · dot quadrado 6px · soma R$ · card hover borda cobalto.">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {KANBAN.map((c) => (
              <div key={c.label} className="w-[210px] flex-shrink-0">
                <div className="flex items-center gap-2 px-1 pb-2 text-[12px] font-semibold text-ink-2">
                  <span className={`h-1.5 w-1.5 rounded-[2px] ${c.dot}`} />
                  {c.label}
                  {c.sum && <span className="ml-1.5 text-[10.5px] font-medium text-ink-3">{c.sum}</span>}
                  <span className="num ml-auto text-[11px] font-semibold text-ink-3">{c.count}</span>
                </div>
                <div className="cursor-grab rounded-[10px] border border-line bg-card p-3 transition-colors hover:border-accent hover:shadow-[0_4px_12px_-6px_rgba(46,92,230,0.25)]">
                  <div className="flex justify-between gap-2 text-[12.5px] font-semibold text-ink">Larissa Mendes</div>
                  <div className="mt-0.5 mb-2 text-[11px] text-ink-3">iPhone 15 · Instagram</div>
                  <div className="flex items-center gap-1.5">
                    <span className="num grid h-[19px] w-[19px] place-items-center rounded-full bg-ink text-[8px] font-bold text-white">RF</span>
                    <span className="ml-auto text-[10px] font-semibold text-bad">SLA 3min</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Sobreposições e feedback">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setModal(true)}>Abrir Modal</Button>
            <Button variant="outline" onClick={() => setDrawer(true)}>Abrir Drawer</Button>
            <Button variant="outline" onClick={() => setConfirm(true)}>ConfirmDialog</Button>
            <Button variant="outline" icon={<Bell size={15} strokeWidth={1.7} />} onClick={() => notify.ok('Venda registrada', 'iPhone 13 · R$ 3.450 no Pix')}>Toast ok</Button>
            <Button variant="outline" onClick={() => notify.bad('Falha no envio', 'Não foi possível enviar a cobrança.')}>Toast erro</Button>
            <Button variant="outline" onClick={() => notify.warn('SLA quase estourando', 'Lead sem resposta há 4 min.')}>Toast alerta</Button>
          </div>
        </Section>

        <Section title="Carregamento (Skeleton)">
          <Card>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Card>
        </Section>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nova venda"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => { setModal(false); notify.ok('Venda salva') }}>Salvar venda</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input label="Cliente" placeholder="Buscar cliente…" icon={<Search size={15} strokeWidth={1.7} />} />
          <Select label="Forma de pagamento" defaultValue="pix">
            <option value="pix">Pix</option>
            <option value="credito">Cartão de crédito</option>
          </Select>
        </div>
      </Modal>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filtros"
        footer={<Button onClick={() => setDrawer(false)}>Aplicar</Button>}
      >
        <div className="grid gap-4">
          <Select label="Período" defaultValue="hoje"><option value="hoje">Hoje</option><option value="mes">Este mês</option></Select>
          <Select label="Responsável" defaultValue="todos"><option value="todos">Todos</option></Select>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirmLoading(true)
          setTimeout(() => { setConfirmLoading(false); setConfirm(false); notify.ok('Registro excluído') }, 900)
        }}
        title="Excluir venda?"
        description="Esta ação não pode ser desfeita. A venda #1284 será removida do histórico."
        confirmLabel="Excluir"
        tone="danger"
        loading={confirmLoading}
      />
    </div>
  )
}
