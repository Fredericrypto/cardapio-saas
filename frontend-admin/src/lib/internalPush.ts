import {
  fetchInternalPushStatus,
  fetchVapidPublicKey,
  subscribeInternalPush,
  unsubscribeInternalPush,
} from './admin-api';

// Web Push das notificações INTERNAS (equipe). O service worker é o /sw.js
// do painel (nunca o do cardápio do cliente).

const PREF_KEY = 'internal_push_enabled';

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPermission(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

// iOS só entrega Web Push para o painel instalado na Tela de Início (PWA).
export function needsInstallOnIos(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

export async function registerPanelServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

// Este aparelho está recebendo? (inscrição existe no navegador E no servidor)
export async function isDeviceEnabled(): Promise<boolean> {
  try {
    const sub = await getCurrentSubscription();
    if (!sub || Notification.permission !== 'granted') return false;
    return await fetchInternalPushStatus(sub.endpoint);
  } catch {
    return false;
  }
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'no-vapid' | 'error';

// Liga as notificações neste aparelho. `silent` = não pergunta nada ao usuário
// (usado ao reentrar no painel quando a permissão já foi concedida).
export async function enableDevicePush(opts: { silent?: boolean } = {}): Promise<EnableResult> {
  if (!isPushSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission !== 'granted') {
      if (opts.silent) return 'denied';
      const result = await Notification.requestPermission();
      if (result !== 'granted') return 'denied';
    }
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return 'no-vapid';
    await registerPanelServiceWorker();
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error';
    await subscribeInternalPush({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    localStorage.setItem(PREF_KEY, '1');
    return 'enabled';
  } catch {
    return 'error';
  }
}

// Desliga neste aparelho. `keepPreference` = só para o servidor de enviar
// (logout), mas lembra que a pessoa queria receber — ao entrar de novo o
// painel religa sozinho, sem pedir permissão outra vez.
export async function disableDevicePush(opts: { keepPreference?: boolean } = {}): Promise<void> {
  try {
    const sub = await getCurrentSubscription();
    if (sub) {
      await unsubscribeInternalPush(sub.endpoint).catch(() => undefined);
      if (!opts.keepPreference) await sub.unsubscribe().catch(() => undefined);
    }
  } finally {
    if (!opts.keepPreference) localStorage.removeItem(PREF_KEY);
  }
}

export function wantsDevicePush(): boolean {
  return localStorage.getItem(PREF_KEY) === '1';
}
