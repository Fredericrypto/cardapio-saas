import { verificationReasonLabel } from '../i18n/verificationReason';
import { formatPronouns } from '../i18n/pronouns';
import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { ConfirmModal } from '../components/ConfirmModal';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Receipt, MapPin, Wallet, CircleDollarSign, Star, Bell, BellOff, LogOut, User, BadgeCheck, Clock3, Languages } from 'lucide-react';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { getActiveMesaToken } from '../lib/seat';
import {
  MENU_PAGE_BG,
  MENU_SURFACE,
  MENU_BORDER,
  MENU_TEXT,
  MENU_TEXT_BODY,
  MENU_TEXT_MUTED,
} from '../lib/menuTheme';
import { IconBadge } from '../components/IconBadge';
import { BottomNav, DesktopNav } from '../components/BottomNav';
import { Tooltip } from '../components/Tooltip';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { VerificationExplainerModal } from '../components/VerificationExplainerModal';
import { VerificationCameraCapture } from '../components/VerificationCameraCapture';
import { VerificationCongratsModal } from '../components/VerificationCongratsModal';
import { submitMyVerification, markVerificationCongratsSeen, fetchMyCustomerProfile } from '../lib/customer-api';

// Mesmo container do MenuPage — paridade de margens e alinhamento.
const PAGE_CONTAINER = 'w-full max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10';

// Card padrão (nível 1) — superfície + borda do tema do cardápio.
const CARD = `${MENU_SURFACE} border ${MENU_BORDER} rounded-2xl`;

