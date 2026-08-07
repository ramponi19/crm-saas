'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Receipt, Plus, Copy, Loader2 } from 'lucide-react'
import { Button, Badge, notify } from '@/components/ui'
import {
  OrcamentoEditorModal, orcamentoVazio, type EditorOrcamento,
} from '@/components/modules/orcamentos/orcamento-editor-modal'

interface Orc { id: number; tipo: string; status: string; total: number; token: string }
const TIPO_LABEL: Record<string, string> = { assistencia: 'Conserto', melhoria: 'Upgrade', downgrade: 'Downgrade', venda: 'Venda' }
const STATUS: Record<string, { l: string; t: 'neutro' | 'acc' | 'ok' | 'bad' }> = {
  rascunho: { l: 'Rascunho', t: 'neutro' }, enviado: { l: 'Enviado', t: 'acc' }, aprovado: { l: 'Aprovado', t: 'ok' }, recusado: { l: 'Recusado', t: 'bad' },
}
const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function LeadOrcamentoPanel({ leadId, leadNome, leadTelefone, onSalvo }: {
  leadId: number
  leadNome?: string | null
  leadTelefone?: string | null
  /** Avisa o chat que um orçamento foi salvo — é o gancho que move a etapa. */
  onSalvo?: () => void
}) {
  const supabase = createClient()
  const [itens, setItens] = useState<Orc[]>([])
  const [carregou, setCarregou] = useState(false)
  const [editor, setEditor] = useState<EditorOrcamento | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamentos').select('id, tipo, status, total, token').eq('lead_id', leadId).order('created_at', { ascending: false })
    setItens((data ?? []) as Orc[]); setCarregou(true)
  }, [leadId, supabase])
  useEffect(() => { carregar() }, [carregar])

  /**
   * Abre o editor POR CIMA da conversa. Antes isto era
   * router.push('/orcamentos?...'): o atendente saía do chat no meio do
   * atendimento e não tinha caminho de volta para a conversa.
   */
  function novo(tipo: string) {
    setEditor({
      ...orcamentoVazio(tipo),
      cliente_nome: leadNome ?? '',
      cliente_telefone: leadTelefone ?? '',
      lead_id: leadId,
    })
  }

  function copiar(o: Orc) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    navigator.clipboard?.writeText(`${base}/orcamento/${o.token}`); notify.ok('Link copiado')
  }

  if (!carregou) return <div className="border-t border-line-soft pt-4 mt-1 p-1 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando orçamentos…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="mb-3 flex items-center gap-2">
        <Receipt size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Orçamentos</span>
      </div>

      {itens.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {itens.map((o) => {
            const st = STATUS[o.status] ?? STATUS.rascunho
            return (
              <div key={o.id} className="flex items-center gap-2 rounded-control border border-line p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-ink">{TIPO_LABEL[o.tipo] ?? o.tipo}</span>
                    <Badge tone={st.t}>{st.l}</Badge>
                  </div>
                  <div className="num text-[11.5px] text-ink-3">{brl(o.total)}</div>
                </div>
                <button type="button" onClick={() => copiar(o)} className="shrink-0 text-ink-3 hover:text-ink" aria-label="Copiar link"><Copy size={13} strokeWidth={1.7} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('venda')}>Venda / semi-novo</Button>
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('downgrade')}>Downgrade</Button>
        <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.7} />} onClick={() => novo('assistencia')}>Conserto</Button>
      </div>

      {editor && (
        <OrcamentoEditorModal
          inicial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { carregar(); onSalvo?.() }}
        />
      )}
    </div>
  )
}
