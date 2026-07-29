'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2, Loader2, AlertTriangle, Info } from 'lucide-react'
import { Card, Input, Textarea, Select, Button, Badge, Modal, ConfirmDialog, notify } from '@/components/ui'

// ⚠️ Zona sensível (Meta). Modelo criado aqui é submetido à ANÁLISE da Meta em
// nome da empresa. Nome, categoria e exemplos seguem as regras dela.

type Modelo = {
  id: number
  nome: string
  idioma: string
  categoria: string
  corpo: string
  status: 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' | 'pausado' | 'desativado'
  motivo_recusa: string | null
  ultima_sync_em: string | null
}

const TOM: Record<Modelo['status'], 'ok' | 'warn' | 'bad' | 'neutro'> = {
  aprovado: 'ok', pendente: 'warn', rejeitado: 'bad',
  pausado: 'warn', desativado: 'neutro', rascunho: 'neutro',
}
const ROTULO: Record<Modelo['status'], string> = {
  aprovado: 'Aprovado', pendente: 'Em análise', rejeitado: 'Recusado',
  pausado: 'Pausado pela Meta', desativado: 'Desativado', rascunho: 'Rascunho',
}

const CATEGORIAS = [
  { v: 'UTILITY', label: 'Utilidade — aviso sobre pedido, agendamento, cobrança' },
  { v: 'MARKETING', label: 'Marketing — promoção, novidade, reativação' },
  { v: 'AUTHENTICATION', label: 'Autenticação — código de verificação' },
]

