import Link from 'next/link'
import { AlertTriangle, Lock } from 'lucide-react'
import type { Situacao } from '@/lib/situacao-empresa'
import { textoDaSituacao } from '@/lib/situacao-empresa'

/**
 * O aviso da assinatura no topo de toda tela da empresa (17/11/2026): teste acabando, pagamento
 * atrasado, modo somente leitura. Não se dispensa: some quando a situação muda. O dono vai direto ao
 * plano; quem não é dono só fica sabendo.
 */
export function SituacaoBanner({ situacao, podePagar }: { situacao: Situacao; podePagar: boolean }) {
  const t = textoDaSituacao(situacao)
  if (!t) return null
  const erro = t.tom === 'erro'
  const Icone = erro ? Lock : AlertTriangle
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[12.5px] ${erro ? 'border-bad/30 bg-bad-soft text-bad' : 'border-warn/30 bg-warn-soft text-ink'}`}>
      <Icone size={14} strokeWidth={1.8} className="flex-none" />
      <span className="font-semibold">{t.titulo}</span>
      <span className="min-w-0 flex-1 text-ink-2">{t.corpo}</span>
      {podePagar && (
        <Link href="/configuracoes/faturamento" className="font-medium underline underline-offset-2">
          Ver plano
        </Link>
      )}
    </div>
  )
}