// Hub da conta do cliente — igual ao iFood: um cabeçalho com quem é a
// pessoa, e uma lista organizada de opções (cada uma sua própria tela),
// em vez de tudo empilhado numa página só. Pedidos, endereço e
// pagamento cada um é uma seção própria — aqui é só a porta de entrada.
export function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  // BUG CORRIGIDO: essa tela nunca soube que o cliente veio de uma mesa
  // (a rota /conta-cliente/* não carrega qrCodeToken na URL), então o
  // BottomNav sempre montava os links pro cardápio GERAL — bastava abrir
  // "Conta" a partir da mesa e navegar de volta pelo menu/carrinho do
  // rodapé que a sessão da mesa era perdida silenciosamente (o pedido
  // seguinte virava "Balcão" em vez de "Mesa"). `getActiveMesaToken` lê
  // a mesa ativa desse restaurante salva no localStorage por
  // useTableSession, exatamente pra esse cenário de "voltar pra onde eu
  // estava". O mesmo token vale para a DesktopNav (barra de topo).
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { customer, token, isLoading, logout, setCustomer } = useCustomerAuth();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // A DesktopNav exige os props da busca global. Nesta tela não há lista
  // para filtrar, então o texto fica só no estado local da barra.
  const [navSearch, setNavSearch] = useState('');
  const activeMesaToken = slug ? getActiveMesaToken(token, slug) ?? undefined : undefined;
  const push = usePushNotifications(tenant?.id, token);

  // Fluxo de verificação — explicação → câmera → envio. Cada etapa é
  // sua própria tela cheia (nunca as três juntas), fechando a anterior
  // antes de abrir a próxima.
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
      // Recarrega o perfil pra pegar o novo `verificationStatus: 'pending'`
      // vindo do backend — nunca assume esse valor localmente aqui.
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
    // Fecha na hora (não espera a resposta do servidor) — é só uma
    // marcação de "já vi", não precisa travar a UI por causa disso; se a
    // chamada falhar, o pior caso é o modal aparecer de novo na próxima
    // abertura, o que não é grave.
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
    <DesktopNav
      slug={slug!}
      qrCodeToken={activeMesaToken}
      tenantId={tenant.id}
      primaryColor={tenant.primaryColor}
      tenant={tenant}
      searchValue={navSearch}
      onSearchChange={setNavSearch}
    />
  );

  if (!customer) {
    return (
      <div className={`min-h-screen ${MENU_PAGE_BG}`}>
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

  return (
    <div className={`min-h-screen ${MENU_PAGE_BG} pb-24 md:pb-0`}>
      {/* Barra de topo (desktop) — a mesma do cardápio. No celular fica
          oculta e vale a BottomNav. */}
      {nav}

      <div className={PAGE_CONTAINER}>
        {/* Desktop: identidade à esquerda (fixa), opções à direita. */}
        <div className="md:grid md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] md:gap-8 md:items-start">
          <div className={`${CARD} px-6 py-6 flex items-center gap-3 md:sticky md:top-24`}>
            <div className="relative shrink-0">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {customer.avatarUrl ? (
                  <img src={customer.avatarUrl} alt={customer.name} className="w-full h-full object-cover" />
                ) : (
                  customer.name[0]?.toUpperCase()
                )}
              </div>
              {customer.isVerified && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <VerifiedBadge size={18} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`font-display font-bold ${MENU_TEXT} truncate`}>{customer.name}</p>
                {/* Pronomes na frente do nome, estilo Instagram. */}
                {customer.pronouns && (
                  <span className={`text-xs font-normal ${MENU_TEXT_MUTED} shrink-0`}>{formatPronouns(customer.pronouns, t)}</span>
                )}
              </div>
              {/* "Cliente Verificado" por extenso só aparece aqui e no "Aí na
                  Mesa" do admin, por decisão explícita do Felipe — em
                  qualquer outro lugar do app é só o selinho, sem o texto. */}
              {customer.isVerified && <VerifiedBadge variant="inline" size={12} />}
              <p className={`text-xs ${MENU_TEXT_BODY} truncate`}>{customer.email}</p>
              <p className={`text-[11px] ${MENU_TEXT_MUTED} mt-0.5`}>{tenant.name}</p>
            </div>
          </div>

          <div className="mt-4 md:mt-0 min-w-0">
            <div className={`${CARD} overflow-hidden`}>
              <MenuRow
                icon={User}
                iconBg="#EDE9FE"
                iconColor="#7C3AED"
                label={t('profile.myData')}
                onClick={() => navigate(`/${slug}/conta-cliente/dados`)}
              />
              {/* Verificação — pedido explícito do Felipe: o botão SOME por
                  completo (não reaparece de jeito nenhum) assim que
                  `isVerified` vira true. Enquanto pendente, fica visível
                  mas travado. Recusado volta a ficar ativo pra tentar de
                  novo, mostrando o motivo. */}
              {!customer.isVerified && (
                <MenuRow
                  icon={customer.verificationStatus === 'pending' ? Clock3 : BadgeCheck}
                  iconBg={customer.verificationStatus === 'pending' ? '#FFF7ED' : '#EFF6FF'}
                  iconColor={customer.verificationStatus === 'pending' ? '#F59E0B' : '#1D9BF0'}
                  label={
                    customer.verificationStatus === 'pending'
                      ? t('profile.verificationPending')
                      : customer.verificationStatus === 'rejected'
                        ? t('profile.verificationRejectedRetry')
                        : t('profile.verifyAccount')
                  }
                  disabled={customer.verificationStatus === 'pending'}
                  disabledSuffix={false}
                  onClick={() => setVerificationStep('explainer')}
                />
              )}
              <MenuRow
                icon={Receipt}
                iconBg="#FEE2E2"
                iconColor="#DC2626"
                label={t('profile.myOrders')}
                onClick={() => navigate(`/${slug}/conta-cliente/pedidos`)}
              />
              <MenuRow
                icon={MapPin}
                iconBg="#DBEAFE"
                iconColor="#2563EB"
                label={t('profile.savedAddress')}
                onClick={() => navigate(`/${slug}/conta-cliente/endereco`)}
              />
              <MenuRow
                icon={Wallet}
                iconBg="#DCFCE7"
                iconColor="#16A34A"
                label={t('profile.pixWallet')}
                onClick={() => navigate(`/${slug}/conta-cliente/carteira-pix`)}
              />
              <MenuRow
                icon={CircleDollarSign}
                iconBg="#3d3846"
                iconColor="#c0bfbc"
                label={t('profile.cashback')}
                onClick={() => navigate(`/${slug}/conta-cliente/cashback`)}
              />
              <MenuRow
                icon={Star}
                iconBg="#FEF3C7"
                iconColor="#F59E0B"
                label={t('profile.myReviews')}
                onClick={() => navigate(`/${slug}/conta-cliente/avaliacoes`)}
              />
              <MenuRow
                icon={Languages}
                iconBg="#E0F2FE"
                iconColor="#0284C7"
                label={t('profile.language')}
                onClick={() => navigate(`/${slug}/conta-cliente/idioma`)}
              />
            </div>

            {customer.verificationStatus === 'rejected' && customer.verificationRejectionReason && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-3.5 py-3 mt-3">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-0.5">{t('profile.verificationRejectedTitle')}</p>
                <p className="text-xs text-red-600 dark:text-red-400">{verificationReasonLabel(customer.verificationRejectionReason, t)}</p>
              </div>
            )}
            {verificationError && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-3.5 py-3 mt-3">
                <p className="text-xs text-red-600 dark:text-red-400">{verificationError}</p>
              </div>
            )}

            {push.isSupported && (
              <div className={`${CARD} overflow-hidden mt-3`}>
                <div className="w-full flex items-center gap-3 px-4 py-3.5 md:px-5">
                  <Tooltip label={t('profile.notifications')} className="flex flex-1 min-w-0">
                    <button
                      onClick={() => navigate(`/${slug}/conta-cliente/notificacoes`)}
                      className="flex items-center gap-3 w-full min-w-0 text-left"
                    >
                      <IconBadge
                        icon={push.isSubscribed ? Bell : BellOff}
                        backgroundColor={push.isSubscribed ? '#DCFCE7' : '#F3F4F6'}
                        iconColor={push.isSubscribed ? '#16A34A' : '#9CA3AF'}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${MENU_TEXT}`}>{t('profile.notifications')}</p>
                        <p className={`text-xs ${MENU_TEXT_MUTED}`}>
                          {push.permission === 'denied'
                            ? t('profile.notificationsBlocked')
                            : push.isSubscribed
                              ? t('profile.notificationsOn')
                              : t('profile.notificationsOff')}
                        </p>
                      </div>
                      <ChevronRight size={18} strokeWidth={1.5} className="text-gray-300 dark:text-[#5F6368] shrink-0" />
                    </button>
                  </Tooltip>
                  <Tooltip label={t('profile.notifications')}>
                    <button
                      onClick={() => (push.isSubscribed ? push.unsubscribe() : push.subscribe())}
                      disabled={push.isLoading || push.permission === 'denied'}
                      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 disabled:opacity-40 ml-2 ${
                        push.isSubscribed ? '' : 'bg-gray-200 dark:bg-white/20'
                      }`}
                      style={push.isSubscribed ? { backgroundColor: tenant.primaryColor } : undefined}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          push.isSubscribed ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}

            <div className={`${CARD} overflow-hidden mt-3`}>
              <MenuRow
                icon={LogOut}
                iconBg="#FEE2E2"
                iconColor="#DC2626"
                label={t('profile.logout')}
                labelColor="#DC2626"
                onClick={() => setConfirmingLogout(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* O modal precisa estar no retorno PRINCIPAL (cliente logado). Estava
          dentro do ramo "não logado", então o botão mudava o estado mas o
          modal nunca renderizava — "Sair da conta" parecia morto. */}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${MENU_SURFACE} border ${MENU_BORDER} rounded-2xl px-6 py-5 flex items-center gap-3`}>
            <div className="w-5 h-5 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
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
  icon: typeof Receipt;
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor?: string;
  onClick?: () => void;
  disabled?: boolean;
  // Por padrão, `disabled` também cola "· em breve" no rótulo (usado
  // pelas linhas "isso ainda não existe"). A linha de verificação usa
  // `disabled` só pra travar o clique enquanto "pendente" — já tem seu
  // próprio texto, então não deve ganhar esse sufixo.
  disabledSuffix?: boolean;
}

function MenuRow({
  icon,
  iconBg,
  iconColor,
  label,
  labelColor,
  onClick,
  disabled,
  disabledSuffix = true,
}: MenuRowProps) {
  const { t } = useI18n();
  return (
    // O balão repete o rótulo da linha (hover no desktop).
    <Tooltip label={label} className="flex w-full">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-3.5 md:px-5 border-b ${MENU_BORDER} last:border-b-0 disabled:opacity-40 md:hover:bg-black/[0.03] dark:md:hover:bg-white/5 md:transition-colors`}
      >
        <IconBadge icon={icon} backgroundColor={iconBg} iconColor={iconColor} size={40} />
        <span
          className={`flex-1 text-left text-sm font-medium ${labelColor ? '' : MENU_TEXT}`}
          style={labelColor ? { color: labelColor } : undefined}
        >
          {label}
          {disabled && disabledSuffix && <span className={`text-xs ${MENU_TEXT_MUTED} font-normal`}> {t('customerProfilePage.em_breve')}</span>}
        </span>
        {!disabled && <ChevronRight size={18} strokeWidth={1.5} className="text-gray-300 dark:text-[#5F6368]" />}
      </button>
    </Tooltip>
  );
}
