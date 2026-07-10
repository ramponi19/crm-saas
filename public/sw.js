// Service worker do Nexus (PWA). Deliberadamente MÍNIMO e seguro:
// - NÃO cacheia páginas autenticadas nem respostas de API (app com auth + realtime).
// - Só serve uma página offline quando uma NAVEGAÇÃO falha por falta de rede.
const CACHE = 'nexus-shell-v1'
const OFFLINE = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Só interceptamos navegações (documento). Todo o resto vai direto pra rede.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
  }
})
