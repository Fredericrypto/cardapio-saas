// Preferências de notificação por TIPO — guardadas em IndexedDB (não
// localStorage) de propósito: o Service Worker precisa ler isso pra
// decidir se mostra ou não uma notificação que chegou em segundo plano
// (app fechado, sem nenhuma aba aberta), e localStorage simplesmente
// não existe dentro de um Service Worker. IndexedDB é a única opção de
// armazenamento síncrono-o-bastante-pra-isso que os dois lados (página
// e SW) conseguem acessar.
//
// Catálogo de tipos — cresce conforme novos gatilhos de notificação
// forem implementados no backend; a UI (NotificationsPage) e o filtro
// no Service Worker já são genéricos por `tag`, então adicionar um tipo
// novo aqui é o único passo necessário no frontend.
export const NOTIFICATION_TYPES = [
  { tag: 'review_prompt', label: 'Avaliação de pedido', description: 'Quando você pode avaliar um pedido concluído.' },
  { tag: 'order_delivered', label: 'Pedido entregue', description: 'Quando seu pedido chega ou fica pronto pra retirar.' },
  { tag: 'payment_completed', label: 'Pagamento concluído', description: 'Confirmação de que seu pagamento foi processado.' },
  { tag: 'cashback', label: 'Cashback', description: 'Quando você ganha ou está prestes a perder cashback.' },
  { tag: 'promotion', label: 'Promoções', description: 'Novas promoções e cupons do restaurante.' },
  { tag: 'loyalty', label: 'Fidelidade', description: 'Progresso no cartão fidelidade e prêmios liberados.' },
  { tag: 'complaint', label: 'Reclamações', description: 'Atualizações sobre uma reclamação que você abriu.' },
] as const;

export type NotificationTag = (typeof NOTIFICATION_TYPES)[number]['tag'];

const DB_NAME = 'cardapio-notification-prefs';
const STORE_NAME = 'prefs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Todo tipo começa HABILITADO por padrão (opt-out, não opt-in) — se o
// cliente já ativou notificações no botão mestre, a expectativa
// razoável é que ele receba tudo até decidir desligar algo
// específico, não o contrário.
export async function getNotificationPrefs(): Promise<Record<string, boolean>> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const result: Record<string, boolean> = {};
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          result[cursor.key as string] = cursor.value as boolean;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return {};
  }
}

export async function isNotificationTypeEnabled(tag: string): Promise<boolean> {
  const prefs = await getNotificationPrefs();
  return prefs[tag] ?? true; // default: habilitado
}

export async function setNotificationPref(tag: string, enabled: boolean): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(enabled, tag);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
