'use client'

import { useEffect } from 'react'

/** Registra o service worker do PWA (Fase 6.4). Silencioso e não-bloqueante. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => { navigator.serviceWorker.register('/sw.js').catch(() => {/* silencioso */}) }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])
  return null
}
