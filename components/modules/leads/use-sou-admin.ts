'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Usuario } from './types'

/**
 * Dono ou administrador da empresa? Decide só o que a TELA mostra ("Reabrir venda", "Corrigir
 * data da venda"): quem confere de verdade é o banco (reabrir_negocio / corrigir_data_venda →
 * is_empresa_admin). Mesmo critério do painel de responsável (`role` da equipe).
 */
export function useSouAdmin(usuarios: Usuario[]): boolean {
  const [eu, setEu] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    createClient().auth.getUser().then(({ data }) => { if (vivo) setEu(data.user?.id ?? null) })
    return () => { vivo = false }
  }, [])
  return useMemo(() => {
    const u = usuarios.find((x) => x.id === eu)
    return u?.role === 'owner' || u?.role === 'admin'
  }, [usuarios, eu])
}
