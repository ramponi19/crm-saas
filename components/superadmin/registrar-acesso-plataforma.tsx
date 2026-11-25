'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Toda tela que a plataforma (superadmin impersonando) abre dentro de uma empresa vai para a Auditoria dela
 * (etapa 1.1b). O banco grava no máximo uma linha por rota por minuto e ignora quem não está impersonando.
 */
export function RegistrarAcessoPlataforma() {
  const rota = usePathname()
  useEffect(() => {
    if (!rota) return
    createClient().rpc('plataforma_registrar_acesso' as never, { p_rota: rota } as never).then(() => undefined, () => undefined)
  }, [rota])
  return null
}
