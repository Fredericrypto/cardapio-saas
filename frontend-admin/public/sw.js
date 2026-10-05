// Service Worker do PAINEL ADMIN — só Web Push das notificações INTERNAS da
// equipe (anotações). É um app/origem diferente do cardápio do cliente: este
// arquivo nunca roda no celular do cliente e o cardápio nunca recebe estes
// avisos. Sem cache de assets de propósito (o painel precisa estar sempre
// atualizado).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Notificação', body: event.data.text() };
  }
  event.waitUntil(show(payload));
});

async function show(payload) {
  // Avisa as abas abertas para atualizarem o sino na hora.
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of windows) w.postMessage({ type: 'internal-push' });

  await self.registration.showNotification(payload.title || 'Notificação', {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    // Mesmo `tag` = a notificação nova substitui a anterior da mesma anotação
    // (sem empilhar vários avisos do mesmo recado).
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    // Tag #Urgente fica na tela até a pessoa tocar.
    requireInteraction: Boolean(payload.urgent),
    data: { url: payload.url || '/anotacoes' },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/anotacoes', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        // O painel é uma SPA: pede para a aba navegar sem recarregar.
        existing.postMessage({ type: 'navigate', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
