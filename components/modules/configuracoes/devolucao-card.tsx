'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Input, Button, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DEVOLUCAO_PADRAO, type ConfigDevolucao } from '@/lib/esteira'
import { HORARIO_PADRAO, type HorarioLoja } from '@/lib/horario-util'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * Devolução automática do lead à esteira.
 *
 * Fica na aba de SLA porque é a mesma pergunta ("quanto tempo o cliente pode
 * esperar?"), só que com consequência em vez de cor de bolinha.
 */
export function DevolucaoCard() {
  const supabase = createClient()
  const [cfg, setCfg] = useState<ConfigDevolucao>(DEVOLUCAO_PADRAO)
  const [horario, setHorario] = useState<HorarioLoja>(HORARIO_PADRAO)
  const [salvando, setSalvando] = useState(false)
  const [carregou, setCarregou] = useState(false)

  useEffect(() => {
    (async () => {
      const empId = await empresaAtualId(supabase)
      if (!empId) { setCarregou(true); return }
      const [{ data: d }, { data: h }] = await Promise.all([
        supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empId).eq('chave', 'devolucao_esteira').maybeSingle(),
        supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empId).eq('chave', 'horario').maybeSingle(),
      ])
      if (d?.valor) setCfg({ ...DEVOLUCAO_PADRAO, ...(d.valor as Partial<ConfigDevolucao>) })
      if (h?.valor) setHorario({ ...HORARIO_PADRAO, ...(h.valor as Partial<HorarioLoja>) })
      setCarregou(true)
    })()
  }, [supabase])

  async function salvar() {
    if (!(cfg.minutos > 0)) { notify.warn('Informe um prazo maior que zero'); return }
    setSalvando(true)
    const empId = await empresaAtualId(supabase)
    if (!empId) { notify.bad('Empresa não encontrada'); setSalvando(false); return }
    const { error } = await supabase.from('configuracoes_sistema')
      .upsert({ empresa_id: empId, chave: 'devolucao_esteira', valor: cfg } as never, { onConflict: 'empresa_id,chave' })
    setSalvando(false)
    if (error) { notify.bad('Erro ao salvar', error.message); return }
    notify.ok('Regra de devolução salva')
  }

  if (!carregou) return null
  const diasTexto = (horario.dias ?? []).map((d) => DIAS[d]).join(', ') || 'nenhum dia'

  return (
    <Card title="Devolver lead sem resposta"
      actions={<Button onClick={salvar} loading={salvando}>Salvar</Button>}>
      <div className="space-y-3">
        <p className="text-[12.5px] leading-[1.5] text-ink-2">
          Lead com dono que fica sem resposta volta para a esteira e fica livre para qualquer vendedor
          atender. Só <strong className="text-ink">responder o cliente</strong> segura o lead — abrir a
          conversa e sair não conta.
        </p>

        <button type="button" onClick={() => setCfg((c) => ({ ...c, ativo: !c.ativo }))}
          className="flex w-full items-center justify-between rounded-control border border-line p-2.5 text-left transition-colors hover:bg-bg">
          <span className="text-[12.5px] font-medium text-ink">Devolver automaticamente</span>
          <span className={cn('grid h-[22px] w-[38px] flex-none items-center rounded-full px-[3px] transition-colors', cfg.ativo ? 'bg-accent' : 'bg-ink/15')}>
            <span className={cn('block h-4 w-4 rounded-full bg-white transition-transform', cfg.ativo && 'translate-x-4')} />
          </span>
        </button>

        {cfg.ativo && (
          <div className="flex items-center gap-3 rounded-card border border-line bg-raised px-[18px] py-4">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">Prazo para responder</div>
              <div className="text-[11.5px] text-ink-2">Contado só no horário de funcionamento.</div>
            </div>
            <Input type="number" value={String(cfg.minutos)}
              onChange={(e) => setCfg((c) => ({ ...c, minutos: Number(e.target.value) }))}
              className="w-[74px] text-center" />
            <span className="text-[12px] text-ink-2">min</span>
          </div>
        )}

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          O relógio corre das <strong className="text-ink-2">{horario.inicio}</strong> às{' '}
          <strong className="text-ink-2">{horario.fim}</strong>, {diasTexto} — conforme a aba Horário.
          Fora disso ele pausa: lead que chega às 22h não é devolvido às 22h15 com a loja fechada.
        </p>
      </div>
    </Card>
  )
}
