'use client'

import { useState, useEffect } from 'react'
import { Save, ArrowLeftRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Button, Input, notify } from '@/components/ui'
import { TOLERANCIA_PADRAO } from '@/lib/troca-referencia'

/**
 * Quanto o vendedor pode passar do preço de referência ao avaliar um aparelho
 * recebido em troca, antes de o PDV exigir um aceite registrado.
 *
 * A tolerância existe porque avaliação nunca bate exatamente com a tabela — e
 * alerta que aparece toda hora vira clique automático, o que anula o log que ele
 * deveria justificar.
 */
export function TrocaCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [pct, setPct] = useState(String(TOLERANCIA_PADRAO))
  const [saving, setSaving] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    (async () => {
      const id = await empresaAtualId(supabase)
      if (!id) { setCarregando(false); return }
      setEmpresaId(id)
      const { data } = await supabase
        .from('configuracoes_sistema').select('valor')
        .eq('empresa_id', id).eq('chave', 'troca').maybeSingle()
      const n = Number((data?.valor as { tolerancia_percentual?: unknown } | null)?.tolerancia_percentual)
      if (Number.isFinite(n) && n >= 0) setPct(String(n))
      setCarregando(false)
    })()
  }, [supabase])

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    const n = Number(pct.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      notify.warn('Informe um percentual entre 0 e 100'); return
    }
    setSaving(true)
    const { error } = await supabase.from('configuracoes_sistema').upsert(
      { empresa_id: empresaId, chave: 'troca', valor: { tolerancia_percentual: n } },
      { onConflict: 'empresa_id,chave' },
    )
    setSaving(false)
    if (error) { notify.bad('Erro ao salvar', error.message); return }
    notify.ok('Tolerância salva')
  }

  return (
    <Card title="Troca de aparelho">
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-ink-2">
          Aviso quando o valor dado ao cliente passa do preço de referência da Tabela de preços.
        </p>
        <div className="flex items-start gap-3 rounded-control border border-line-soft bg-raised p-3">
          <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-control bg-ink/[0.05] text-ink-2">
            <ArrowLeftRight size={16} strokeWidth={1.7} />
          </span>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            No PDV, o valor da troca é comparado com o preço de referência do modelo na
            Tabela de preços. Passando desta margem, o vendedor precisa confirmar que está
            ciente — e o aceite fica registrado na venda, com nome e hora.
            <br />
            <span className="text-ink-3">Pagar abaixo da referência não gera aviso: isso é margem para a loja, não risco.</span>
          </p>
        </div>

        <div className="max-w-[220px]">
          <Input
            label="Tolerância (%)"
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            disabled={carregando}
            className="num"
          />
        </div>
        <p className="text-[11.5px] text-ink-3">
          Com 10%, um aparelho de referência R$ 1.500 aceita até R$ 1.650 sem aviso.
          Zero avisa a qualquer valor acima da referência.
        </p>

        <div className="flex justify-end">
          <Button icon={<Save size={15} strokeWidth={1.7} />} onClick={salvar} loading={saving} disabled={carregando}>
            Salvar
          </Button>
        </div>
      </div>
    </Card>
  )
}
