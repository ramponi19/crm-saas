'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Select, Modal, Badge, EmptyState, ConfirmDialog, notify } from '@/components/ui'
import { Plus, Pencil, Trash2, Repeat, GripVertical, ArrowUp, ArrowDown, Phone, MessageCircle, Mail, CheckSquare, Snowflake, RefreshCw } from 'lucide-react'

export interface ReativacaoCfg { ativo?: boolean; dias_frio?: number; incluir_perdidos?: boolean; cadencia_id?: number | null }

export interface PassoUi { canal: string; dia_offset: number; titulo: string; template_chave: string | null }
export interface Cadencia {
  id: number
  nome: string
  descricao: string | null
  ativo: boolean
  gatilho: string
  gatilho_etapa_slug: string | null
  passos: PassoUi[]
}
export interface EtapaOpt { slug: string; label: string }

interface Editor {
  id?: number
  nome: string
  descricao: string
  ativo: boolean
  gatilho: string
  gatilho_etapa_slug: string
  passos: PassoUi[]
}

const CANAL_ICON: Record<string, typeof Phone> = { ligacao: Phone, whatsapp: MessageCircle, email: Mail, tarefa: CheckSquare }
const CANAL_LABEL: Record<string, string> = { ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', tarefa: 'Tarefa' }
const novoPasso = (): PassoUi => ({ canal: 'ligacao', dia_offset: 0, titulo: '', template_chave: null })

export function CadenciasView({ cadenciasIniciais, etapas, templates, reativacao }: { cadenciasIniciais: Cadencia[]; etapas: EtapaOpt[]; templates: string[]; reativacao?: ReativacaoCfg }) {
  const router = useRouter()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<Cadencia | null>(null)

  function nova() {
    setEditor({ nome: '', descricao: '', ativo: true, gatilho: 'manual', gatilho_etapa_slug: etapas[0]?.slug ?? '', passos: [novoPasso()] })
  }
  function abrir(c: Cadencia) {
    setEditor({
      id: c.id, nome: c.nome, descricao: c.descricao ?? '', ativo: c.ativo,
      gatilho: c.gatilho, gatilho_etapa_slug: c.gatilho_etapa_slug ?? (etapas[0]?.slug ?? ''),
      passos: c.passos.length ? c.passos.map((p) => ({ ...p })) : [novoPasso()],
    })
  }

  function setPasso(i: number, patch: Partial<PassoUi>) {
    setEditor((e) => e && ({ ...e, passos: e.passos.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }))
  }
  function mover(i: number, dir: -1 | 1) {
    setEditor((e) => {
      if (!e) return e
      const j = i + dir
      if (j < 0 || j >= e.passos.length) return e
      const passos = [...e.passos]
      ;[passos[i], passos[j]] = [passos[j], passos[i]]
      return { ...e, passos }
    })
  }

  async function salvar() {
    if (!editor) return
    if (!editor.nome.trim()) { notify.warn('Dê um nome à cadência'); return }
    if (editor.passos.length === 0) { notify.warn('Adicione ao menos um passo'); return }
    setSalvando(true)
    const r = await fetch('/api/cadencias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editor.id, nome: editor.nome, descricao: editor.descricao, ativo: editor.ativo,
        gatilho: editor.gatilho, gatilho_etapa_slug: editor.gatilho_etapa_slug,
        passos: editor.passos.map((p) => ({ ...p, titulo: p.titulo.trim() || `Contatar via ${CANAL_LABEL[p.canal] ?? p.canal}` })),
      }),
    })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Erro ao salvar', j.error); return }
    notify.ok('Cadência salva'); setEditor(null); router.refresh()
  }

  async function confirmarExcluir() {
    if (!excluir) return
    const r = await fetch(`/api/cadencias?id=${excluir.id}`, { method: 'DELETE' })
    setExcluir(null)
    if (!r.ok) { notify.bad('Erro ao excluir'); return }
    notify.ok('Cadência excluída'); router.refresh()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Cadências" />
      <div className="mx-auto w-full max-w-[820px] flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Cadências</h1>
            <p className="mt-0.5 max-w-[540px] text-[13px] text-ink-3">
              Playbooks de contato: uma sequência de toques (ligação, WhatsApp, e-mail) com o intervalo entre eles. O que vencer aparece na <span className="font-medium text-ink-2">Fila do dia</span>.
            </p>
          </div>
          <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={nova} className="shrink-0">Nova cadência</Button>
        </div>

        <ReativacaoCard cadencias={cadenciasIniciais} inicial={reativacao ?? {}} />

        {cadenciasIniciais.length === 0 ? (
          <div className="pt-8">
            <EmptyState
              icon={<Repeat size={24} strokeWidth={1.6} />}
              title="Nenhuma cadência ainda"
              description="Crie a primeira sequência de contatos para guiar a operação do time."
              action={<Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={nova}>Nova cadência</Button>}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {cadenciasIniciais.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-card border border-line bg-card p-4">
                <div className="flex size-9 flex-none items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Repeat size={16} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-ink">{c.nome}</span>
                    {!c.ativo && <Badge tone="neutro">Inativa</Badge>}
                    {c.gatilho === 'entrou_etapa' && <Badge tone="ok">Auto: {etapas.find((e) => e.slug === c.gatilho_etapa_slug)?.label ?? c.gatilho_etapa_slug}</Badge>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {c.passos.length} {c.passos.length === 1 ? 'passo' : 'passos'}
                    {c.passos.length > 0 && ` · ${c.passos.map((p) => CANAL_LABEL[p.canal] ?? p.canal).join(' → ')}`}
                  </div>
                </div>
                <button onClick={() => abrir(c)} className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-ink/[0.05] hover:text-ink" aria-label="Editar"><Pencil size={15} strokeWidth={1.7} /></button>
                <button onClick={() => setExcluir(c)} className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-ink/[0.05] hover:text-bad" aria-label="Excluir"><Trash2 size={15} strokeWidth={1.7} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        size="lg"
        title={editor?.id ? 'Editar cadência' : 'Nova cadência'}
        footer={<>
          <Button variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Salvar</Button>
        </>}
      >
        {editor && (
          <div className="space-y-4">
            <Input label="Nome" value={editor.nome} onChange={(e) => setEditor({ ...editor, nome: e.target.value })} placeholder="Ex.: Novo lead — 5 toques em 7 dias" />
            <Input label="Descrição (opcional)" value={editor.descricao} onChange={(e) => setEditor({ ...editor, descricao: e.target.value })} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label="Inscrição" value={editor.gatilho} onChange={(e) => setEditor({ ...editor, gatilho: e.target.value })}>
                <option value="manual">Manual (pelo card do lead)</option>
                <option value="entrou_etapa">Automática ao entrar numa etapa</option>
              </Select>
              {editor.gatilho === 'entrou_etapa' && (
                <Select label="Etapa gatilho" value={editor.gatilho_etapa_slug} onChange={(e) => setEditor({ ...editor, gatilho_etapa_slug: e.target.value })}>
                  {etapas.length === 0 && <option value="">— sem etapas —</option>}
                  {etapas.map((et) => <option key={et.slug} value={et.slug}>{et.label}</option>)}
                </Select>
              )}
            </div>

            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={editor.ativo} onChange={(e) => setEditor({ ...editor, ativo: e.target.checked })} className="size-4 accent-accent" />
              Cadência ativa
            </label>

            {/* Passos */}
            <div className="border-t border-line-soft pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">Passos (na ordem)</span>
                <button onClick={() => setEditor({ ...editor, passos: [...editor.passos, novoPasso()] })} className="flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
                  <Plus size={13} strokeWidth={2} /> Adicionar passo
                </button>
              </div>
              <div className="space-y-2">
                {editor.passos.map((p, i) => {
                  const Icon = CANAL_ICON[p.canal] ?? Phone
                  return (
                    <div key={i} className="rounded-control border border-line bg-bg p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 flex-none items-center justify-center rounded-full bg-ink/[0.05] text-ink-3"><GripVertical size={13} strokeWidth={1.7} /></span>
                        <span className="text-[12px] font-semibold text-ink-2">Passo {i + 1}</span>
                        <Icon size={14} strokeWidth={1.7} className="text-accent" />
                        <div className="ml-auto flex items-center gap-1">
                          <button onClick={() => mover(i, -1)} disabled={i === 0} className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Subir"><ArrowUp size={13} strokeWidth={1.8} /></button>
                          <button onClick={() => mover(i, 1)} disabled={i === editor.passos.length - 1} className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Descer"><ArrowDown size={13} strokeWidth={1.8} /></button>
                          <button onClick={() => setEditor({ ...editor, passos: editor.passos.filter((_, idx) => idx !== i) })} className="grid size-6 place-items-center rounded text-ink-3 hover:text-bad" aria-label="Remover"><Trash2 size={13} strokeWidth={1.8} /></button>
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
                        <Select value={p.canal} onChange={(e) => setPasso(i, { canal: e.target.value })}>
                          {Object.entries(CANAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                        <Input type="number" min={0} value={String(p.dia_offset)} onChange={(e) => setPasso(i, { dia_offset: Math.max(0, Number(e.target.value) || 0) })} placeholder="Dia" title="Dias após a inscrição" />
                        <Input wrapperClassName="sm:col-span-2" value={p.titulo} onChange={(e) => setPasso(i, { titulo: e.target.value })} placeholder="Instrução (ex.: Ligar e apresentar a proposta)" />
                        {p.canal === 'whatsapp' && templates.length > 0 && (
                          <Select wrapperClassName="sm:col-span-2" value={p.template_chave ?? ''} onChange={(e) => setPasso(i, { template_chave: e.target.value || null })}>
                            <option value="">Sem modelo de mensagem</option>
                            {templates.map((t) => <option key={t} value={t}>Modelo: {t}</option>)}
                          </Select>
                        )}
                      </div>
                      <div className="mt-1.5 text-[11px] text-ink-3">
                        {p.dia_offset === 0 ? 'No dia da inscrição' : `${p.dia_offset} ${p.dia_offset === 1 ? 'dia' : 'dias'} após a inscrição`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExcluir}
        title="Excluir cadência?"
        description={`"${excluir?.nome}" e as inscrições dos leads nela serão removidas. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}

function ReativacaoCard({ cadencias, inicial }: { cadencias: Cadencia[]; inicial: ReativacaoCfg }) {
  const [ativo, setAtivo] = useState(!!inicial.ativo)
  const [dias, setDias] = useState(String(inicial.dias_frio ?? 30))
  const [incluirPerdidos, setIncluirPerdidos] = useState(!!inicial.incluir_perdidos)
  const [cadenciaId, setCadenciaId] = useState(inicial.cadencia_id ? String(inicial.cadencia_id) : '')
  const [salvando, setSalvando] = useState(false)
  const [rodando, setRodando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/reativacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo, dias_frio: Number(dias) || 30, incluir_perdidos: incluirPerdidos, cadencia_id: cadenciaId ? Number(cadenciaId) : null }),
    })
    setSalvando(false)
    if (!r.ok) { notify.bad('Erro ao salvar'); return }
    notify.ok('Reativação salva')
  }

  async function reativarAgora() {
    if (!cadenciaId) { notify.warn('Escolha a cadência de reativação'); return }
    setRodando(true)
    const r = await fetch('/api/reativacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ executar: true }) })
    setRodando(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Erro ao reativar', j.error); return }
    notify.ok('Reativação executada', `${j.reativados ?? 0} lead(s) recolocado(s) na cadência`)
  }

  return (
    <div className="mb-5 rounded-card border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-ink">
        <Snowflake size={15} strokeWidth={1.8} className="text-accent" /> Re-aquecimento de leads frios
      </div>
      <p className="mb-3 text-[12.5px] text-ink-3">Leads parados há muitos dias (e, se quiser, os perdidos) entram numa cadência de reativação — voltam pra Fila do dia em vez de morrer na etapa.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[130px_1fr]">
        <Input type="number" label="Dias parado" value={dias} onChange={(e) => setDias(e.target.value)} />
        <Select label="Cadência de reativação" value={cadenciaId} onChange={(e) => setCadenciaId(e.target.value)}>
          <option value="">— selecionar —</option>
          {cadencias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-accent" /> Reativar automaticamente todo dia
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={incluirPerdidos} onChange={(e) => setIncluirPerdidos(e.target.checked)} className="size-4 accent-accent" /> Incluir leads perdidos
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={salvar} loading={salvando}>Salvar</Button>
        <Button variant="outline" icon={<RefreshCw size={15} strokeWidth={1.8} />} onClick={reativarAgora} loading={rodando} disabled={cadencias.length === 0}>Reativar agora</Button>
      </div>
      {cadencias.length === 0 && <p className="mt-2 text-[11px] text-ink-3">Crie uma cadência acima para usar como trilha de reativação.</p>}
    </div>
  )
}
