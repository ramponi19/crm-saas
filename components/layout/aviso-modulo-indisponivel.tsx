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

    // O <Toaster> do layout raiz vem DEPOIS de {children}, então monta depois
    // deste componente. Avisar direto aqui emite o toast antes de existir quem
    // escute, e ele some sem aparecer — foi o que aconteceu na primeira versão.
    const t = setTimeout(() => {
      notify.warn(
        `${item?.label ?? 'Módulo'} não está habilitado nesta empresa`,
        'Se você precisa desta tela, peça ao responsável pelo CRM para habilitar o módulo.',
      )
    }, 100)

    // Tira o parâmetro da URL para o aviso não voltar se a pessoa recarregar.
    const url = new URL(window.location.href)
    url.searchParams.delete('indisponivel')
    window.history.replaceState(null, '', url.pathname + url.search)

    return () => clearTimeout(t)
  }, [href])

  return null
}
