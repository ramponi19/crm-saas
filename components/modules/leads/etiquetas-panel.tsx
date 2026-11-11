'use client'

/**
 * NO CARD DO LEAD (11/11/2026): as etiquetas do contato (aplicar / tirar) e o histórico do
 * negócio — quem aplicou ou tirou cada etiqueta e quando, junto do resto do que aconteceu com
 * o negócio (etapa, responsável, reabertura, transmissão). O histórico é gravado pelo banco
 * (gatilho em contatos.etiqueta_ids); aqui só se lê.
 */
import { useCallback, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { notify } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { useFuso } from '@/components/fuso-provider'
import { formatarDataHora } from '@/lib/datas'
import { CLASSE_DA_COR, corValida, etiquetasDoContato, fraseDoHistorico } from '@/lib/etiquetas'
import { EscolherEtiqueta, EtiquetaChip, aplicarEtiqueta, useEtiquetas } from '@/components/modules/etiquetas/etiquetas'
import { cn } from '@/lib/utils'
import type { Usuario } from './types'

export function EtiquetasPanel({ negocioId, ids, onMudou }: {
  negocioId: number; ids: number[]; onMudou: (ids: number[]) => void
}) {
  const todas = useEtiquetas()
  const [ocupado, setOcupado] = useState(false)
  const minhas = etiquetasDoContato(ids, todas)

  async function mudar(etiquetaId: number, aplicar: boolean) {
    setOcupado(true)
    const r = await aplicarEtiqueta([negocioId], etiquetaId, aplicar)
    setOcupado(false)
    if (!r.ok) { notify.bad('Não foi possível', r.erro); return }
    if (r.alcancados === 0) { notify.bad('Este lead está fora do seu alcance'); return }
    onMudou(aplicar ? [...new Set([...ids, etiquetaId])].sort((a, b) => a - b) : ids.filter((x) => x !== etiquetaId))
  }

  return (
    <div data-painel-etiquetas className="border-t border-line-soft pt-[13px]">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Etiquetas</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {minhas.map((e) => <EtiquetaChip key={e.id} etiqueta={e} onTirar={ocupado ? undefined : () => mudar(e.id, false)} />)}
        <EscolherEtiqueta jaTem={ids} desabilitado={ocupado} onEscolher={(e) => mudar(e.id, true)} />
      </div>
    </div>
  )
}

interface LinhaHist {
  id: number; acao: string; em: string; por_usuario: string | null; detalhe: Record<string, unknown> | null
  de_responsavel: string | null; para_responsavel: string | null
  de: { label: string } | null; para: { label: string } | null
}

const FRASE: Record<string, string> = {
  pegar: 'Pegou o lead', devolver: 'Devolveu à esteira', transferir: 'Transferiu', atribuir: 'Atribuiu',
  distribuir: 'Distribuído', atribuicao: 'Responsável alterado', reaberto_por_mensagem: 'Reaberto por mensagem do cliente',
  fechamento_juntado: 'Fechamento juntado de outro negócio', respondeu_transmissao: 'Respondeu a uma transmissão',
}

/** O histórico do negócio (as últimas 20 linhas de negocio_historico, pela RLS). */
export function HistoricoNegocioPanel({ negocioId, usuarios, versao }: { negocioId: number; usuarios: Usuario[]; versao: number }) {
  const fuso = useFuso()
  const [linhas, setLinhas] = useState<LinhaHist[] | null>(null)
  const nome = (id: string | null) => (id ? usuarios.find((u) => u.id === id)?.nome ?? 'alguém' : 'o sistema')

  const carregar = useCallback(async () => {
    const { data } = await createClient().from('negocio_historico')
      .select('id, acao, em, por_usuario, detalhe, de_responsavel, para_responsavel, de:funil_etapas!negocio_historico_de_etapa_id_fkey(label), para:funil_etapas!negocio_historico_para_etapa_id_fkey(label)' as string)
      .eq('negocio_id', negocioId).order('em', { ascending: false }).order('id', { ascending: false }).limit(20)
    setLinhas((data ?? []) as unknown as LinhaHist[])
  }, [negocioId])

  // Ler ao abrir e depois de cada mudança feita no card (versao): o setState vem depois da busca.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar, versao])

  if (!linhas?.length) return null
  return (
    <div data-historico-negocio className="border-t border-line-soft pt-[13px]">
      <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        <History size={12} strokeWidth={1.7} /> Histórico do negócio
      </span>
      <div className="space-y-1">
        {linhas.map((h) => {
          const etiqueta = fraseDoHistorico(h.acao, h.detalhe)
          let texto: string
          if (etiqueta) texto = etiqueta
          else if (h.acao === 'etapa') texto = `Etapa: ${h.de?.label ?? '—'} → ${h.para?.label ?? '—'}`
          else texto = FRASE[h.acao] ?? h.acao
          // Responsável nulo = voltou para a esteira; "o sistema" é só para quem FEZ a ação sem usuário.
          if (['transferir', 'atribuir', 'distribuir', 'atribuicao'].includes(h.acao)) {
            texto += ` → ${h.para_responsavel ? nome(h.para_responsavel) : 'esteira (sem dono)'}`
          }
          return (
            <div key={h.id} data-historico-acao={h.acao} className="flex flex-wrap items-center gap-x-1 text-[11.5px] text-ink-3">
              {etiqueta
                ? <span className={cn('rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold', CLASSE_DA_COR[corValida(h.detalhe?.cor)])}>{etiqueta}</span>
                : <span className="text-ink-2">{texto}</span>}
              <span>· {nome(h.por_usuario)} · {formatarDataHora(h.em, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, '', fuso)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
