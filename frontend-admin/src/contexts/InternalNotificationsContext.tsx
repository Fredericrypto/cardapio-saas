import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  fetchInternalNotifications,
  fetchInternalUnreadCount,
  deleteInternalNotification,
  markAllInternalNotificationsRead,
  markInternalNotificationRead,
} from '../lib/admin-api';
import type { InternalNotification } from '../types/notes';

// Notificações INTERNAS da equipe (anotações). Totalmente separado do que o
// cliente final recebe — este contexto só existe dentro do painel autenticado.
interface Ctx {
  unreadCount: number;
  items: InternalNotification[];
  loading: boolean;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  // Exclusão manual individual (some só para quem excluiu).
  remove: (id: string) => Promise<void>;
  // Quem mostra a lista (sino aberto / página) avisa para ela ser mantida fresca.
  watchList: (active: boolean) => void;
}

const InternalNotificationsContext = createContext<Ctx | undefined>(undefined);

const POLL_MS = 30_000;

// Defesa extra contra duplicidade na tela: nunca exibe dois cards com o mesmo id
// (ex.: duas respostas de reload que se cruzam).
function uniqueById(list: InternalNotification[]): InternalNotification[] {
  const seen = new Set<string>();
  return list.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

export function InternalNotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<InternalNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const watchers = useRef(0);
  // Só a resposta do reload MAIS RECENTE vale (respostas fora de ordem não
  // sobrescrevem a lista com dado velho).
  const reloadSeq = useRef(0);
  const itemsRef = useRef<InternalNotification[]>([]);
  itemsRef.current = items;

  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;
    setLoading(true);
    try {
      const data = await fetchInternalNotifications({ limit: 100 });
      if (seq !== reloadSeq.current) return;
      setItems(uniqueById(data.items));
      setUnreadCount(data.unreadCount);
    } catch {
      /* sem rede / sessão expirada: o interceptor cuida do 401 */
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      setUnreadCount(await fetchInternalUnreadCount());
    } catch {
      /* ignora */
    }
  }, []);

  const tick = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    if (watchers.current > 0) void reload();
    else void refreshCount();
  }, [reload, refreshCount]);

  useEffect(() => {
    void refreshCount();
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // O service worker avisa quando chega um push: atualiza na hora.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'internal-push') tick();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [refreshCount, tick]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markInternalNotificationRead(id);
    } catch {
      void reload();
    }
  }, [reload]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllInternalNotificationsRead();
    } catch {
      void reload();
    }
  }, [reload]);

  const remove = useCallback(
    async (id: string) => {
      const wasUnread = itemsRef.current.some((n) => n.id === id && !n.isRead);
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await deleteInternalNotification(id);
      } catch {
        void reload();
      }
    },
    [reload],
  );

  const watchList = useCallback(
    (active: boolean) => {
      watchers.current = Math.max(0, watchers.current + (active ? 1 : -1));
      if (active) void reload();
    },
    [reload],
  );

  const value = useMemo(
    () => ({ unreadCount, items, loading, reload, markRead, markAllRead, remove, watchList }),
    [unreadCount, items, loading, reload, markRead, markAllRead, remove, watchList],
  );
  return <InternalNotificationsContext.Provider value={value}>{children}</InternalNotificationsContext.Provider>;
}

export function useInternalNotifications(): Ctx {
  const ctx = useContext(InternalNotificationsContext);
  if (!ctx) throw new Error('useInternalNotifications precisa estar dentro de InternalNotificationsProvider');
  return ctx;
}
