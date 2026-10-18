import { verificationReasonLabel } from '../i18n/verificationReason';
import { formatPronouns } from '../i18n/pronouns';
import { activeDateLocale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { ConfirmModal } from '../components/ConfirmModal';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight,
  Receipt,
  MapPin,
  Wallet,
  CircleDollarSign,
  Star,
  Bell,
  BellOff,
  LogOut,
  User,
  BadgeCheck,
  Clock3,
  Languages,
  ShoppingBag,
  ShieldAlert,
} from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { getActiveMesaToken } from '../lib/seat';
import { groupCustomerOrders } from '../lib/ordersHistory';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED, MENU_SURFACE, MENU_BORDER } from '../lib/menuTheme';
import { PROMO_SERIF, PROMO_INK, PROMO_MUTED, PROMO_SAGE, PROMO_EYEBROW } from '../lib/promotionTheme';
import { BottomNav, DesktopNav } from '../components/BottomNav';
import { FoodBackdrop } from '../components/FoodBackdrop';
import { Tooltip } from '../components/Tooltip';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { VerificationExplainerModal } from '../components/VerificationExplainerModal';
import { VerificationCameraCapture } from '../components/VerificationCameraCapture';
import { VerificationCongratsModal } from '../components/VerificationCongratsModal';
import {
  submitMyVerification,
  markVerificationCongratsSeen,
  fetchMyCustomerProfile,
  fetchMyOrderHistory,
  fetchMyReviews,
} from '../lib/customer-api';

// Coluna esquerda = editorial (serifada, Newsreader já carregada no index.css);
// coluna direita = funcional (Inter). Inline porque `h1,h2,h3` global é Poppins.
const SERIF = { fontFamily: PROMO_SERIF } as const;
const SANS = { fontFamily: "'Inter', system-ui, sans-serif" } as const;

// Painéis sóbrios: borda fina, sem blur e sem glow; o wallpaper aparece por baixo.
const PANEL =
  'rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF]/70 dark:border-white/10 dark:bg-[#161617]/70';
const HAIRLINE = 'border-[#E5E7EB] dark:border-white/10';

// Ramo botânico em traço fino (decorativo). Folhas em pares ao longo de um caule curvo.
const LEAVES = [
  { x: 215, y: 237, r: -163, s: 1.05 },
  { x: 215, y: 237, r: -73, s: 1.0 },
  { x: 187, y: 185, r: -163, s: 1.0 },
  { x: 187, y: 185, r: -73, s: 0.95 },
  { x: 157, y: 132, r: -165, s: 0.95 },
  { x: 157, y: 132, r: -75, s: 0.9 },
  { x: 125, y: 78, r: -165, s: 0.85 },
  { x: 125, y: 78, r: -75, s: 0.8 },
  { x: 90, y: 20, r: -118, s: 0.8 },
];

