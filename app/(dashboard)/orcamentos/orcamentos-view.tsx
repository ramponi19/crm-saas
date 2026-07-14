'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Select, Textarea, Modal, Badge, EmptyState, ConfirmDialog, notify } from '@/components/ui'
import { Plus, Pencil, Trash2, Copy, MessageCircle, FileText, Wrench, Sparkles, Repeat2, Smartphone, X } from 'lucide-react'
import { ClienteAutocomplete } from './cliente-autocomplete'

export interface ItemOrc { descricao: string; qtd: number; valor: number }
export interface Orcamento {
  id: number; lead_id: number | null; tipo: string; status: string; cliente_nome: string; cliente_telefone: string | null
  aparelho: string | null; imei: string | null; defeito: string | null; prazo_dias: number | null; garantia_dias: number | null
  itens: ItemOrc[]; aparelho_novo: string | null; valor_novo: number | null; aparelho_usado: string | null; valor_entrada: number | null
  total: number; observacoes: string | null; token: string; created_at: string | null
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TIPO = { assistencia: { label: 'Conserto', Icon: Wrench }, melhoria: { label: 'Upgrade', Icon: Sparkles }, troca: { label: 'Troca', Icon: Repeat2 }, venda: { label: 'Venda', Icon: Smartphone } } as const
const STATUS: Record<string, { label: string; tone: 'neutro' | 'acc' | 'ok' | 'bad' }> = {
  rascunho: { label: 'Rascunho', tone: 'neutro' }, enviado: { label: 'Enviado', tone: 'acc' },
  aprovado: { label: 'Aprovado', tone: 'ok' }, recusado: { label: 'Recusado', tone: 'bad' },
}
const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')

interface Editor {
  id?: number; lead_id?: number | null; tipo: string; cliente_nome: string; cliente_telefone: string
  aparelho: string; imei: string; defeito: string; prazo_dias: string; garantia_dias: string
  itens: ItemOrc[]; aparelho_novo: string; valor_novo: string; aparelho_usado: string; valor_entrada: string
  observacoes: string
}
const vazio = (tipo = 'assistencia'): Editor => ({
  tipo, lead_id: null, cliente_nome: '', cliente_telefone: '', aparelho: '', imei: '', defeito: '', prazo_dias: '', garantia_dias: '',
  itens: [{ descricao: '', qtd: 1, valor: 0 }], aparelho_novo: '', valor_novo: '', aparelho_usado: '', valor_entrada: '', observacoes: '',
})
const LABEL_DESC: Record<string, string> = { assistencia: 'Defeito / diagnóstico', melhoria: 'Objetivo do upgrade', venda: 'Descrição do aparelho' }

export function OrcamentosView({ orcamentosIniciais, segmento }: { orcamentosIniciais: Orcamento[]; segmento?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipoPadrao = segmento === 'assistencia' ? 'assistencia' : 'assistencia'
  const [editor, setEditor] = useState<Editor | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<Orcamento | null>(null)

  // Pré-preenchimento quando vem do lead (?nome=&tel=&lead=&tipo=).
  useEffect(() => {
    const nome = searchParams.get('nome')
    if (!nome) return
    const tipoQ = searchParams.get('tipo') ?? 'venda'
    setEditor({
      ...vazio(['assistencia', 'melhoria', 'troca', 'venda'].includes(tipoQ) ? tipoQ : 'venda'),
      cliente_nome: nome,
      cliente_telefone: searchParams.get('tel') ?? '',
      lead_id: searchParams.get('lead') ? Number(searchParams.get('lead')) : null,
    })
    router.replace('/orcamentos')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const linkDe = (o: Orcamento) => `${base}/orcamento/${o.token}`

  const totalEditor = editor
    ? editor.tipo === 'troca'
      ? Math.max(0, (Number(editor.valor_novo) || 0) - (Number(editor.valor_entrada) || 0))
      : editor.itens.reduce((s, i) => s + Math.max(1, i.qtd) * (Number(i.valor) || 0), 0)
    : 0

  function abrir(o?: Orcamento) {
    if (!o) { setEditor(vazio(tipoPadrao)); return }
    setEditor({
      id: o.id, lead_id: o.lead_id, tipo: o.tipo, cliente_nome: o.cliente_nome, cliente_telefone: o.cliente_telefone ?? '',
      aparelho: o.aparelho ?? '', imei: o.imei ?? '', defeito: o.defeito ?? '',
      prazo_dias: o.prazo_dias != null ? String(o.prazo_dias) : '', garantia_dias: o.garantia_dias != null ? String(o.garantia_dias) : '',
      itens: o.itens.length ? o.itens.map((i) => ({ ...i })) : [{ descricao: '', qtd: 1, valor: 0 }],
      aparelho_novo: o.aparelho_novo ?? '', valor_novo: o.valor_novo != null ? String(o.valor_novo) : '',
      aparelho_usado: o.aparelho_usado ?? '', valor_entrada: o.valor_entrada != null ? String(o.valor_entrada) : '',
      observacoes: o.observacoes ?? '',
    })
  }

  function setItem(i: number, patch: Partial<ItemOrc>) {
    setEditor((e) => e && ({ ...e, itens: e.itens.map((x, idx) => idx === i ? { ...x, ...patch } : x) }))
  }

  async function salvar(enviar: boolean) {
    if (!editor) return
    if (!editor.cliente_nome.trim()) { notify.warn('Informe o cliente'); return }
    setSalvando(true)
    const r = await fetch('/api/orcamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editor.id, lead_id: editor.lead_id ?? null, tipo: editor.tipo, status: enviar ? 'enviado' : undefined,
        cliente_nome: editor.cliente_nome, cliente_telefone: editor.cliente_telefone,
        aparelho: editor.aparelho, imei: editor.imei, defeito: editor.defeito,
        prazo_dias: editor.prazo_dias ? Number(editor.prazo_dias) : undefined,
        garantia_dias: editor.garantia_dias ? Number(editor.garantia_dias) : undefined,
        itens: editor.itens,
        aparelho_novo: editor.aparelho_novo, valor_novo: Number(editor.valor_novo) || 0,
        aparelho_usado: editor.aparelho_usado, valor_entrada: Number(editor.valor_entrada) || 0,
        observacoes: editor.observacoes,
      }),
    })
    setSalvando(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Erro ao salvar', j.error); return }
    if (enviar && j.token) { navigator.clipboard?.writeText(`${base}/orcamento/${j.token}`); notify.ok('Orçamento salvo', 'Link copiado para enviar ao cliente') }
    else notify.ok('Orçamento salvo')
    setEditor(null); router.refresh()
  }

  async function confirmarExcluir() {
    if (!excluir) return
    const r = await fetch(`/api/orcamentos?id=${excluir.id}`, { method: 'DELETE' })
    setExcluir(null)
    if (!r.ok) { notify.bad('Erro ao excluir'); return }
    notify.ok('Orçamento excluído'); router.refresh()
  }

  function whatsapp(o: Orcamento) {
    const d = soDigitos(o.cliente_telefone); const num = d && d.length <= 11 ? '55' + d : d
    const msg = `Olá, ${o.cliente_nome}! Segue seu orçamento: ${linkDe(o)}`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const isTroca = editor?.tipo === 'troca'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Orçamentos" />
      <div className="mx-auto w-full max-w-[900px] flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Orçamentos</h1>
            <p className="text-[13px] text-ink-3">Conserto, upgrade e troca — com link pro cliente aprovar.</p>
          </div>
          <Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => abrir()} className="shrink-0">Novo orçamento</Button>
        </div>

        {orcamentosIniciais.length === 0 ? (
          <div className="pt-8">
            <EmptyState icon={<FileText size={24} strokeWidth={1.6} />} title="Nenhum orçamento ainda"
              description="Crie um orçamento de conserto, upgrade ou troca e envie o link pro cliente aprovar."
              action={<Button icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => abrir()}>Novo orçamento</Button>} />
          </div>
        ) : (
          <div className="space-y-2">
            {orcamentosIniciais.map((o) => {
              const t = TIPO[o.tipo as keyof typeof TIPO] ?? TIPO.assistencia
              const st = STATUS[o.status] ?? STATUS.rascunho
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-card border border-line bg-card p-3.5">
                  <div className="flex size-9 flex-none items-center justify-center rounded-full bg-accent/10 text-accent"><t.Icon size={16} strokeWidth={1.8} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-ink">{o.cliente_nome}</span>
                      <Badge tone="neutro">{t.label}</Badge>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="truncate text-[12px] text-ink-3">{o.aparelho || o.aparelho_novo || '—'} · <span className="num font-medium text-ink-2">{brl(o.total)}</span></div>
                  </div>
                  <button onClick={() => { navigator.clipboard?.writeText(linkDe(o)); notify.ok('Link copiado') }} className="grid size-8 place-items-center rounded-control text-ink-3 hover:text-ink" aria-label="Copiar link"><Copy size={15} strokeWidth={1.7} /></button>
                  <button onClick={() => whatsapp(o)} disabled={!o.cliente_telefone} className="grid size-8 place-items-center rounded-control text-ink-3 hover:text-ok disabled:opacity-30" aria-label="WhatsApp"><MessageCircle size={15} strokeWidth={1.7} /></button>
                  <button onClick={() => abrir(o)} className="grid size-8 place-items-center rounded-control text-ink-3 hover:text-ink" aria-label="Editar"><Pencil size={15} strokeWidth={1.7} /></button>
                  <button onClick={() => setExcluir(o)} className="grid size-8 place-items-center rounded-control text-ink-3 hover:text-bad" aria-label="Excluir"><Trash2 size={15} strokeWidth={1.7} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={!!editor} onClose={() => setEditor(null)} size="lg" title={editor?.id ? 'Editar orçamento' : 'Novo orçamento'}
        footer={<>
          <Button variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
          <Button variant="outline" onClick={() => salvar(false)} loading={salvando}>Salvar</Button>
          <Button onClick={() => salvar(true)} loading={salvando}>Salvar e copiar link</Button>
        </>}>
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select label="Tipo" value={editor.tipo} onChange={(e) => setEditor({ ...editor, tipo: e.target.value })}>
                <option value="assistencia">Conserto</option>
                <option value="melhoria">Upgrade (melhoria)</option>
                <option value="venda">Venda (novo/semi-novo)</option>
                <option value="troca">Troca (com diferença)</option>
              </Select>
              <ClienteAutocomplete
                nome={editor.cliente_nome}
                onNome={(v) => setEditor({ ...editor, cliente_nome: v })}
                onSelect={(c) => setEditor({ ...editor, cliente_nome: c.nome, cliente_telefone: c.telefone })}
              />
              <Input label="WhatsApp/telefone" value={editor.cliente_telefone} onChange={(e) => setEditor({ ...editor, cliente_telefone: e.target.value })} />
            </div>

            {isTroca ? (
              <div className="space-y-3 rounded-control border border-line-soft p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                  <Input label="Aparelho novo" value={editor.aparelho_novo} onChange={(e) => setEditor({ ...editor, aparelho_novo: e.target.value })} placeholder="Ex.: iPhone 14 128GB" />
                  <Input label="Valor (R$)" type="number" value={editor.valor_novo} onChange={(e) => setEditor({ ...editor, valor_novo: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                  <Input label="Aparelho do cliente (entrada)" value={editor.aparelho_usado} onChange={(e) => setEditor({ ...editor, aparelho_usado: e.target.value })} placeholder="Ex.: iPhone 12 64GB" />
                  <Input label="Vale (R$)" type="number" value={editor.valor_entrada} onChange={(e) => setEditor({ ...editor, valor_entrada: e.target.value })} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input label="Aparelho" value={editor.aparelho} onChange={(e) => setEditor({ ...editor, aparelho: e.target.value })} placeholder="Modelo" />
                  <Input label="IMEI / série (opcional)" value={editor.imei} onChange={(e) => setEditor({ ...editor, imei: e.target.value })} />
                </div>
                <Textarea label={LABEL_DESC[editor.tipo] ?? 'Descrição'} rows={2} value={editor.defeito} onChange={(e) => setEditor({ ...editor, defeito: e.target.value })} />

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-ink">Itens (peças + mão de obra)</span>
                    <button onClick={() => setEditor({ ...editor, itens: [...editor.itens, { descricao: '', qtd: 1, valor: 0 }] })} className="flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"><Plus size={13} strokeWidth={2} /> Adicionar</button>
                  </div>
                  <div className="space-y-2">
                    {editor.itens.map((it, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_100px_auto] items-center gap-2">
                        <Input value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} placeholder="Descrição" />
                        <Input type="number" value={String(it.qtd)} onChange={(e) => setItem(i, { qtd: Math.max(1, Number(e.target.value) || 1) })} title="Qtd" />
                        <Input type="number" value={String(it.valor)} onChange={(e) => setItem(i, { valor: Number(e.target.value) || 0 })} title="Valor unit." />
                        <button onClick={() => setEditor({ ...editor, itens: editor.itens.filter((_, idx) => idx !== i) })} className="text-ink-3 hover:text-bad" aria-label="Remover"><X size={15} strokeWidth={1.8} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Prazo (dias)" type="number" value={editor.prazo_dias} onChange={(e) => setEditor({ ...editor, prazo_dias: e.target.value })} />
                  <Input label="Garantia (dias)" type="number" value={editor.garantia_dias} onChange={(e) => setEditor({ ...editor, garantia_dias: e.target.value })} />
                </div>
              </>
            )}

            <Textarea label="Observações (opcional)" rows={2} value={editor.observacoes} onChange={(e) => setEditor({ ...editor, observacoes: e.target.value })} />

            <div className="flex items-center justify-between rounded-control bg-accent-soft px-4 py-3">
              <span className="text-[13px] font-medium text-ink-2">{isTroca ? 'Cliente paga' : 'Total'}</span>
              <span className="num text-[20px] font-bold text-accent">{brl(totalEditor)}</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!excluir} onClose={() => setExcluir(null)} onConfirm={confirmarExcluir}
        title="Excluir orçamento?" description={`O orçamento de "${excluir?.cliente_nome}" será removido.`} confirmLabel="Excluir" tone="danger" />
    </div>
  )
}
