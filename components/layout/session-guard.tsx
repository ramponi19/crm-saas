'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LAST_SEEN = 'crm_last_seen'
// Só desloga após inatividade REAL (não a cada aba/app novo). 7 dias sem abrir.
const MAX_IDLE_MS = 7 * 24 * 60 * 60 * 1000

// Chamado no login/cadastro — e também renovado a cada carga enquanto a sessão é válida.
export function markSessionActive() {
  if (typeof window !== 'undefined') window.localStorage.setItem(LAST_SEEN, String(Date.now()))
}

/**
 * Guarda de sessão. Colocado no layout do dashboard. Se a última atividade foi
 * há mais de MAX_IDLE_MS, encerra a sessão e volta pro login. Caso contrário
 * (inclusive primeira carga, aba nova, app instalado), mantém e renova o carimbo.
 *
 * Antes usava sessionStorage ("aba nova = logout"), o que deslogava no celular/PWA
 * a cada abertura. Agora é por inatividade, via localStorage, que persiste.
 */
export function SessionGuard() {
  const router = useRouter()

  useEffect(() => {
    const last = Number(window.localStorage.getItem(LAST_SEEN) || 0)
    const now = Date.now()

    if (last && now - last > MAX_IDLE_MS) {
      const supabase = createClient()
      supabase.auth.signOut().finally(() => router.replace('/login'))
      return
    }

    // Sessão válida (o cookie do middleware já garante o acesso) → renova o carimbo.
    markSessionActive()
    const id = setInterval(markSessionActive, 5 * 60 * 1000) // renova enquanto usa
    return () => clearInterval(id)
  }, [router])

  return null
}