function BotanicalBranch({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 300"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M240 290C200 200 150 120 90 20" />
      {LEAVES.map((leaf, i) => (
        <g key={i} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r}) scale(${leaf.s})`}>
          <path d="M0 0C8-11 26-15 42 0C26 15 8 11 0 0Z" />
          <path d="M0 0L38 0" />
        </g>
      ))}
    </svg>
  );
}

export function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { customer, token, isLoading, logout, setCustomer } = useCustomerAuth();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const activeMesaToken = slug ? getActiveMesaToken(token, slug) ?? undefined : undefined;
  const push = usePushNotifications(tenant?.id, token);

  // Estatísticas: mesmas fontes de "Meus pedidos" e "Minhas Avaliações". Sem dado = não aparece.
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [ordersDone, setOrdersDone] = useState(false);
  const [reviewsDone, setReviewsDone] = useState(false);
  const tenantId = tenant?.id;
  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    fetchMyOrderHistory(tenantId, token)
      .then((orders) => {
        if (!cancelled) setOrderCount(groupCustomerOrders(orders).length);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOrdersDone(true);
      });
    fetchMyReviews(tenantId, token)
      .then(({ restaurant, items }) => {
        if (cancelled) return;
        const ratings = [...(restaurant ? [restaurant.rating] : []), ...items.map((i) => i.rating)];
        setAvgRating(ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReviewsDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, token]);

  const [verificationStep, setVerificationStep] = useState<'explainer' | 'camera' | null>(null);
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  useScrollLock(isSubmittingVerification);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  async function handleCapturePhoto(photoBlob: Blob) {
    if (!tenant || !token) return;
    setIsSubmittingVerification(true);
    setVerificationError(null);
    try {
      await submitMyVerification(tenant.id, token, photoBlob);
      setVerificationStep(null);
      const fresh = await fetchMyCustomerProfile(tenant.id, token);
      setCustomer(fresh);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setVerificationError(message ?? t('profile.photoSendError'));
      setVerificationStep(null);
    } finally {
      setIsSubmittingVerification(false);
    }
  }

  async function handleCloseCongrats() {
    if (!tenant || !token || !customer) return;
    setCustomer({ ...customer, verificationCongratsPending: false });
    markVerificationCongratsSeen(tenant.id, token).catch(() => {});
  }

  if (!tenant || isLoading) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  const nav = (
    <div className="contents print:hidden">
      <DesktopNav
        slug={slug!}
        qrCodeToken={activeMesaToken}
        tenantId={tenant.id}
        primaryColor={tenant.primaryColor}
        tenant={tenant}
        showSearch={false}
        wide
      />
    </div>
  );

  if (!customer) {
    return (
      <div className={`relative isolate min-h-screen ${MENU_PAGE_BG}`}>
        <FoodBackdrop />
        {nav}
        <div className="flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto pt-24 pb-24">
          <p className={`${MENU_TEXT_BODY} text-sm`}>{t('profile.notLoggedIn')}</p>
          <Tooltip label={t('common.enter')}>
            <button
              onClick={() => navigate(`/${slug}/conta-cliente/entrar`)}
              className="mt-4 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {t('common.enter')}
            </button>
          </Tooltip>
        </div>
        <BottomNav slug={slug!} qrCodeToken={activeMesaToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
      </div>
    );
  }

  const firstName = customer.name.trim().split(/\s+/)[0] || customer.name;
  // `createdAt` só aparece se o backend devolver no perfil (hoje não está tipado).
  const createdAt = (customer as { createdAt?: string }).createdAt;
  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString(activeDateLocale(), { month: 'long', year: 'numeric' })
    : null;
  const ratingText =
    avgRating !== null
      ? avgRating.toLocaleString(activeDateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;
  const statsLoading = !ordersDone || !reviewsDone;
  const showOrders = statsLoading || orderCount !== null;
  const showRating = statsLoading || avgRating !== null;
  const hasStats = showOrders || showRating;
  const bothStats = showOrders && showRating;
  const dash = <span aria-hidden="true" className="inline-block animate-pulse text-[#9CA3AF] dark:text-[#8E918F]">&mdash;</span>;

  const verifyRow = !customer.isVerified
    ? {
        icon: (customer.verificationStatus === 'pending' ? Clock3 : BadgeCheck) as LucideIcon,
        color: customer.verificationStatus === 'pending' ? '#F59E0B' : '#1D9BF0',
        label:
          customer.verificationStatus === 'pending'
            ? t('profile.verificationPending')
            : customer.verificationStatus === 'rejected'
              ? t('profile.verificationRejectedRetry')
              : t('profile.verifyAccount'),
        description:
          customer.verificationStatus === 'pending'
            ? t('profilePage.desc.verifyPending')
            : customer.verificationStatus === 'rejected'
              ? t('profilePage.desc.verifyRejected')
              : t('profilePage.desc.verify'),
        disabled: customer.verificationStatus === 'pending',
      }
    : null;

  return (
    <div className={`relative isolate min-h-screen ${MENU_PAGE_BG} pb-24 md:pb-0`}>
      <FoodBackdrop />
      {nav}

      <main className="mx-auto w-full max-w-[88rem] px-4 py-8 md:px-8 md:py-12 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-12 xl:gap-20">
        {/* ============ Coluna esquerda: editorial ============ */}
        <section className="min-w-0" style={SERIF}>
          <div className="relative pb-8 pt-2">
            <BotanicalBranch className="pointer-events-none absolute -top-2 right-0 z-0 w-28 text-[#111827]/25 sm:w-44 lg:w-52 dark:text-[#C2C0B6]/30" />
            <div className="relative z-10">
              <p className={`${PROMO_EYEBROW} ${PROMO_SAGE}`}>{t('profilePage.eyebrow')}</p>
              <p
                className={`mt-4 break-words text-5xl font-light italic leading-[1.05] sm:text-6xl xl:text-7xl ${PROMO_INK}`}
                style={SERIF}
              >
                {t('profilePage.hello', { name: firstName })}
              </p>
              <p className={`mt-5 max-w-sm text-xl italic leading-snug sm:text-2xl ${PROMO_MUTED}`}>
                {t('profilePage.intro')}
              </p>
            </div>
          </div>

          <div className={`${PANEL} overflow-hidden`}>
            <div className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-center md:p-8">
              <div className="relative shrink-0">
                <div
                  className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full text-4xl font-bold text-white ring-1 ring-black/10 dark:ring-white/15 md:h-32 md:w-32"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  {customer.avatarUrl ? (
                    <img src={customer.avatarUrl} alt={customer.name} className="h-full w-full object-cover" />
                  ) : (
                    customer.name[0]?.toUpperCase()
                  )}
                </div>
                {customer.isVerified && (
                  <span className="absolute bottom-1 right-1">
                    <VerifiedBadge size={22} />
                  </span>
                )}
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className={`${PROMO_EYEBROW} ${PROMO_SAGE}`}>{t('profilePage.client')}</p>
                <div className="mt-1.5 flex flex-wrap items-baseline justify-center gap-x-2 sm:justify-start">
                  <p className={`break-words text-3xl italic md:text-4xl ${PROMO_INK}`}>{customer.name}</p>
                  {customer.pronouns && (
                    <span className={`text-base italic ${PROMO_MUTED}`}>{formatPronouns(customer.pronouns, t)}</span>
                  )}
                </div>
                {customer.isVerified && (
                  <div className="mt-1.5">
                    <VerifiedBadge variant="inline" size={12} />
                  </div>
                )}
                <p className={`mt-2 break-all text-lg ${PROMO_INK}`}>{customer.email}</p>
                {memberSince && (
                  <p className={`mt-1 text-base ${PROMO_MUTED}`}>{t('profilePage.since', { date: memberSince })}</p>
                )}
              </div>
            </div>

            {hasStats && (
              <div className={`grid border-t ${HAIRLINE} ${bothStats ? 'grid-cols-2 divide-x divide-[#E5E7EB] dark:divide-white/10' : 'grid-cols-1'}`}>
                {showOrders && (
                  <div className="flex items-center justify-center gap-3 px-4 py-5 sm:gap-4 sm:px-6">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-black/[0.03] text-[#9CA3AF] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#8E918F]">
                      <ShoppingBag size={20} strokeWidth={1.25} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 text-center">
                      <p className={`text-3xl font-light leading-none tabular-nums ${PROMO_INK}`}>{statsLoading || orderCount === null ? dash : orderCount}</p>
                      <p className={`mt-1 text-sm ${PROMO_MUTED}`}>{t('profilePage.ordersDone')}</p>
                    </div>
                  </div>
                )}
                {showRating && (
                  <div className="flex items-center justify-center gap-3 px-4 py-5 sm:gap-4 sm:px-6">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-black/[0.03] text-[#9CA3AF] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#8E918F]">
                      <Star size={20} strokeWidth={1.25} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 text-center">
                      <p className={`text-3xl font-light leading-none tabular-nums ${PROMO_INK}`}>{statsLoading || ratingText === null ? dash : ratingText}</p>
                      <p className={`mt-1 text-sm ${PROMO_MUTED}`}>{t('profilePage.avgRating')}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${PANEL} mt-5 p-6 md:p-8`}>
            <p className={`${PROMO_EYEBROW} ${PROMO_SAGE}`}>{t('profilePage.madeFor')}</p>
            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
              <p className={`text-3xl font-light italic leading-tight md:text-4xl sm:max-w-[16rem] ${PROMO_INK}`}>
                {t('profilePage.headline')}
              </p>
              <span aria-hidden="true" className="hidden w-px self-stretch bg-[#E5E7EB] dark:bg-white/10 sm:block" />
              <p className={`text-base leading-relaxed ${PROMO_MUTED}`}>{t('profilePage.editorial')}</p>
            </div>
          </div>
        </section>

        {/* ============ Coluna direita: conta e configurações ============ */}
        <section className="mt-10 min-w-0 lg:mt-2" style={SANS}>
          <div className={`${PANEL} divide-y divide-[#E5E7EB] overflow-hidden dark:divide-white/10`}>
            <MenuRow
              icon={User}
              color="#A78BFA"
              label={t('profile.myData')}
              description={t('profilePage.desc.myData')}
              onClick={() => navigate(`/${slug}/conta-cliente/dados`)}
            />
            {verifyRow && (
              <MenuRow
                icon={verifyRow.icon}
                color={verifyRow.color}
                label={verifyRow.label}
                description={verifyRow.description}
                disabled={verifyRow.disabled}
                onClick={() => setVerificationStep('explainer')}
              />
            )}
            <MenuRow
              icon={Receipt}
              color="#F87171"
              label={t('profile.myOrders')}
              description={t('profilePage.desc.orders')}
              onClick={() => navigate(`/${slug}/conta-cliente/pedidos`)}
            />
            <MenuRow
              icon={MapPin}
              color="#60A5FA"
              label={t('profile.savedAddress')}
              description={t('profilePage.desc.address')}
              onClick={() => navigate(`/${slug}/conta-cliente/endereco`)}
            />
            <MenuRow
              icon={Wallet}
              color="#4ADE80"
              label={t('profile.pixWallet')}
              description={t('profilePage.desc.pix')}
              onClick={() => navigate(`/${slug}/conta-cliente/carteira-pix`)}
            />
            <MenuRow
              icon={CircleDollarSign}
              color="#A8A29E"
              label={t('profile.cashback')}
              description={t('profilePage.desc.cashback')}
              onClick={() => navigate(`/${slug}/conta-cliente/cashback`)}
            />
            <MenuRow
              icon={Star}
              color="#F59E0B"
              label={t('profile.myReviews')}
              description={t('profilePage.desc.reviews')}
              onClick={() => navigate(`/${slug}/conta-cliente/avaliacoes`)}
            />
            <MenuRow
              icon={Languages}
              color="#38BDF8"
              label={t('profile.language')}
              description={t('profilePage.desc.language')}
              onClick={() => navigate(`/${slug}/conta-cliente/idioma`)}
            />
          </div>

          {customer.verificationStatus === 'rejected' && customer.verificationRejectionReason && (
            <Tooltip label={t('optionalCustomerAuth.tentar_de_novo')} className="mt-4 flex w-full">
              <button
                type="button"
                onClick={() => setVerificationStep('explainer')}
                className="flex w-full items-center gap-4 rounded-2xl border border-[#F3C4C4] bg-[#FEF2F2] px-4 py-3.5 text-left transition-colors hover:bg-[#FDE8E8] dark:border-red-500/25 dark:bg-red-500/[0.08] dark:hover:bg-red-500/[0.12]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-[#DC2626] dark:text-[#F87171]">
                  <ShieldAlert size={18} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#B91C1C] dark:text-[#F87171]">
                    {t('profile.verificationRejectedTitle')}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#7F1D1D] dark:text-[#E3E2E6]">
                    {verificationReasonLabel(customer.verificationRejectionReason, t)}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs font-medium text-[#B91C1C] dark:text-[#F87171] sm:block">
                  {t('optionalCustomerAuth.tentar_de_novo')}
                </span>
                <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-[#B91C1C] dark:text-[#F87171]" />
              </button>
            </Tooltip>
          )}
          {verificationError && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 dark:border-red-500/20 dark:bg-red-500/10">
              <p className="text-xs text-red-600 dark:text-red-400">{verificationError}</p>
            </div>
          )}

          {push.isSupported && (
            <div className={`${PANEL} mt-4 overflow-hidden`}>
              <div className="flex w-full items-center gap-3 px-4 py-3.5 md:px-5">
                <Tooltip label={t('profile.notifications')} className="flex min-w-0 flex-1">
                  <button
                    onClick={() => navigate(`/${slug}/conta-cliente/notificacoes`)}
                    className="flex w-full min-w-0 items-center gap-4 text-left"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                        push.isSubscribed
                          ? 'border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#16A34A] dark:text-[#4ADE80]'
                          : 'border-[#E5E7EB] bg-black/[0.03] text-[#9CA3AF] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#8E918F]'
                      }`}
                    >
                      {push.isSubscribed ? (
                        <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <BellOff size={18} strokeWidth={1.5} aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${MENU_TEXT}`}>{t('profile.notifications')}</span>
                      <span className={`mt-0.5 block text-xs ${MENU_TEXT_MUTED}`}>
                        {push.permission === 'denied'
                          ? t('profile.notificationsBlocked')
                          : push.isSubscribed
                            ? t('profile.notificationsOn')
                            : t('profile.notificationsOff')}
                      </span>
                    </span>
                  </button>
                </Tooltip>
                <Tooltip label={t('profile.notifications')}>
                  <button
                    role="switch"
                    aria-checked={push.isSubscribed}
                    aria-label={t('profile.notifications')}
                    onClick={() => (push.isSubscribed ? push.unsubscribe() : push.subscribe())}
                    disabled={push.isLoading || push.permission === 'denied'}
                    className={`ml-2 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-40 ${
                      push.isSubscribed ? '' : 'bg-gray-200 dark:bg-white/20'
                    }`}
                    style={push.isSubscribed ? { backgroundColor: tenant.primaryColor } : undefined}
                  >
                    <span
                      className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        push.isSubscribed ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}

          <div className={`${PANEL} mt-4 overflow-hidden`}>
            <MenuRow
              icon={LogOut}
              color="#F87171"
              label={t('profile.logout')}
              labelColor="#DC2626"
              onClick={() => setConfirmingLogout(true)}
            />
          </div>
        </section>
      </main>

      {confirmingLogout && (
        <ConfirmModal
          message={t('profile.logoutConfirm')}
          confirmLabel={t('profile.logoutConfirmYes')}
          destructive
          onConfirm={() => {
            setConfirmingLogout(false);
            logout();
          }}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}

      <BottomNav slug={slug!} qrCodeToken={activeMesaToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />

      {verificationStep === 'explainer' && (
        <VerificationExplainerModal
          primaryColor={tenant.primaryColor}
          onCancel={() => setVerificationStep(null)}
          onContinue={() => setVerificationStep('camera')}
        />
      )}
      {verificationStep === 'camera' && (
        <VerificationCameraCapture
          primaryColor={tenant.primaryColor}
          onCancel={() => setVerificationStep(null)}
          onCapture={handleCapturePhoto}
        />
      )}
      {isSubmittingVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${MENU_SURFACE} border ${MENU_BORDER} flex items-center gap-3 rounded-2xl px-6 py-5`}>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500 dark:border-white/10 dark:border-t-gray-300" />
            <p className={`text-sm ${MENU_TEXT_BODY}`}>{t('profile.sendingPhoto')}</p>
          </div>
        </div>
      )}
      {customer.verificationCongratsPending && (
        <VerificationCongratsModal primaryColor={tenant.primaryColor} onClose={handleCloseCongrats} />
      )}
    </div>
  );
}

interface MenuRowProps {
  icon: LucideIcon;
  color: string;
  label: string;
  description?: string;
  labelColor?: string;
  onClick?: () => void;
  disabled?: boolean;
}

// Linha da lista da conta: ícone de traço fino em círculo discreto, rótulo, descrição e seta.
function MenuRow({ icon: Icon, color, label, description, labelColor, onClick, disabled }: MenuRowProps) {
  return (
    <Tooltip label={label} className="flex w-full">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.03] disabled:opacity-50 dark:hover:bg-white/[0.04] md:px-5"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${labelColor ? '' : 'border-[#E5E7EB] bg-black/[0.03] text-[#9CA3AF] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#8E918F]'}`} style={labelColor ? { color, backgroundColor: `${color}14`, borderColor: `${color}40` } : undefined}
        >
          <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-medium ${labelColor ? '' : MENU_TEXT}`}
            style={labelColor ? { color: labelColor } : undefined}
          >
            {label}
          </span>
          {description && <span className={`mt-0.5 block text-xs ${MENU_TEXT_MUTED}`}>{description}</span>}
        </span>
        {!disabled && (
          <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-[#9CA3AF] dark:text-[#5F6368]" />
        )}
      </button>
    </Tooltip>
  );
}
