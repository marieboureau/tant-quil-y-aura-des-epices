const CACHE = 'epices-app-v5'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/logo.png'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put('/index.html', clone))
          return response
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.ok) {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, clone))
        }
        return response
      }).catch(() => cached)

      return cached || network
    })
  )
})
