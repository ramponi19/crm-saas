'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const SESSION_KEY = 'crm_session_active'

// Marks an active browser session in sessionStorage.
// Called once after successful login so the guard knows the session is intentional.
export function markSessionActive() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_KEY, '1')
  }
}

// Placed in the dashboard layout. On every page load, checks whether the
// sessionStorage sentinel exists. If not (browser was closed/restored), the
// Supabase cookie may still be present but we treat it as expired and sign out.
export function SessionGuard() {
  const router = useRouter()

  useEffect(() => {
    const active = window.sessionStorage.getItem(SESSION_KEY)
    if (!active) {
      // Browser was closed — kill the server session and redirect to login.
      const supabase = createClient()
      supabase.auth.signOut().finally(() => {
        router.replace('/login')
      })
    }
  }, [router])

  return null
}
