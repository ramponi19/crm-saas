'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { Card, Select, Button, notify } from '@/components/ui'
import { FUSOS_DO_BRASIL, FUSO_PADRAO, agora, formatarHora } from '@/lib/datas'

/**
 * Fuso horário da loja (10/11/2026). Decide o "hoje", o "este mês" e a hora que
 * todas as telas, relatórios e o agendamento público mostram. Padrão: Brasília.
 */
export function FusoCard() {
  const router = useRouter()
  const [fuso, setFuso] = useState<string>(FUSO_PADRAO)
  const [salvo, setSalvo] = useState<string>(FUSO_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch('/api/empresa/fuso').then((r) => r.json()).then((j: { fuso?: string }) => {
      if (j?.fuso) { setFuso(j.fuso); setSalvo(j.fuso) }
    }).catch(() => {}).finally(() => setCarregando(false))
  }, [])

  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/empresa/fuso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fuso }),
    }).catch(() => null)
    setSalvando(false)
    const j = (await r?.json().catch(() => null)) as { error?: string; fuso?: string } | null
    if (!r?.ok) { notify.bad('Não foi possível salvar o fuso', j?.error); return }
    setSalvo(j?.fuso ?? fuso)
    notify.ok('Fuso horário salvo')
    // As telas já abertas recebem o fuso pelo layout: recarrega a árvore do servidor.
    router.refresh()
  }

  // Fuso salvo fora da lista (por API ou superadmin) continua aparecendo como opção.
  const opcoes = FUSOS_DO_BRASIL.some((f) => f.fuso === salvo) ? FUSOS_DO_BRASIL : [{ fuso: salvo, rotulo: salvo }, ...FUSOS_DO_BRASIL]

  return (
    <Card
      title="Fuso horário"
      actions={
        <Button onClick={salvar} loading={salvando} disabled={carregando || fuso === salvo} icon={<Save size={15} strokeWidth={1.7} />}>
          {salvando ? 'Salvando…' : 'Salvar fuso'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Define o <strong className="text-ink">&ldquo;hoje&rdquo;</strong>, o <strong className="text-ink">&ldquo;este mês&rdquo;</strong> e a hora
        mostrada nos painéis, relatórios, agenda e no agendamento público.
      </p>
      <div className="max-w-[360px]">
        <Select label="Fuso da loja" value={fuso} onChange={(e) => setFuso(e.target.value)} disabled={carregando}>
          {opcoes.map((f) => <option key={f.fuso} value={f.fuso}>{f.rotulo}</option>)}
        </Select>
        {!carregando && (
          <p className="mt-1.5 text-[12px] text-ink-3">
            Agora na loja: <span className="num font-semibold text-ink-2">{formatarHora(agora(), '', fuso)}</span>
          </p>
        )}
      </div>
    </Card>
  )
}
