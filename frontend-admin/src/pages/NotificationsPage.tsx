import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useInternalNotifications } from '../contexts/InternalNotificationsContext';
import { NotificationPreferences } from '../components/notifications/NotificationPreferences';
import { NotificationIcon, TYPE_TONE, formatNotificationTime, targetPath } from '../components/notifications/notificationMeta';
import { NotificationAuthorLine, NotificationAvatar } from '../components/notifications/NotificationAuthor';

type Tab = 'historico' | 'preferencias';

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'preferencias' ? 'preferencias' : 'historico';
  const setTab = (t: Tab) => setParams(t === 'historico' ? {} : { aba: t }, { replace: true });

  return (
    <div className="p-6 max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
          <Bell size={20} strokeWidth={1.5} />
          Notificações da equipe
        </h1>
        <p className="text-xs text-gray-400 mt-1">Avisos internos do restaurante, mantidos por 7 dias. Os clientes nunca recebem nada daqui.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ['historico', 'Histórico'],
            ['preferencias', 'Preferências'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 ${tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'historico' ? <History /> : <NotificationPreferences />}
    </div>
  );
}

function History() {
  const { items, unreadCount, markRead, markAllRead, remove, watchList, loading } = useInternalNotifications();
  const navigate = useNavigate();
  const [onlyUnread, setOnlyUnread] = useState(false);

  useEffect(() => {
    watchList(true);
    return () => watchList(false);
  }, [watchList]);

  const shown = onlyUnread ? items.filter((n) => !n.isRead) : items;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-xl border border-gray-200 bg-white p-0.5">
          {(
            [
              [false, 'Todas'],
              [true, `Não lidas${unreadCount ? ` (${unreadCount})` : ''}`],
            ] as Array<[boolean, string]>
          ).map(([val, label]) => (
            <button
              key={label}
              onClick={() => setOnlyUnread(val)}
              aria-pressed={onlyUnread === val}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${onlyUnread === val ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 px-3 py-2 rounded-xl border border-gray-200 bg-white disabled:opacity-40"
        >
          <CheckCheck size={14} strokeWidth={1.5} /> Marcar todas como lidas
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-14">{onlyUnread ? 'Nenhum aviso não lido.' : 'Nenhum aviso da equipe nos últimos 7 dias.'}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((n) => (
            <li key={n.id}>
              <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${n.isRead ? 'bg-white border-gray-100' : 'bg-sky-50/50 border-sky-100'}`}>
                <span className="relative shrink-0">
                  <NotificationAvatar n={n} size={40} />
                  <span
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white ${TYPE_TONE[n.type]}`}
                  >
                    <NotificationIcon type={n.type} size={11} />
                  </span>
                </span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (!n.isRead) void markRead(n.id);
                    navigate(targetPath(n));
                  }}
                >
                  <NotificationAuthorLine n={n} />
                  <span className="flex items-center gap-2 mt-0.5">
                    <span className={`text-sm ${n.isRead ? 'text-gray-700' : 'font-bold text-gray-900'}`}>{n.title}</span>
                    {n.tag && (
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${n.tag === 'Urgente' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>#{n.tag}</span>
                    )}
                  </span>
                  <span className="block text-[11px] text-gray-400">{formatNotificationTime(n.createdAt)}</span>
                </button>
                <span className={`text-[10px] font-bold rounded-full px-2 py-1 shrink-0 ${n.isRead ? 'bg-gray-100 text-gray-400' : 'bg-sky-100 text-sky-700'}`}>
                  {n.isRead ? 'Lido' : 'Não lido'}
                </span>
                {!n.isRead && (
                  <button onClick={() => void markRead(n.id)} className="text-[11px] font-semibold text-gray-500 underline shrink-0">
                    Marcar como lido
                  </button>
                )}
                <button
                  onClick={() => void remove(n.id)}
                  title="Excluir notificação"
                  aria-label="Excluir notificação"
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-gray-300 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

