import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import { useInternalNotifications } from '../../contexts/InternalNotificationsContext';
import type { InternalNotification } from '../../types/notes';
import { NotificationIcon, TYPE_TONE, formatNotificationTime, targetPath } from './notificationMeta';

export function NotificationBell() {
  const { unreadCount, items, markRead, markAllRead, watchList } = useInternalNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Aberto = mantém a lista fresca.
  useEffect(() => {
    if (!open) return;
    watchList(true);
    return () => watchList(false);
  }, [open, watchList]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function openItem(n: InternalNotification) {
    if (!n.isRead) void markRead(n.id);
    setOpen(false);
    navigate(targetPath(n));
  }

  const recent = items.slice(0, 8);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} não lidas` : 'Notificações'}
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[92vw] bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">Notificações da equipe</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
                title="Marcar todas como lidas"
                aria-label="Marcar todas como lidas"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 disabled:opacity-30"
              >
                <CheckCheck size={15} />
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/notificacoes?aba=preferencias');
                }}
                title="Preferências"
                aria-label="Preferências de notificação"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
              >
                <Settings size={15} />
              </button>
            </div>
          </div>

          <ul className="max-h-[26rem] overflow-y-auto divide-y divide-gray-50">
            {recent.length === 0 ? (
              <li className="px-4 py-10 text-center text-xs text-gray-400">Nenhum aviso da equipe ainda.</li>
            ) : (
              recent.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 ${n.isRead ? '' : 'bg-sky-50/40'}`}>
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TYPE_TONE[n.type]}`}>
                      <NotificationIcon type={n.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[13px] truncate ${n.isRead ? 'text-gray-600' : 'font-bold text-gray-900'}`}>{n.title}</span>
                        {n.tag && (
                          <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 ${n.tag === 'Urgente' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            #{n.tag}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">{n.message}</span>
                      <span className="block text-[11px] text-gray-400">{formatNotificationTime(n.createdAt)}</span>
                    </span>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-sky-500 mt-2 shrink-0" aria-label="Não lida" />}
                  </button>
                </li>
              ))
            )}
          </ul>

          <button
            onClick={() => {
              setOpen(false);
              navigate('/notificacoes');
            }}
            className="w-full py-3 text-xs font-semibold text-gray-600 border-t border-gray-100 hover:bg-gray-50"
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  );
}
