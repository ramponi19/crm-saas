'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Select, Modal, Badge, EmptyState, ConfirmDialog, notify } from '@/components/ui'
import { Plus, Pencil, Trash2, Split, ArrowUp, ArrowDown, Users, Inbox } from 'lucide-react'

export interface Regra {
  id: number
  nome: string
  ativo: boolean
  criterio: string
  config: Record<string, unknown>
  destinatarios: string[]
}
export interface Membro { id: string; nome: string }

interface Editor {
  id?: number
  nome: string
  ativo: boolean
  criterio: string
  valores: string   // origem: separado por vírgula
  min: string
  max: string
  destinatarios: string[]
}

const CRITERIO_LABEL: Record<string, string> = {
  qualquer: 'Qualquer lead (rodízio)',
  origem: 'Por origem do lead',
  faixa_valor: 'Por faixa de valor',
}

export function DistribuicaoView({ regrasIniciais, membros, semDono }: { regrasIniciais: Regra[]; membros: Membro[]; semDono: number }) {
  const router = useRouter()
  const [regras, setRegras] = useState<Regra[]>(regrasIniciais)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<Regra | null>(null)
  const [distribuindo, setDistribuindo] = useState(false)

  const nomePorId = Object.fromEntries(membros.map((m) => [m.id, m.nome])) as Record<string, string>

  function nova() {
    setEditor({ nome: '', ativo: true, criterio: 'qualquer', valores: '', min: '', max: '', destinatarios: [] })
  }
  function abrir(r: Regra) {
    setEditor({
      id: r.id, nome: r.nome, ativo: r.ativo, criterio: r.criterio,
      valores: Array.isArray(r.config.valores) ? (r.config.valores as string[]).join(', ') : '',
      min: r.config.min != null ? String(r.config.min) : '',
      max: r.config.max != null ? String(r.config.max) : '',
      destinatarios: r.destinatarios,
    })
  }

  function toggleDest(id: string) {
    setEditor((e) => e && ({ ...e, destinatarios: e.destinatarios.includes(id) ? e.destinatarios.filter((x) => x !== id) : [...e.destinatarios, id] }))
  }

  async function salvar() {
    if (!editor) return
    if (!editor.nome.trim()) { notify.warn('Dê um nome à regra'); return }
    const config: Record<string, unknown> =
      editor.criterio === 'origem' ? { valores: editor.valores.split(',').map((v) => v.trim()).filter(Boolean) } :
      editor.criterio === 'faixa_valor' ? { min: Number(editor.min) || 0, max: Number(editor.max) || 0 } : {}
    setSalvando(true)
    const r = await fetch('/api/distribuicao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editor.id, nome: editor.nome, ativo: editor.ativo, criterio: editor.criterio, config, destinatarios: editor.destinatarios }),
    })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Erro ao salvar', j.error); return }
    notify.ok('Regra salva'); setEditor(null); router.refresh()
  }

  async function confirmarExcluir() {
    if (!excluir) return
    const r = await fetch(`/api/distribuicao?id=${excluir.id}`, { method: 'DELETE' })
    setExcluir(null)
    if (!r.ok) { notify.bad('Erro ao excluir'); return }
    notify.ok('Regra excluída'); router.refresh()
  }

  async function mover(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= regras.length) return
    const anterior = regras
    const nova = [...regras]
    ;[nova[i], nova[j]] = [nova[j], nova[i]]
    setRegras(nova)
    const r = await fetch('/api/distribuicao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordens: nova.map((r, idx) => ({ id: r.id, ordem: idx + 1 })) }) })
    if (!r.ok) { setRegras(anterior); notify.bad('Erro ao reordenar'); return } // reverte se a gravação falhar
    router.refresh()
  }

  async function distribuirEsteira() {
    setDistribuindo(true)
    const r = await fetch('/api/leads/distribuir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ esteira: true }) })
    setDistribuindo(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Erro ao distribuir', j.error); return }
    notify.ok('Esteira distribuída', `${j.distribuidos ?? 0} lead(s) atribuído(s)`); router.refresh()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Distribuição de leads" />
      <div className="mx-auto w-full max-w-[820px] flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Distribuição de leads</h1>
            <p className="mt-0.5 max-w-[560px] text-[13px] text-ink-3">
              Regras que entregam o lead novo ao vendedor certo na hora. Avaliadas de cima para baixo — a primeira que combinar distribui em rodízio entre os escolhidos. Sem regra ativa, mantém o rodízio geral atual.
            </p>
          </div>
          <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={nova} className="shrink-0">Nova regra</Button>
        </div>

        {/* Esteira */}
        <div className="mb-5 flex items-center gap-3 rounded-card border border-line bg-card p-4">
          <div className="flex size-9 flex-none items-center justify-center rounded-full bg-warn/10 text-warn"><Inbox size={16} strokeWidth={1.8} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-ink">Esteira — {semDono} sem dono</div>
            <div className="text-[12px] text-ink-3">Aplica as regras aos leads que chegaram sem responsável (inclui os da Meta/portais).</div>
          </div>
          <Button variant="outline" onClick={distribuirEsteira} loading={distribuindo} disabled={semDono === 0} className="shrink-0">Distribuir agora</Button>
        </div>

        {regras.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              icon={<Split size={24} strokeWidth={1.6} />}
              title="Sem regras de distribuição"
              description="Enquanto não houver regras, os leads novos seguem no rodízio geral entre todos os vendedores ativos. Crie uma regra para direcionar por origem ou faixa de valor."
              action={<Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={nova}>Nova regra</Button>}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {regras.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 rounded-card border border-line bg-card p-4">
                <div className="flex flex-col">
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="-m-1 p-1 text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Subir"><ArrowUp size={14} strokeWidth={1.8} /></button>
                  <button onClick={() => mover(i, 1)} disabled={i === regras.length - 1} className="-m-1 p-1 text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Descer"><ArrowDown size={14} strokeWidth={1.8} /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-ink">{r.nome}</span>
                    {!r.ativo && <Badge tone="neutro">Inativa</Badge>}
                    <Badge tone="ok">{CRITERIO_LABEL[r.criterio] ?? r.criterio}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                    <Users size={12} strokeWidth={1.7} />
                    {r.destinatarios.length === 0 ? 'Rodízio geral (todos)' : r.destinatarios.map((d) => nomePorId[d] ?? '—').join(', ')}
                  </div>
                </div>
                <button onClick={() => abrir(r)} className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-ink/[0.05] hover:text-ink" aria-label="Editar"><Pencil size={15} strokeWidth={1.7} /></button>
                <button onClick={() => setExcluir(r)} className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-ink/[0.05] hover:text-bad" aria-label="Excluir"><Trash2 size={15} strokeWidth={1.7} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Editar regra' : 'Nova regra'}
        footer={<>
          <Button variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Salvar</Button>
        </>}
      >
        {editor && (
          <div className="space-y-4">
            <Input label="Nome" value={editor.nome} onChange={(e) => setEditor({ ...editor, nome: e.target.value })} placeholder="Ex.: Leads do site → time A" />
            <Select label="Critério" value={editor.criterio} onChange={(e) => setEditor({ ...editor, criterio: e.target.value })}>
              {Object.entries(CRITERIO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>

            {editor.criterio === 'origem' && (
              <Input label="Origens (separadas por vírgula)" value={editor.valores} onChange={(e) => setEditor({ ...editor, valores: e.target.value })} placeholder="site, grupo-olx, indicacao" hint="Casa com o campo de origem do lead." />
            )}
            {editor.criterio === 'faixa_valor' && (
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" label="Valor mínimo (R$)" value={editor.min} onChange={(e) => setEditor({ ...editor, min: e.target.value })} placeholder="0" />
                <Input type="number" label="Valor máximo (R$)" value={editor.max} onChange={(e) => setEditor({ ...editor, max: e.target.value })} placeholder="0 = sem teto" />
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-2">Distribuir entre</div>
              {membros.length === 0 ? (
                <p className="text-[12px] text-ink-3">Nenhum membro ativo na equipe.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {membros.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 rounded-control border border-line px-3 py-2 text-[13px] text-ink">
                      <input type="checkbox" checked={editor.destinatarios.includes(m.id)} onChange={() => toggleDest(m.id)} className="size-4 accent-accent" />
                      {m.nome}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-ink-3">Nenhum marcado = rodízio geral entre todos os vendedores ativos.</p>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={editor.ativo} onChange={(e) => setEditor({ ...editor, ativo: e.target.checked })} className="size-4 accent-accent" />
              Regra ativa
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExcluir}
        title="Excluir regra?"
        description={`"${excluir?.nome}" será removida. Os leads já distribuídos não mudam.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
