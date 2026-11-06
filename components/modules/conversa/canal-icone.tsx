/**
 * Ícone do canal (marca original de WhatsApp/Instagram/Messenger; site e manual neutros).
 * Saiu de dentro do cartão do lead (06/11/2026) para a busca do topo mostrar os canais
 * de cada contato com o mesmo desenho.
 */
export function OrigemIcon({ origem, size = 16 }: { origem: string; size?: number }) {
  const o = (origem || 'manual').toLowerCase()
  if (o === 'whatsapp') return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-none"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.16c-.24.68-1.42 1.31-1.96 1.36-.5.05-1.14.07-1.84-.12-.42-.13-.97-.31-1.66-.61-2.93-1.27-4.85-4.22-5-4.42-.15-.2-1.2-1.59-1.2-3.03 0-1.44.76-2.15 1.02-2.44.27-.29.59-.37.79-.37.2 0 .39 0 .57.01.18.01.43-.07.67.51.24.6.83 2.04.9 2.19.07.15.12.32.02.51-.09.2-.14.32-.27.49-.14.17-.29.38-.41.51-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.12.59-.07.16-.2.68-.79.86-1.06.18-.27.36-.22.61-.13.25.09 1.58.74 1.86.88.27.14.46.2.52.31.07.12.07.66-.17 1.34z" fill="#25D366" /></svg>
  )
  if (o === 'messenger') return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-none"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.14.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.53-.04 1.91.53 3.92.5 5.81-.07C20.36 19.85 22 16.04 22 11.7 22 6.13 17.64 2 12 2zm6 7.46l-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75a.6.6 0 00-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75c.21.16.51.16.72 0l3.16-2.4c.42-.32.97.18.69.63z" fill="#0084FF" /></svg>
  )
  if (o === 'instagram') return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-none">
      <defs><linearGradient id="igGrad" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FEDA75" /><stop offset=".3" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset="1" stopColor="#962FBF" /></linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#igGrad)" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.25" fill="#fff" />
    </svg>
  )
  // site / portais / outros → globo; manual → pessoa. Neutro.
  if (o === 'site' || o === 'grupo-olx' || o === 'portais') return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-none text-ink-3"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-none text-ink-3"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
  )
}
