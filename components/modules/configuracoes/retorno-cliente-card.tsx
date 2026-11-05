'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Input, Button, notify } from '@/components/ui'

/** A mesma chave e o mesmo padrão que a Edge `webhook-leads` lê (`posVendaDias`). */
const CHAVE = 'retorno_cliente'
const PADRAO_DIAS = 30

/**
 * Cliente que volta a escrever (decisão do Lucas, 05/11/2026).
 *
 * Fica na aba de SLA, ao lado da devolução, porque decide o que acontece com a
 * conversa que chega — não com o funil. A regra, na Edge que recebe as mensagens:
 *   - negócio aberto na loja: a mensagem entra nele;
 *   - ganho há até N dias: entra nele (é pós-venda);
 *   - ganho há mais de N dias, ou perdido: nasce um negócio novo na primeira etapa do
 *     funil, no mesmo contato, e o antigo fica como estava.
 * Mora em `configuracoes_sistema` (chave `retorno_cliente`), como as outras regras
 * da empresa.
 */
export function RetornoClienteCard() {
  const supabase = createClient()
  const [dias, setDias] = useState(PADRAO_DIAS)
  const [salvando, setSalvando] = useState(false)
  const [carregou, setCarregou] = useState(false)

  useEffect(() => {
    (async () => {
      const empId = await empresaAtualId(supabase)
      if (!empId) { setCarregou(true); return }
      const { data } = await supabase.from('configuracoes_sistema').select('valor')
        .eq('empresa_id', empId).eq('chave', CHAVE).maybeSingle()
      const v = Number((data?.valor as { pos_venda_dias?: unknown } | null)?.pos_venda_dias)
      if (Number.isFinite(v) && v >= 0) setDias(v)
      setCarregou(true)
    })()
  }, [supabase])

  async function salvar() {
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) { notify.warn('Informe de 0 a 365 dias'); return }
    setSalvando(true)
    const empId = await empresaAtualId(supabase)
    if (!empId) { notify.bad('Empresa não encontrada'); setSalvando(false); return }
    const { error } = await supabase.from('configuracoes_sistema')
      .upsert({ empresa_id: empId, chave: CHAVE, valor: { pos_venda_dias: dias } } as never, { onConflict: 'empresa_id,chave' })
    setSalvando(false)
    if (error) { notify.bad('Erro ao salvar', error.message); return }
    notify.ok('Regra do cliente que volta salva')
  }

  if (!carregou) return null

  return (
    <Card title="Cliente que volta a escrever"
      actions={<Button onClick={salvar} loading={salvando}>Salvar</Button>}>
      <div className="space-y-3">
        <p className="text-[12.5px] leading-[1.5] text-ink-2">
          Quando um cliente com negócio <strong className="text-ink">ganho</strong> escreve de novo, a conversa
          entra no mesmo negócio se a venda foi há pouco tempo — é pós-venda. Depois do prazo, ou se o negócio
          foi <strong className="text-ink">perdido</strong>, nasce um negócio novo na primeira etapa do funil, no
          mesmo cliente. O negócio antigo não é reaberto.
        </p>
        <div className="flex items-center gap-3 rounded-card border border-line bg-raised px-[18px] py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink">Pós-venda depois de ganho</div>
            <div className="text-[11.5px] text-ink-2">Contado da data em que o negócio foi para a etapa de ganho.</div>
          </div>
          <Input type="number" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))}
            className="w-[74px] text-center" aria-label="Dias de pós-venda" />
          <span className="text-[12px] text-ink-2">dias</span>
        </div>
      </div>
    </Card>
  )
}
