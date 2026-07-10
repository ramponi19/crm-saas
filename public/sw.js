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

// --- Web Push (notificação do chat no celular) ---
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) { data = {} }
  const title = data.title || 'Nexus'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/chat' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/chat'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      for (const c of clientes) {
        if (c.url.includes(url) && 'focus' in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
