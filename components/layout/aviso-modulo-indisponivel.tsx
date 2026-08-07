'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CATALOGO } from '@/lib/menu'
import { notify } from '@/components/ui'

/**
 * Aviso de quem caiu aqui por bater numa rota de módulo que a empresa não tem.
 *
 * A trava vive no middleware, que só sabe redirecionar. Sem este aviso o
 * funcionário clica no favorito antigo, aparece o dashboard, e ele conclui que o
 * sistema travou — e liga para o dono. Dizer o que aconteceu e de quem depende
 * resolver evita esse telefonema.
 */
export function AvisoModuloIndisponivel() {
  const params = useSearchParams()
  const href = params.get('indisponivel')
  const jaAvisou = useRef<string | null>(null)

  useEffect(() => {
    if (!href || jaAvisou.current === href) return
    jaAvisou.current = href

    const item = CATALOGO.flatMap((g) => g.items).find((i) => i.href === href)

    // Duas armadilhas de ordem aqui, ambas descobertas no ar:
    //
    // 1. O <Toaster> do layout raiz vem DEPOIS de {children}, então monta depois
    //    deste componente. Avisar de imediato emite o toast antes de existir
    //    quem escute, e ele some sem aparecer. Daí o atraso.
    // 2. Limpar a URL fora do timeout matava o aviso: o useSearchParams reage na
    //    hora, `href` vira null, as dependências mudam e o cleanup cancelava o
    //    timeout antes de ele disparar. Por isso a limpeza vem DEPOIS do notify.
    const t = setTimeout(() => {
      notify.warn(
        `${item?.label ?? 'Módulo'} não está habilitado nesta empresa`,
        'Se você precisa desta tela, peça ao responsável pelo CRM para habilitar o módulo.',
      )
      const url = new URL(window.location.href)
      url.searchParams.delete('indisponivel')
      window.history.replaceState(null, '', url.pathname + url.search)
    }, 150)

    return () => clearTimeout(t)
  }, [href])

  return null
}
