/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/env\.js$/] }))

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

interface PushPayload {
  title: string
  body: string
  icon?: string
  chatId?: string
  url?: string
  /** Incoming call: keep the notification up and vibrate like a ring. */
  call?: boolean
  tag?: string
}

const isIos = /iphone|ipad|ipod/i.test(self.navigator.userAgent)

self.addEventListener('push', (event) => {
  const data: PushPayload = event.data?.json() ?? { title: 'iemanchat', body: '' }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Skip the system notification when the user is looking at the app (not allowed on iOS).
      const visible = clients.some((c) => c.visibilityState === 'visible' && c.focused)
      if (visible && !isIos) return
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: data.tag ?? data.chatId,
        data: { url: data.url ?? '/' },
        ...(data.call ? { requireInteraction: true, renotify: true, vibrate: [400, 200, 400, 200, 400] } : {}),
      } as NotificationOptions)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = clients[0]
      if (client) {
        await client.focus()
        client.postMessage({ type: 'navigate', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
