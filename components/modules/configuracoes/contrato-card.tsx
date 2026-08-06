'use client'

import { useState, useEffect } from 'react'
import { Save, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Button, Input, notify } from '@/components/ui'
import { GARANTIA_PADRAO_DIAS } from '@/lib/contrato-emitir'

/**
 * Garantia padrão da loja, impressa no contrato de venda.
 *
 * Vale para os produtos sem garantia própria no cadastro. O valor vigente é
 * CONGELADO em cada contrato emitido — mudar aqui não altera contrato já
 * assinado, só os próximos.
 */
export function ContratoCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [dias, setDias] = useState(String(GARANTIA_PADRAO_DIAS))
  const [saving, setSaving] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    (async () => {
      const id = await empresaAtualId(supabase)
      if (!id) { setCarregando(false); return }
      setEmpresaId(id)
      const { data } = await supabase
        .from('configuracoes_sistema').select('valor')
        .eq('empresa_id', id).eq('chave', 'contrato').maybeSingle()
      const n = Number((data?.valor as { garantia_dias?: unknown } | null)?.garantia_dias)
      if (Number.isFinite(n) && n > 0) setDias(String(Math.round(n)))
      setCarregando(false)
    })()
  }, [supabase])

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    const n = Number(dias)
    if (!Number.isFinite(n) || n <= 0) { notify.warn('Informe um número de dias maior que zero'); return }
    setSaving(true)
    const { error } = await supabase.from('configuracoes_sistema').upsert({
      empresa_id: empresaId, chave: 'contrato', valor: { garantia_dias: Math.round(n) },
    } as never, { onConflict: 'empresa_id,chave' })
    setSaving(false)
    if (error) { notify.bad('Erro ao salvar', error.message); return }
    notify.ok('Garantia padrão salva', 'Vale para as próximas vendas')
  }

  return (
    <Card
      title="Contrato de venda"
      actions={
        <Button onClick={salvar} loading={saving} disabled={carregando} icon={<Save size={15} strokeWidth={1.7} />}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        O contrato é emitido e arquivado ao finalizar a venda. No Histórico, o botão{' '}
        <FileText size={12} strokeWidth={1.9} className="inline align-[-1px] text-ink-3" /> reimprime a 2ª via —
        cópia fiel do que foi assinado, não um documento novo.
      </p>

      <Input
        label="Garantia padrão (dias)"
        type="number"
        min={1}
        wrapperClassName="max-w-[220px]"
        value={dias}
        onChange={(e) => setDias(e.target.value)}
        placeholder={String(GARANTIA_PADRAO_DIAS)}
      />
      <p className="mt-2 text-[11.5px] text-ink-3">
        Vale para produtos sem garantia própria. Para definir por modelo (novo 90, seminovo 30…), use o campo
        <strong className="text-ink-2"> Garantia</strong> no cadastro do produto. Alterar aqui não muda contrato já emitido.
      </p>
    </Card>
  )
}
