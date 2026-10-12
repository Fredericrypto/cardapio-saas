import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/dictionaries/pt-BR';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Star,
  Truck,
  CreditCard,
  CircleDollarSign,
  Tag,
  Gift,
  MessageSquareWarning,
  BellOff,
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
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { PROFILE_CARD } from '../lib/profileTheme';

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
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ProfileSubpageShell tenant={tenant} title={t('notifications.title')} backTo={`/${slug}/conta-cliente/perfil`}>
      <div className="flex flex-col gap-4">
        {!push.isSubscribed && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] backdrop-blur-xl p-4 md:p-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15 border border-amber-500/25">
              <BellOff size={17} strokeWidth={1.5} className="text-amber-700 dark:text-amber-300" />
            </div>
            <p className="text-xs md:text-sm leading-relaxed text-amber-800 dark:text-amber-300 pt-1">
              {t('notifications.globalOff')}
            </p>
          </div>
        )}

        {/* Grade de cartões: cada tipo com ícone, descrição e seu toggle. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {prefsLoaded &&
            NOTIFICATION_TYPES.map((type) => {
              const Icon = ICONS[type.tag];
              const enabled = prefs[type.tag] ?? true;
              const label = t(TYPE_KEYS[type.tag].label);
              return (
                <div
                  key={type.tag}
                  className={`${PROFILE_CARD} p-4 md:p-5 flex flex-col gap-4 transition-colors`}
                  style={enabled ? { borderColor: `${tenant.primaryColor}99` } : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-black/5 dark:border-white/10"
                      style={{ backgroundColor: `${tenant.primaryColor}1A` }}
                    >
                      <Icon size={20} strokeWidth={1.5} className="text-[#374151] dark:text-[#E3E2E6]" />
                    </div>
                    <Tooltip label={label}>
                      <button
                        role="switch"
                        aria-checked={enabled}
                        aria-label={label}
                        onClick={() => toggle(type.tag)}
                        disabled={!push.isSubscribed}
                        className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 disabled:opacity-40 ${
                          enabled ? '' : 'bg-gray-200 dark:bg-white/20'
                        }`}
                        style={enabled ? { backgroundColor: tenant.primaryColor } : undefined}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </Tooltip>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm md:text-base font-semibold ${MENU_TEXT}`}>{label}</p>
                    <p className={`text-xs md:text-[13px] leading-relaxed ${MENU_TEXT_MUTED} mt-1`}>{t(TYPE_KEYS[type.tag].description)}</p>
                  </div>
                </div>
              );
            })}
        </div>

        <p className={`text-[11px] md:text-xs ${MENU_TEXT_MUTED} px-1`}>
          {t('notifications.footer')}
        </p>
      </div>
    </ProfileSubpageShell>
  );
}
