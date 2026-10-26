import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LogIn, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { Tooltip } from './Tooltip';
import { MENU_BORDER, MENU_SURFACE, MENU_TEXT, MENU_TEXT_BODY } from '../lib/menuTheme';
import { buildLoginUrl, loginPromptCopy, resolveLoginPromptView, type LoginPromptReason } from '../lib/loginPrompt';

// Pedido de login global (decisão B, 24/10): convidado navega, entra na mesa e monta o carrinho,
// mas pedir e usar promoção exigem conta. Quem decide que a ação precisa de conta é o
// CartContext (`loginIntent`); este componente só mostra o aviso e leva para a MESMA rota de
// login do resto do app (com retorno). Não guarda token, não chama a API de login e não cria
// nenhum estado de autenticação próprio — tudo vem do CustomerAuthContext.
//
// Montado UMA vez em CustomerAppShell: dentro do Router (/:slug) e do CustomerAuthProvider.
//
// Enquanto a sessão ainda está sendo confirmada (reload de cliente logado) NÃO aparece, para
// nunca chamar de "convidado" quem pode estar logado; se existe token mas o servidor não deixou
// confirmar (5xx/rede/429), mostra "não deu para confirmar" com "Tentar de novo" — falha de
// servidor não vira pedido de login. Performance: sem blur no celular (só md+), sem animação
// própria e o diálogo só existe no DOM enquanto aberto.

const CONFIRM_CLASS = 'glass-btn';
const CANCEL_CLASS =
  'border border-[#E5E7EB] dark:border-white/10 text-[#4B5563] dark:text-[#C4C7C5] hover:bg-[#F9FAFB] dark:hover:bg-white/10';
const FOCUS_CLASS = 'outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/30';

export function LoginRequiredModal() {
  const { loginIntent, dismissLoginIntent } = useCart();
  const { customer, token, isLoading, authError, retry } = useCustomerAuth();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const view = resolveLoginPromptView({
    reason: loginIntent?.reason ?? null,
    isLoading,
    hasToken: Boolean(token),
    hasCustomer: Boolean(customer),
    authError,
  });

  // Já existe conta: o pedido de login perdeu o sentido. Descarta em silêncio.
  useEffect(() => {
    if (view === 'obsolete') dismissLoginIntent();
  }, [view, dismissLoginIntent]);

  // Navegar (voltar do navegador, link) encerra um aviso pendente: ele nunca "segue" a pessoa.
  const pathname = location.pathname;
  useEffect(() => {
    dismissLoginIntent();
  }, [pathname, dismissLoginIntent]);

  if ((view !== 'login' && view !== 'unconfirmed') || !loginIntent) return null;

  function confirmLogin() {
    dismissLoginIntent();
    if (slug) navigate(buildLoginUrl(slug, `${location.pathname}${location.search}`));
  }

  function confirmRetry() {
    dismissLoginIntent();
    retry();
  }

  return (
    <LoginRequiredDialog
      variant={view}
      reason={loginIntent.reason}
      onConfirm={view === 'login' ? confirmLogin : confirmRetry}
      onDismiss={dismissLoginIntent}
    />
  );
}

function LoginRequiredDialog({
  variant,
  reason,
  onConfirm,
  onDismiss,
}: {
  variant: 'login' | 'unconfirmed';
  reason: LoginPromptReason;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useScrollLock(true);
  const { t } = useI18n();
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const isLogin = variant === 'login';
  const copy = loginPromptCopy(reason);
  const title = isLogin ? t(copy.title) : t('loginRequired.unconfirmed.title');
  const message = isLogin ? t(copy.message) : t('loginRequired.unconfirmed.message');
  const confirmLabel = isLogin ? t('loginRequired.confirm') : t('loginRequired.unconfirmed.retry');
  const dismissLabel = t('loginRequired.dismiss');
  const Icon = isLogin ? LogIn : RefreshCw;

  // Foco no botão principal ao abrir e de volta a quem o tinha ao fechar.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus();
    };
  }, []);

  // Esc fecha; Tab fica preso dentro do diálogo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-black/40 dark:bg-black/60 md:backdrop-blur-sm flex items-center justify-center px-6"
      onClick={onDismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-desc`}
        className={`${MENU_SURFACE} border ${MENU_BORDER} rounded-3xl p-6 max-w-xs md:max-w-sm w-full flex flex-col items-center gap-4 text-center shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full border ${MENU_BORDER} bg-[#F9FAFB] dark:bg-white/[0.06] ${MENU_TEXT}`}
          aria-hidden="true"
        >
          <Icon size={22} strokeWidth={1.5} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 id={`${uid}-title`} className={`text-base font-semibold ${MENU_TEXT}`}>
            {title}
          </h2>
          <p id={`${uid}-desc`} className={`text-sm ${MENU_TEXT_BODY}`}>
            {message}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Tooltip label={confirmLabel} className="flex">
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${CONFIRM_CLASS} ${FOCUS_CLASS}`}
            >
              {confirmLabel}
            </button>
          </Tooltip>
          <Tooltip label={dismissLabel} className="flex">
            <button
              type="button"
              onClick={onDismiss}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${CANCEL_CLASS} ${FOCUS_CLASS}`}
            >
              {dismissLabel}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}
