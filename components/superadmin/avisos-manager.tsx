'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Megaphone } from 'lucide-react'
import { Card, Button, Input, Textarea, Select, Badge, ConfirmDialog, EmptyState, notify } from '@/components/ui'

const PLATFORM = '#6D28D9'

export type Aviso = {
  id: number
  titulo: string
  corpo: string
  tom: string
  alvo: string
  alvo_valor: string | null
  ativo: boolean
  expira_em: string | null
  created_at: string
}

const TOM_LABEL: Record<string, string> = { info: 'Informativo', alerta: 'Alerta', sucesso: 'Novidade' }
const TOM_TONE: Record<string, 'neutro' | 'warn' | 'ok'> = { info: 'neutro', alerta: 'warn', sucesso: 'ok' }

function fmtData(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function AvisosManager({ avisosInit, empresas, planos }: {
  avisosInit: Aviso[]
  empresas: { id: number; nome: string }[]
  planos: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [tom, setTom] = useState('info')
  const [alvo, setAlvo] = useState('todos')
  const [alvoValor, setAlvoValor] = useState('')
  const [expira, setExpira] = useState('')
  const [saving, setSaving] = useState(false)
  const [excluir, setExcluir] = useState<Aviso | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  function alvoLabel(a: Aviso) {
    if (a.alvo === 'todos') return 'Todos os tenants'
    if (a.alvo === 'plano') return `Plano: ${a.alvo_valor}`
    const emp = empresas.find(e => String(e.id) === a.alvo_valor)
    return `Empresa: ${emp?.nome ?? a.alvo_valor}`
  }

  async function criar() {
    if (!titulo.trim()) { notify.bad('Informe um título'); return }
    if (alvo !== 'todos' && !alvoValor) { notify.bad('Escolha o alvo do aviso'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo, corpo, tom, alvo,
          alvo_valor: alvo === 'todos' ? null : alvoValor,
          expira_em: expira ? new Date(expira).toISOString() : null,
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao criar') }
      notify.ok('Aviso publicado')
      setTitulo(''); setCorpo(''); setTom('info'); setAlvo('todos'); setAlvoValor(''); setExpira('')
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível criar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(a: Aviso) {
    try {
      const res = await fetch('/api/superadmin/avisos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, ativo: !a.ativo }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      notify.bad('Não foi possível atualizar')
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      const res = await fetch('/api/superadmin/avisos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: excluir.id }),
      })
      if (!res.ok) throw new Error()
      notify.ok('Aviso excluído')
      setExcluir(null)
      router.refresh()
    } catch {
      notify.bad('Não foi possível excluir')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Novo aviso */}
      <Card title="Novo aviso">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Título" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Manutenção programada" wrapperClassName="md:col-span-2" />
          <Textarea label="Mensagem" value={corpo} onChange={e => setCorpo(e.target.value)} placeholder="Detalhe o aviso (opcional)" wrapperClassName="md:col-span-2" rows={3} />

          <Select label="Tom" value={tom} onChange={e => setTom(e.target.value)}>
            <option value="info">Informativo</option>
            <option value="alerta">Alerta</option>
            <option value="sucesso">Novidade</option>
          </Select>

          <Input
            label="Expira em (opcional)"
            type="date"
            value={expira}
            onChange={e => setExpira(e.target.value)}
          />

          <Select label="Alvo" value={alvo} onChange={e => { setAlvo(e.target.value); setAlvoValor('') }}>
            <option value="todos">Todos os tenants</option>
            <option value="plano">Um plano</option>
            <option value="empresa">Uma empresa</option>
          </Select>

          {alvo === 'plano' && (
            <Select label="Plano alvo" value={alvoValor} onChange={e => setAlvoValor(e.target.value)}>
              <option value="">Selecione…</option>
              {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          )}
          {alvo === 'empresa' && (
            <Select label="Empresa alvo" value={alvoValor} onChange={e => setAlvoValor(e.target.value)}>
              <option value="">Selecione…</option>
              {empresas.map(em => <option key={em.id} value={String(em.id)}>{em.nome}</option>)}
            </Select>
          )}
        </div>

        <div className="mt-4">
          <Button
            onClick={criar}
            loading={saving}
            icon={<Plus size={16} strokeWidth={1.7} />}
            style={{ background: PLATFORM }}
            className="text-white hover:opacity-90"
          >
            Publicar aviso
          </Button>
        </div>
      </Card>

      {/* Lista */}
      <Card title={`Avisos (${avisosInit.length})`} flush>
        {avisosInit.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Megaphone size={22} strokeWidth={1.7} />} title="Nenhum aviso" description="Publique o primeiro aviso da plataforma acima." />
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {avisosInit.map(a => {
              const expirado = a.expira_em ? new Date(a.expira_em) <= new Date() : false
              return (
                <div key={a.id} className="flex items-start gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{a.titulo}</span>
                      <Badge tone={TOM_TONE[a.tom] ?? 'neutro'}>{TOM_LABEL[a.tom] ?? a.tom}</Badge>
                      {!a.ativo && <Badge tone="neutro">inativo</Badge>}
                      {expirado && <Badge tone="bad">expirado</Badge>}
                    </div>
                    {a.corpo && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{a.corpo}</p>}
                    <div className="mt-1 text-[11.5px] text-ink-3">
                      {alvoLabel(a)}
                      {a.expira_em && ` · expira ${fmtData(a.expira_em)}`}
                    </div>
                  </div>
                  <div className="flex flex-none flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggle(a)}>
                      {a.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExcluir(a)}
                      icon={<Trash2 size={14} strokeWidth={1.7} />}
                      className="text-bad hover:bg-bad/10"
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        loading={excluindo}
        tone="danger"
        title="Excluir aviso"
        description={excluir ? `O aviso "${excluir.titulo}" será removido definitivamente.` : ''}
        confirmLabel="Excluir"
      />
    </div>
  )
}
