import type { MetadataRoute } from 'next'

// PWA (Fase 6.4) — app instalável do Nexus. Ícones em /public/icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexus CRM',
    short_name: 'Nexus',
    description: 'Nexus — CRM por segmento: venda com processo, cresça com controle.',
    start_url: '/entrar',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#15181C',
    theme_color: '#15181C',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
