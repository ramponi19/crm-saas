import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { situacaoDasRotinas, totalDeAvisos } from '@/lib/rotinas'

/**
 * Faixa de aviso das rotinas agendadas (entrega 1.1r): aparece só para o superadmin, quando há execução com
 * erro ainda não vista ou rotina atrasada. A função do banco confere o superadmin; para os outros, nada.
 */
export async function AvisoRotinas() {
  const situacao = await situacaoDasRotinas(await createClient())
  const total = totalDeAvisos(situacao)
  if (!situacao || total === 0) return null
  const partes = [
    situacao.problemas.length ? `${situacao.problemas.length} execução(ões) com erro` : null,
    situacao.atrasadas ? `${situacao.atrasadas} rotina(s) atrasada(s)` : null,
  ].filter(Boolean)
  return (
    <div role="alert" className="flex items-center gap-2 border-b border-bad/30 bg-bad-soft px-4 py-2 text-[13px] text-bad">
      <AlertTriangle size={15} strokeWidth={1.8} className="shrink-0" />
      <span className="flex-1">Rotinas agendadas: {partes.join(' e ')}.</span>
      <Link href="/superadmin/rotinas" className="font-semibold underline underline-offset-2">Ver rotinas</Link>
    </div>
  )
}
