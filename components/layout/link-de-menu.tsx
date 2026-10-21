'use client'

import Link from 'next/link'
import { useState, type ComponentProps } from 'react'

/**
 * LINK DOS MENUS LATERAIS: SÓ PRÉ-CARREGA QUANDO A PESSOA MOSTRA INTENÇÃO (21/10/2026).
 *
 * O `<Link>` padrão pré-carrega a rota assim que ela aparece na tela. No menu
 * lateral, isso é TODO item, a cada página aberta: a Observability da Vercel
 * mostrou ~40 invocações em cada item do menu em 12 h (/leads, /tarefas,
 * /estoque, /simular-parcela...) — função cobrada como CPU ativa (teto do plano
 * é 4 h/mês) para telas que ninguém abriu.
 *
 * Aqui o pré-carregamento só liga no mouse em cima, no toque ou no foco do
 * teclado (`prefetch={false}` sozinho desliga até no hover no App Router; o
 * padrão é o "Hover-triggered prefetch" do guia de prefetching do Next).
 */
export function LinkDeMenu({ onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [intencao, setIntencao] = useState(false)
  return (
    <Link
      {...props}
      prefetch={intencao ? null : false}
      onMouseEnter={(e) => { setIntencao(true); onMouseEnter?.(e) }}
      onTouchStart={(e) => { setIntencao(true); onTouchStart?.(e) }}
      onFocus={(e) => { setIntencao(true); onFocus?.(e) }}
    />
  )
}
