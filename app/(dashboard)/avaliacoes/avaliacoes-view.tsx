'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ClipboardCheck, Car } from 'lucide-react'
import { Card, Button, Input, Textarea, Select, Badge, Modal, EmptyState, notify } from '@/components/ui'
import { FipePicker } from '@/components/modules/veiculos/fipe-picker'

export interface Veiculo {
  categoria?: string; marca?: string; modelo?: string; versao?: string
  ano?: number | null; placa?: string; cor?: string; chassi?: string
}
export interface Avaliacao {
  id: number
  lead_id: number | null
  veiculo: Veiculo | null
  km: number | null
  fotos_urls: string | null
  valor_mercado: number | null
  valor_ofertado: number | null
  status: string
  observacoes: string | null
  unidade_id: number | null
  created_at: string
}

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const STATUS: Record<string, { label: string; tone: 'neutro' | 'acc' | 'ok' | 'warn' | 'bad' }> = {
  em_analise: { label: 'Em análise', tone: 'warn' },
  ofertado: { label: 'Ofertado', tone: 'acc' },
  aceito: { label: 'Aceito', tone: 'ok' },
  recusado: { label: 'Recusado', tone: 'bad' },
}

const vazioVeiculo: Veiculo = { categoria: '', marca: '', modelo: '', versao: '', ano: null, placa: '', cor: '', chassi: '' }

