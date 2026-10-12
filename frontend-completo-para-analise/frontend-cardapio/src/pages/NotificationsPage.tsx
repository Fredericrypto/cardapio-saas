import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/dictionaries/pt-BR';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  Truck,
  CreditCard,
  CircleDollarSign,
  Tag,
  Gift,
  MessageSquareWarning,
  type LucideIcon,
} from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  NOTIFICATION_TYPES,
  getNotificationPrefs,
  setNotificationPref,
  type NotificationTag,
} from '../lib/notificationPrefs';

const TYPE_KEYS: Record<NotificationTag, { label: TranslationKey; description: TranslationKey }> = {
  review_prompt: { label: 'notifications.type.review_prompt.label', description: 'notifications.type.review_prompt.description' },
  order_delivered: { label: 'notifications.type.order_delivered.label', description: 'notifications.type.order_delivered.description' },
  payment_completed: { label: 'notifications.type.payment_completed.label', description: 'notifications.type.payment_completed.description' },
  cashback: { label: 'notifications.type.cashback.label', description: 'notifications.type.cashback.description' },
  promotion: { label: 'notifications.type.promotion.label', description: 'notifications.type.promotion.description' },
  loyalty: { label: 'notifications.type.loyalty.label', description: 'notifications.type.loyalty.description' },
  complaint: { label: 'notifications.type.complaint.label', description: 'notifications.type.complaint.description' },
};

const ICONS: Record<NotificationTag, LucideIcon> = {
  review_prompt: Star,
  order_delivered: Truck,
  payment_completed: CreditCard,
  cashback: CircleDollarSign,
  promotion: Tag,
  loyalty: Gift,
  complaint: MessageSquareWarning,
};

// Lista de tipos de notificação, cada um com seu próprio toggle — o
// mestre (em "Minha Conta") liga/desliga tudo de uma vez; aqui dentro
// dá pra refinar tipo por tipo. Um tipo desligado aqui não chega nunca,
// mesmo com o mestre ligado — o Service Worker confere essa preferência
// (IndexedDB, não localStorage — precisa funcionar com o app fechado)
// antes de exibir qualquer notificação que chegar.
export function NotificationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { t } = useI18n();

  const { customer, token, isLoading } = useCustomerAuth();
  const push = usePushNotifications(tenant?.id, token);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    getNotificationPrefs().then((p) => {
      setPrefs(p);
      setPrefsLoaded(true);
    });
  }, []);

  async function toggle(tag: string) {
    const next = !(prefs[tag] ?? true);
    setPrefs((prev) => ({ ...prev, [tag]: next }));
    await setNotificationPref(tag, next);
  }

  if (!tenant || isLoading || !customer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => navigate(`/${slug}/conta-cliente/perfil`)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">{t('notifications.title')}</h1>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        {!push.isSubscribed && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800">
              {t('notifications.globalOff')}
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden">
          {prefsLoaded &&
            NOTIFICATION_TYPES.map((type, index) => {
              const Icon = ICONS[type.tag];
              const enabled = prefs[type.tag] ?? true;
              return (
                <div
                  key={type.tag}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    index > 0 ? 'border-t border-gray-50' : ''
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${tenant.primaryColor}1A` }}
                  >
                    <Icon size={17} style={{ color: tenant.primaryColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{t(TYPE_KEYS[type.tag].label)}</p>
                    <p className="text-xs text-gray-400">{t(TYPE_KEYS[type.tag].description)}</p>
                  </div>
                  <button
                    onClick={() => toggle(type.tag)}
                    disabled={!push.isSubscribed}
                    className="w-10 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 disabled:opacity-40"
                    style={{ backgroundColor: enabled ? tenant.primaryColor : '#E5E7EB' }}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
        </div>

        <p className="text-[11px] text-gray-400 px-1">
          {t('notifications.footer')}
        </p>
      </div>
    </div>
  );
}
