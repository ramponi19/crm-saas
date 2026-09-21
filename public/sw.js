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

/**
 * QUAL CONVERSA ESTA ABERTA NA TELA, se e que alguma esta.
 *
 * A tela do chat avisa aqui (postMessage) ao trocar de conversa, ao esconder a
 * aba e de tempos em tempos. Serve para nao tocar notificacao de uma conversa
 * que a pessoa esta LENDO neste instante — pedido do dono em 21/09/2026:
 * push "quando a conversa nao estiver aberta".
 *
 * Isto e memoria volatil: o navegador encerra o service worker quando quer, e
 * ao acordar ele nao sabe mais de nada. Nesse caso a notificacao APARECE, de
 * proposito — entre avisar demais e engolir recado de colega, avisar demais e
 * o erro barato.
 */
let conversaAberta = null

self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.tipo === 'chat:conversa') conversaAberta = d.conversa || null
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) { data = {} }
  const title = data.title || 'Nexus'

  event.waitUntil((async () => {
    if (data.conversa && data.conversa === conversaAberta) {
      // Aberta NAO basta: a aba pode estar aberta atras de outra janela, ou o
      // celular no bolso. So cala quando a tela esta de fato a vista.
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const olhando = janelas.some((c) => c.visibilityState === 'visible' && c.url.includes('/chat'))
      if (olhando) return
    }
    return self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/chat' },
    })
  })())
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