export function AvaliacoesView({ initial, leads }: { initial: Avaliacao[]; leads: { id: number; nome: string | null }[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<Avaliacao | 'nova' | null>(null)
  const [veiculo, setVeiculo] = useState<Veiculo>(vazioVeiculo)
  const [leadId, setLeadId] = useState('')
  const [km, setKm] = useState('')
  const [valorMercado, setValorMercado] = useState('')
  const [valorOfertado, setValorOfertado] = useState('')
  const [fotos, setFotos] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mostrarFipe, setMostrarFipe] = useState(false)

  const setV = (patch: Partial<Veiculo>) => setVeiculo((v) => ({ ...v, ...patch }))

  function abrir(a: Avaliacao | 'nova') {
    setEditando(a)
    setMostrarFipe(false)
    if (a === 'nova') {
      setVeiculo(vazioVeiculo); setLeadId(''); setKm(''); setValorMercado(''); setValorOfertado(''); setFotos(''); setObs('')
    } else {
      setVeiculo({ ...vazioVeiculo, ...(a.veiculo ?? {}) })
      setLeadId(a.lead_id ? String(a.lead_id) : '')
      setKm(a.km != null ? String(a.km) : '')
      setValorMercado(a.valor_mercado != null ? String(a.valor_mercado) : '')
      setValorOfertado(a.valor_ofertado != null ? String(a.valor_ofertado) : '')
      setFotos(a.fotos_urls ?? '')
      setObs(a.observacoes ?? '')
    }
  }

  async function salvar() {
    if (!veiculo.marca?.trim() && !veiculo.modelo?.trim()) { notify.bad('Informe ao menos marca ou modelo'); return }
    setSalvando(true)
    try {
      const payload = {
        veiculo, lead_id: leadId ? Number(leadId) : null, km, fotos_urls: fotos,
        valor_mercado: valorMercado, valor_ofertado: valorOfertado, observacoes: obs,
      }
      const res = editando === 'nova'
        ? await fetch('/api/avaliacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/avaliacoes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: (editando as Avaliacao).id, ...payload }) })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error) }
      notify.ok('Avaliação salva')
      setEditando(null)
      router.refresh()
    } catch (e) { notify.bad('Erro ao salvar', e instanceof Error ? e.message : undefined) } finally { setSalvando(false) }
  }

  async function mudarStatus(a: Avaliacao, status: string) {
    if (status === 'aceito' && !a.unidade_id) {
      const ok = window.confirm('Aceitar a avaliação vai lançar o veículo no estoque. Continuar?')
      if (!ok) return
    }
    const res = await fetch('/api/avaliacoes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, status }) })
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      notify.ok(j.unidadeId ? 'Aceito — veículo lançado no estoque' : 'Status atualizado')
      router.refresh()
    } else notify.bad('Erro ao atualizar')
  }

  async function excluir(a: Avaliacao) {
    if (!window.confirm('Excluir esta avaliação?')) return
    const res = await fetch('/api/avaliacoes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })
    if (res.ok) { notify.ok('Avaliação excluída'); router.refresh() } else notify.bad('Erro ao excluir')
  }

  const tituloVeiculo = (v: Veiculo | null) => {
    if (!v) return 'Veículo'
    return [v.marca, v.modelo, v.versao].filter(Boolean).join(' ') || v.categoria || 'Veículo'
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1000px] space-y-4">
        <div className="flex justify-end">
          <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => abrir('nova')}>Nova avaliação</Button>
        </div>

        <Card flush>
          {initial.length === 0 ? (
            <div className="p-6"><EmptyState icon={<ClipboardCheck size={22} strokeWidth={1.7} />} title="Nenhuma avaliação" description="Avalie o usado do cliente para calcular a oferta de troca." /></div>
          ) : (
            <div className="divide-y divide-line-soft">
              {initial.map((a) => {
                const st = STATUS[a.status] ?? STATUS.em_analise
                const v = a.veiculo
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-[180px] flex-1">
                      <button onClick={() => abrir(a)} className="text-[14px] font-semibold text-ink hover:text-accent">{tituloVeiculo(v)}</button>
                      <div className="text-[12px] text-ink-3">
                        {[v?.ano ? String(v.ano) : null, a.km != null ? `${a.km.toLocaleString('pt-BR')} km` : null, v?.placa].filter(Boolean).join(' · ') || 'sem detalhes'}
                        {' · '}<span className="num">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[13.5px] font-semibold text-ink">{brl(a.valor_ofertado)}</div>
                      <div className="text-[11px] text-ink-3">mercado <span className="num">{brl(a.valor_mercado)}</span></div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {a.unidade_id && <Badge tone="ok">no estoque</Badge>}
                    <select value={a.status} onChange={(e) => mudarStatus(a, e.target.value)} className="h-8 rounded-control border border-line bg-card px-2 text-base text-ink">
                      {Object.entries(STATUS).map(([k, val]) => <option key={k} value={k}>{val.label}</option>)}
                    </select>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => excluir(a)}><span className="sr-only">Excluir</span></Button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={editando !== null}
        onClose={() => !salvando && setEditando(null)}
        size="lg"
        title={editando === 'nova' ? 'Nova avaliação' : 'Editar avaliação'}
        footer={<><Button variant="ghost" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button><Button onClick={salvar} loading={salvando}>Salvar</Button></>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Categoria" value={veiculo.categoria ?? ''} onChange={(e) => setV({ categoria: e.target.value })} placeholder="Carro, Moto…" />
          <Select label="Cliente (lead)" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Sem vínculo</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.nome ?? `Lead #${l.id}`}</option>)}
          </Select>
          <Input label="Marca" value={veiculo.marca ?? ''} onChange={(e) => setV({ marca: e.target.value })} placeholder="Ex: Honda" />
          <Input label="Modelo" value={veiculo.modelo ?? ''} onChange={(e) => setV({ modelo: e.target.value })} placeholder="Ex: Civic" />
          <Input label="Versão" value={veiculo.versao ?? ''} onChange={(e) => setV({ versao: e.target.value })} placeholder="EXL" />
          <Input label="Ano/modelo" type="number" className="num" value={veiculo.ano ?? ''} onChange={(e) => setV({ ano: e.target.value ? Number(e.target.value) : null })} placeholder="2022" />
          <Input label="Placa" className="num" value={veiculo.placa ?? ''} onChange={(e) => setV({ placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" />
          <Input label="Km" type="number" className="num" value={km} onChange={(e) => setKm(e.target.value)} placeholder="45000" />
          <Input label="Cor" value={veiculo.cor ?? ''} onChange={(e) => setV({ cor: e.target.value })} placeholder="Prata" />
          <Input label="Chassi" className="num" value={veiculo.chassi ?? ''} onChange={(e) => setV({ chassi: e.target.value.toUpperCase() })} placeholder="9BW…" />
          <Input label="Valor de mercado" type="number" className="num" value={valorMercado} onChange={(e) => setValorMercado(e.target.value)} hint="FIPE/referência" placeholder="0,00" />
          <Input label="Valor ofertado" type="number" className="num" value={valorOfertado} onChange={(e) => setValorOfertado(e.target.value)} placeholder="0,00" />

          <div className="col-span-2">
            {!mostrarFipe ? (
              <Button variant="ghost" size="sm" icon={<Car size={15} strokeWidth={1.7} />} onClick={() => setMostrarFipe(true)}>
                Consultar valor na FIPE
              </Button>
            ) : (
              <div className="rounded-control border border-line-soft bg-bg p-3">
                <div className="mb-2 text-[12px] font-semibold text-ink-2">Tabela FIPE</div>
                <FipePicker onUsar={(r) => {
                  if (r.valor != null) setValorMercado(String(r.valor))
                  const anoNum = r.anoLabel ? parseInt(r.anoLabel, 10) : null
                  setVeiculo((v) => ({
                    ...v,
                    marca: v.marca?.trim() ? v.marca : (r.marca ?? ''),
                    modelo: v.modelo?.trim() ? v.modelo : (r.modelo ?? ''),
                    ano: v.ano ?? (Number.isFinite(anoNum) ? anoNum : null),
                  }))
                  notify.ok('Valor FIPE aplicado ao "valor de mercado"')
                }} />
              </div>
            )}
          </div>
          <Input wrapperClassName="col-span-2" label="Fotos (URLs, separadas por vírgula)" value={fotos} onChange={(e) => setFotos(e.target.value)} placeholder="https://…" />
          <Textarea wrapperClassName="col-span-2" label="Observações" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Estado, avarias, laudo…" />
        </div>
      </Modal>
    </main>
  )
}
