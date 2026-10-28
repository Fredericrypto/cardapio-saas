import { useCallback, useEffect, useState } from 'react';
import { fetchVapidPublicKey, subscribeToPush, unsubscribeFromPush } from '../lib/customer-api';

// Converte a chave pública VAPID (base64url, formato que o backend
// devolve) pro formato Uint8Array que a PushManager.subscribe() do
// navegador exige — conversão padrão da spec Web Push, sempre igual em
// qualquer app que implemente isso.
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

// Inscrição criada com OUTRA chave VAPID (ex.: chave trocada no servidor depois) continua
// "ativa" para o navegador, mas o serviço de push recusa os envios do servidor (401/403) e o
// pushManager.subscribe() com a chave nova lança InvalidStateError. Compara para poder refazer.
function sameApplicationServerKey(subscription: PushSubscription, key: BufferSource): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // não dá para comparar: mantém
  const a = new Uint8Array(current);
  const b = new Uint8Array(key as ArrayBuffer);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

// Gerencia todo o ciclo de Web Push pro cliente logado: registra o
// service worker, sabe se o navegador já tem permissão, e expõe
// `subscribe`/`unsubscribe` pra UI chamar (sempre a partir de uma ação
// explícita do usuário — pedir permissão de notificação sem gesto do
// usuário é tanto uma prática ruim quanto, em navegadores modernos,
// simplesmente ignorado/bloqueado).
export function usePushNotifications(tenantId: string | undefined, token: string | null) {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // true depois de conferir se já existe inscrição neste navegador (evita piscar o estado errado na tela).
  const [isChecked, setIsChecked] = useState(false);

  const isSupported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!isSupported) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PushPermissionState);
  }, [isSupported]);

  // Verifica se já existe inscrição ativa nesse navegador (ex: cliente
  // já ativou antes, numa visita anterior) — pra UI já nascer mostrando
  // o estado certo, sem precisar o cliente clicar de novo.
  useEffect(() => {
    if (!isSupported || Notification.permission !== 'granted') {
      setIsChecked(true);
      return;
    }
    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        const existing = await registration.pushManager.getSubscription();
        setIsSubscribed(Boolean(existing));
      })
      .catch(() => undefined)
      .finally(() => setIsChecked(true));
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !tenantId || !token) return false;
    setIsLoading(true);
    try {
      const publicKey = await fetchVapidPublicKey();
      if (!publicKey) {
        // Backend sem VAPID configurado (ambiente de dev, por exemplo)
        // — não quebra a UI, só não ativa nada.
        return false;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult as PushPermissionState);
      if (permissionResult !== 'granted') return false;

      const serverKey = urlBase64ToUint8Array(publicKey);
      const existing = await registration.pushManager.getSubscription();
      if (existing && !sameApplicationServerKey(existing, serverKey)) {
        await unsubscribeFromPush(tenantId, token, existing.endpoint).catch(() => undefined);
        await existing.unsubscribe();
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey,
      });
      await subscribeToPush(tenantId, token, subscription.toJSON() as PushSubscriptionJSON);
      setIsSubscribed(true);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, tenantId, token]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !tenantId || !token) return;
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(tenantId, token, subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, tenantId, token]);

  return { permission, isSupported, isSubscribed, isChecked, isLoading, subscribe, unsubscribe };
}
