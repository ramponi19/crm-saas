'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Badge, EmptyState, ConfirmDialog, notify } from '@/components/ui'
import { Plus, Pencil, Trash2, Copy, MessageCircle, FileText, Wrench, Sparkles, Repeat2, Smartphone } from 'lucide-react'
import {
  OrcamentoEditorModal, orcamentoVazio, editorDoOrcamento, type EditorOrcamento,
} from '@/components/modules/orcamentos/orcamento-editor-modal'

export type { ItemOrc, Orcamento, UnidadeOpt, PrecoRef } from './tipos'
import type { Orcamento, UnidadeOpt, PrecoRef } from './tipos'

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// `downgrade` era 'troca'. Renomeado tambem no valor gravado, nao so no rotulo:
// nao havia nenhum orcamento no banco nem CHECK na coluna, entao renomear evita
// codigo dizendo 'troca' e tela dizendo outra coisa. NAO confundir com
// `inventario_unidades.tipo = 'troca'`, que continua 'troca' — e o tipo de ENTRADA
// da peca no estoque, outro dominio, usado pelo PDV.
const TIPO = { assistencia: { label: 'Conserto', Icon: Wrench }, melhoria: { label: 'Upgrade', Icon: Sparkles }, downgrade: { label: 'Downgrade', Icon: Repeat2 }, venda: { label: 'Venda', Icon: Smartphone } } as const
const STATUS: Record<string, { label: string; tone: 'neutro' | 'acc' | 'ok' | 'bad' }> = {
  rascunho: { label: 'Rascunho', tone: 'neutro' }, enviado: { label: 'Enviado', tone: 'acc' },
  aprovado: { label: 'Aprovado', tone: 'ok' }, recusado: { label: 'Recusado', tone: 'bad' },
}
const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')

export function OrcamentosView({ orcamentosIniciais, unidades = [], tabelaPrecos = [] }: { orcamentosIniciais: Orcamento[]; segmento?: string; unidades?: UnidadeOpt[]; tabelaPrecos?: PrecoRef[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Era um ternário com o MESMO valor nos dois lados — comparava o segmento e
  // devolvia 'assistencia' de qualquer forma. A intenção original se perdeu; fica
  // a constante, que é o que o código sempre fez.
  const tipoPadrao = 'assistencia'
  const [editor, setEditor] = useState<EditorOrcamento | null>(null)
  const [excluir, setExcluir] = useState<Orcamento | null>(null)

  // Pré-preenchimento quando vem de um link antigo (?nome=&tel=&lead=&tipo=).
  // O chat do lead não usa mais este caminho — abre o editor por cima da
  // conversa —, mas link salvo ou aba antiga continua funcionando.
  useEffect(() => {
    const nome = searchParams.get('nome')
    if (!nome) return
    const tipoQ = searchParams.get('tipo') ?? 'venda'
    setEditor({
      ...orcamentoVazio(['assistencia', 'melhoria', 'downgrade', 'venda'].includes(tipoQ) ? tipoQ : 'venda'),
      cliente_nome: nome,
      cliente_telefone: searchParams.get('tel') ?? '',
      lead_id: searchParams.get('lead') ? Number(searchParams.get('lead')) : null,
    })
    router.replace('/orcamentos')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const linkDe = (o: Orcamento) => `${base}/orcamento/${o.token}`

  function abrir(o?: Orcamento) {
    setEditor(o ? editorDoOrcamento(o) : orcamentoVazio(tipoPadrao))
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

  return (
    <>
      <div className="mx-auto w-full max-w-[900px] min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
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
                    <div className="truncate text-[12px] text-ink-3">
                      {o.aparelho || o.aparelho_novo || '—'} ·{' '}
                      {(o.valor_devolver ?? 0) > 0
                        ? <span className="num font-medium text-ok">a devolver {brl(o.valor_devolver ?? 0)}</span>
                        : <span className="num font-medium text-ink-2">{brl(o.total)}</span>}
                    </div>
                  </div>
                  <button onClick={() => { navigator.clipboard?.writeText(linkDe(o)); notify.ok('Link copiado') }} className="grid size-9 place-items-center rounded-control text-ink-3 hover:text-ink" aria-label="Copiar link"><Copy size={15} strokeWidth={1.7} /></button>
                  <button onClick={() => whatsapp(o)} disabled={!o.cliente_telefone} className="grid size-9 place-items-center rounded-control text-ink-3 hover:text-ok disabled:opacity-30" aria-label="WhatsApp"><MessageCircle size={15} strokeWidth={1.7} /></button>
                  <button onClick={() => abrir(o)} className="grid size-9 place-items-center rounded-control text-ink-3 hover:text-ink" aria-label="Editar"><Pencil size={15} strokeWidth={1.7} /></button>
                  <button onClick={() => setExcluir(o)} className="grid size-9 place-items-center rounded-control text-ink-3 hover:text-bad" aria-label="Excluir"><Trash2 size={15} strokeWidth={1.7} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editor && (
        <OrcamentoEditorModal
          inicial={editor}
          unidades={unidades}
          tabelaPrecos={tabelaPrecos}
          onClose={() => setEditor(null)}
          onSaved={() => router.refresh()}
        />
      )}

      <ConfirmDialog open={!!excluir} onClose={() => setExcluir(null)} onConfirm={confirmarExcluir}
        title="Excluir orçamento?" description={`O orçamento de "${excluir?.cliente_nome}" será removido.`} confirmLabel="Excluir" tone="danger" />
    </>
  )
}
