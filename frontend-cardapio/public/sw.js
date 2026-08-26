// Service Worker — hoje só cuida de Web Push (receber notificação em
// segundo plano + abrir a tela certa ao clicar). Não faz cache de
// assets nem funciona offline de propósito: cardápio e preços mudam o
// tempo todo, servir uma versão em cache antiga seria pior que não ter
// service worker nenhum. Se um dia quisermos PWA offline de verdade,
// isso merece um cache strategy pensado à parte, não um efeito
// colateral de ter isso aqui pra push.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Notificação', body: event.data.text() };
  }

  event.waitUntil(handlePush(payload));
});

// Confere a preferência do tipo (payload.tag) em IndexedDB antes de
// mostrar — é o "toggle individual por tipo" (Avaliações, Cashback,
// Promoções, etc) funcionando de verdade mesmo com o app fechado, não
// só quando a página está aberta. Tipo desconhecido ou sem preferência
// salva = mostra (padrão opt-out, ver lib/notificationPrefs.ts).
async function handlePush(payload) {
  const tag = payload.tag || 'default';
  const enabled = await isTagEnabled(tag);
  if (!enabled) return;

  const title = payload.title || 'Notificação';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: '/favicon.svg',
    // `groupTag` (se vier) controla o agrupamento/substituição na tela;
    // `tag` sozinho é só a CATEGORIA pra preferência, nunca usado aqui
    // como agrupamento — duas notificações da mesma categoria (ex: dois
    // pedidos diferentes, ambos "order_delivered") não devem se
    // substituir uma pela outra só por serem do mesmo tipo.
    tag: payload.groupTag || undefined,
    data: { url: payload.url || '/' },
  };
  await self.registration.showNotification(title, options);
}

function isTagEnabled(tag) {
  return new Promise((resolve) => {
    const request = indexedDB.open('cardapio-notification-prefs', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('prefs');
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('prefs', 'readonly');
        const getRequest = tx.objectStore('prefs').get(tag);
        getRequest.onsuccess = () => {
          const value = getRequest.result;
          resolve(value === undefined ? true : value);
        };
        getRequest.onerror = () => resolve(true);
      } catch {
        resolve(true);
      }
    };
    request.onerror = () => resolve(true);
  });
}

// Ao clicar na notificação: foca uma aba já aberta nesse mesmo endereço
// se existir, ou abre uma nova — nunca duas abas do mesmo cardápio à
// toa.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  // URL absoluta pra comparar com `client.url` (que sempre vem absoluta)
  // — sem isso, comparar caminho relativo com URL absoluta nunca bate
  // certo de propósito, só por sorte de substring.
  const targetAbsolute = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Comparação EXATA, não `.includes()` — client.url.includes(targetUrl)
      // dava falso positivo sempre que a aba já aberta estava numa URL
      // mais longa que só por acaso continha o destino como substring
      // (ex: aba no cardápio geral e notificação apontando pra um
      // caminho curto do mesmo restaurante). Isso fazia o clique só dar
      // foco na aba errada, SEM navegar pra URL de verdade — a aba
      // nunca mudava de página, então nada específico daquele pedido
      // aparecia, e qualquer estado (como o modal de avaliação de outro
      // pedido) que já estivesse ali continuava do jeito que estava.
      const exactMatch = clientList.find((client) => client.url === targetAbsolute);
      if (exactMatch && 'focus' in exactMatch) {
        return exactMatch.focus();
      }
      // Sem aba já exatamente naquela URL: reaproveita uma aba do MESMO
      // app se existir (evita empilhar janelas a cada notificação) e
      // navega ela pro destino certo; senão abre uma nova.
      const sameOriginClient = clientList.find((client) => client.url.startsWith(self.location.origin));
      if (sameOriginClient && 'navigate' in sameOriginClient) {
        return sameOriginClient.navigate(targetAbsolute).then((c) => c && c.focus());
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
