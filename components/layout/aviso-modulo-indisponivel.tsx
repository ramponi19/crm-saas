'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { CATALOGO } from '@/lib/menu'

/**
 * Aviso de quem caiu no dashboard por bater numa rota de módulo que a empresa
 * não tem (a trava vive no middleware, que só sabe redirecionar).
 *
 * Sem isto o funcionário clica no favorito antigo, aparece o dashboard, e ele
 * conclui que o sistema travou — e liga para o dono. Dizer o que aconteceu e de
 * quem depende resolver evita esse telefonema.
 *
 * É BANNER, não toast, e isso foi aprendido no ar: a primeira versão avisava por
 * toast e nada aparecia. O <Toaster> do layout raiz vem depois de {children} e
 * só monta depois deste componente, então o toast era emitido sem ninguém
 * escutando e sumia. Adiar por alguns milissegundos "resolvia" apostando numa
 * corrida — banner é JSX, aparece porque foi renderizado.
 */
export function AvisoModuloIndisponivel() {
  const params = useSearchParams()
  const href = params.get('indisponivel')
  const [fechado, setFechado] = useState(false)

  if (!href || fechado) return null

  const item = CATALOGO.flatMap((g) => g.items).find((i) => i.href === href)

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-warn/25 bg-warn-soft px-5 py-2.5">
      <AlertTriangle size={14} strokeWidth={1.9} className="shrink-0 text-warn" />
      <span className="flex-1 text-[12px] text-ink-2">
        <strong className="font-semibold text-ink">
          {item?.label ?? 'Este módulo'} não está habilitado nesta empresa.
        </strong>{' '}
        Se você precisa desta tela, peça ao responsável pelo CRM para habilitar o módulo.
      </span>
      <button
        onClick={() => setFechado(true)}
        aria-label="Fechar aviso"
        className="shrink-0 text-ink-3 transition-colors hover:text-ink-2"
      >
        <X size={14} strokeWidth={1.9} />
      </button>
    </div>
  )
}