export function ModelosView() {
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [whatsappConectado, setWhatsappConectado] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aExcluir, setAExcluir] = useState<Modelo | null>(null)

  const [form, setForm] = useState({ nome: '', categoria: 'UTILITY', corpo: '', exemplos: '' })

  const buscar = useCallback(async (sync = false) => {
    const r = await fetch(`/api/modelos${sync ? '?sync=1' : ''}`)
    const j = await r.json()
    if (r.ok) { setModelos(j.modelos ?? []); setWhatsappConectado(!!j.whatsappConectado) }
    else notify.bad(j.error ?? 'Não foi possível carregar os modelos.')
    setCarregando(false)
    setSincronizando(false)
  }, [])

  useEffect(() => { buscar() }, [buscar])

  // Quantas variáveis o texto usa — a Meta exige um exemplo para cada uma.
  const variaveis = (form.corpo.match(/\{\{\d+\}\}/g) ?? []).length
  const exemplosPreenchidos = form.exemplos.split('|').map((s) => s.trim()).filter(Boolean)

  async function salvar() {
    if (!form.nome.trim() || !form.corpo.trim()) return notify.warn('Preencha o nome e o texto.')
    if (variaveis && exemplosPreenchidos.length < variaveis) {
      return notify.warn(`Preencha ${variaveis} exemplo(s), separados por barra vertical.`)
    }
    setSalvando(true)
    try {
      const r = await fetch('/api/modelos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome, categoria: form.categoria, corpo: form.corpo,
          exemplos: exemplosPreenchidos,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao enviar o modelo.')
      notify.ok('Modelo enviado para análise da Meta.', j.aviso)
      setCriando(false)
      setForm({ nome: '', categoria: 'UTILITY', corpo: '', exemplos: '' })
      buscar()
    } catch (e) {
      notify.bad((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(m: Modelo) {
    setAExcluir(null)
    const r = await fetch(`/api/modelos/${m.id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!r.ok) return notify.bad(j.error ?? 'Não foi possível excluir.')
    notify.ok('Modelo removido.', j.aviso ?? undefined)
    buscar()
  }

  if (carregando) {
    return <div className="flex items-center gap-2 p-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando modelos…</div>
  }

  return (
    <div className="space-y-4">
      {!whatsappConectado && (
        <div className="flex gap-3 rounded-control border border-warn/30 bg-warn-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-warn" />
          <div className="text-sm">
            <p className="font-semibold">WhatsApp não conectado</p>
            <p className="mt-1 text-ink-2">
              Quem aprova cada modelo é a Meta, através da sua conta do WhatsApp. Conecte o canal
              em <strong>Sistema → Canais</strong> e volte aqui.
            </p>
          </div>
        </div>
      )}

      <Card
        title="Modelos de mensagem"
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => { setSincronizando(true); buscar(true) }}
              loading={sincronizando}
              icon={<RefreshCw size={14} strokeWidth={1.8} />}
            >
              Conferir análise
            </Button>
            <Button size="sm" onClick={() => setCriando(true)} disabled={!whatsappConectado} icon={<Plus size={15} strokeWidth={1.8} />}>
              Novo modelo
            </Button>
          </div>
        }
      >
        <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
          Depois de <strong className="text-ink">24 horas</strong> sem o cliente escrever, o WhatsApp
          só aceita mensagem por modelo aprovado. É assim que o vendedor retoma uma conversa parada —
          e cada modelo passa por análise da Meta antes de poder ser usado.
        </p>

        {modelos.length === 0 ? (
          <div className="rounded-control border border-dashed border-line py-8 text-center text-[13px] text-ink-3">
            Nenhum modelo ainda. Crie um para conseguir retomar conversas fora da janela de 24h.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {modelos.map((m) => (
              <div key={m.id} className="rounded-control border border-line bg-raised px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-ink">{m.nome}</span>
                      <Badge tone={TOM[m.status]} dot>{ROTULO[m.status]}</Badge>
                      <span className="text-[11px] uppercase tracking-wide text-ink-3">{m.categoria}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-ink-2">{m.corpo}</p>
                    {m.motivo_recusa && (
                      <p className="mt-1 text-[11.5px] text-bad">
                        Motivo da recusa: {m.motivo_recusa.replace(/_/g, ' ').toLowerCase()}
                      </p>
                    )}
                    {m.status === 'pendente' && (
                      <p className="mt-1 text-[11.5px] text-ink-3">
                        A Meta costuma responder em minutos. Use “Conferir análise” para atualizar.
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setAExcluir(m)} icon={<Trash2 size={14} strokeWidth={1.8} />}>
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={criando} onClose={() => setCriando(false)} title="Novo modelo de mensagem" size="md">
        <div className="flex flex-col gap-3.5">
          <Input
            label="Nome do modelo"
            placeholder="retomada_orcamento"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            hint="A Meta aceita só minúsculas, números e underscore — eu ajusto automaticamente."
          />
          <Select
            label="Categoria"
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          >
            {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </Select>
          <Textarea
            label="Texto da mensagem"
            rows={4}
            placeholder={'Olá {{1}}, tudo bem? Passando para saber se ainda tem interesse no {{2}}.'}
            value={form.corpo}
            onChange={(e) => setForm({ ...form, corpo: e.target.value })}
            hint="Use {{1}}, {{2}} onde o texto muda a cada cliente."
          />
          {variaveis > 0 && (
            <Input
              label={`Exemplos das ${variaveis} variáveis`}
              placeholder="João | iPhone 15"
              value={form.exemplos}
              onChange={(e) => setForm({ ...form, exemplos: e.target.value })}
              hint="Separe com barra vertical. A Meta recusa modelo sem exemplo — é como ela entende o contexto."
            />
          )}
          <div className="flex gap-2 rounded-control bg-raised p-3 text-[11.5px] text-ink-2">
            <Info size={14} strokeWidth={1.8} className="mt-0.5 flex-none text-accent" />
            <span>
              Modelos de <strong>marketing</strong> são analisados com mais rigor e podem ser recusados
              por parecer propaganda não solicitada. Para retomar conversa de venda, <strong>utilidade</strong>
              {' '}costuma passar mais fácil quando o texto se refere a algo que o cliente pediu.
            </span>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCriando(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Enviar para análise</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!aExcluir}
        title={`Excluir o modelo ${aExcluir?.nome ?? ''}?`}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={() => aExcluir && excluir(aExcluir)}
        onClose={() => setAExcluir(null)}
        description="O modelo é removido do CRM e da Meta. Conversas já enviadas com ele não são afetadas."
      />
    </div>
  )
}
