import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowBigUpDash,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  LogIn,
  Mail,
  Phone,
  User,
  UserPlus,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { AppSplashScreen } from '../components/AppSplashScreen';
import { formatBrazilPhone, isValidBrazilPhone } from '../lib/phone';
import { LoginSplit, LoginStateScreen } from '../components/login/LoginSplit';

type AuthMode = 'login' | 'register';

// Cadastro/login do CLIENTE FINAL — única porta de entrada do app
// (cardápio inteiro atrás de login, ver RequireCustomerAuth). Conta é
// DESTE restaurante (:slug), nunca cruzando vários.
//
// Visual premium (components/login/LoginSplit): editorial à esquerda (foto/nome do restaurante),
// painel de vidro à direita com abas Entrar/Cadastrar, campos em pílula e botão de vidro.
//
// "Lembrar de mim": só vale no LOGIN. Marcado (padrão, igual ao comportamento anterior) o token fica no
// localStorage; desmarcado, só no sessionStorage (some ao fechar a aba). A regra vive em
// lib/customerSession + CustomerAuthContext; esta tela apenas informa a escolha. O CADASTRO sempre
// persiste (não há checkbox lá, é o comportamento de antes).
export function CustomerAuthPage() {
  const { t } = useI18n();
  const uid = useId();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenant, error: tenantError, retry: retryTenant } = useTenant();
  const { login, register, customer, isLoading: isLoadingAuth } = useCustomerAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoogleSoon, setShowGoogleSoon] = useState(false);
  // true só entre "acabou de logar/cadastrar com sucesso" e "terminou de
  // mostrar a splash e navegou" — controla a AppSplashScreen abaixo.
  // Não confundir com a sessão já existente ao ABRIR a tela (esse caso
  // usa o redirect imediato do efeito logo ali embaixo, sem splash —
  // splash é só pra reforçar "acabei de entrar", não pra todo acesso).
  const [justAuthenticated, setJustAuthenticated] = useState(false);

  // Foco automático no e-mail só com mouse/teclado — no celular abriria o teclado sozinho.
  const autoFocusEmail = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
    [],
  );

  const redirectTo = searchParams.get('redirect') || `/${slug}`;

  // Sessão já válida pra esse restaurante? Nunca mostra o formulário
  // por cima dela — redireciona direto. `justAuthenticated` fica de
  // fora do gatilho de propósito: quando o login acabou de acontecer, é
  // a splash (mais abaixo) quem controla a navegação, não este efeito.
  useEffect(() => {
    if (!isLoadingAuth && customer && !justAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isLoadingAuth, customer, redirectTo, navigate, justAuthenticated]);

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setError(null);
    setShowGoogleSoon(false);
    setMode(next);
  }

  function handleTabKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: AuthMode = mode === 'login' ? 'register' : 'login';
    switchMode(next);
    requestAnimationFrame(() => document.getElementById(`${uid}-tab-${next}`)?.focus());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password, { remember });
      } else {
        await register({ email, password, name, phone: phone || undefined }, { remember: true });
      }
      setJustAuthenticated(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || t('auth.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePasswordKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState('CapsLock'));
  }

  if (justAuthenticated) {
    return <AppSplashScreen onFinish={() => navigate(redirectTo, { replace: true })} />;
  }

  if (tenantError) {
    return (
      <LoginStateScreen>
        <p>{tenantError}</p>
        <button type="button" onClick={retryTenant} className="lp-link">
          {t('optionalCustomerAuth.tentar_de_novo')}
        </button>
      </LoginStateScreen>
    );
  }

  if (!tenant) {
    return (
      <LoginStateScreen>
        <LoaderCircle className="lp-spin" size={28} strokeWidth={1.5} aria-hidden="true" />
      </LoginStateScreen>
    );
  }

  const isRegister = mode === 'register';
  const phoneInvalid = phone.length > 0 && !isValidBrazilPhone(phone);
  const passwordToggleLabel = showPassword ? t('auth.hidePassword') : t('auth.showPassword');

  return (
    <LoginSplit
      tenant={tenant}
      eyebrow={t('auth.editorialEyebrow')}
      title={isRegister ? t('auth.createTitle') : t('auth.welcomeBack')}
      subtitle={isRegister ? t('auth.registerSubtitle') : t('auth.loginHeroSubtitle')}
    >
      <div className="lp-tabs" role="tablist" onKeyDown={handleTabKey}>
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-login`}
          aria-selected={!isRegister}
          aria-controls={`${uid}-panel`}
          tabIndex={isRegister ? -1 : 0}
          className="lp-tab"
          onClick={() => switchMode('login')}
        >
          {t('common.enter')}
        </button>
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-register`}
          aria-selected={isRegister}
          aria-controls={`${uid}-panel`}
          tabIndex={isRegister ? 0 : -1}
          className="lp-tab"
          onClick={() => switchMode('register')}
        >
          {t('auth.tabRegister')}
        </button>
        <span className="lp-tabs__bar" data-pos={mode} aria-hidden="true" />
      </div>

      <form
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${mode}`}
        onSubmit={handleSubmit}
        className="lp-form"
        noValidate
      >
        <div className="lp-fields" key={mode}>
          {isRegister && (
            <div className="lp-group">
              <label className="lp-label" htmlFor={`${uid}-name`}>
                {t('auth.nameLabel')}
              </label>
              <div className="lp-field">
                <User className="lp-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
                <input
                  id={`${uid}-name`}
                  className="lp-input"
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder={t('auth.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="lp-group">
            <label className="lp-label" htmlFor={`${uid}-email`}>
              {t('auth.emailLabel')}
            </label>
            <div className="lp-field">
              <Mail className="lp-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
              <input
                id={`${uid}-email`}
                className="lp-input"
                type="email"
                name="email"
                autoComplete={isRegister ? 'email' : 'username'}
                autoFocus={autoFocusEmail}
                placeholder={t('auth.emailExample')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {isRegister && (
            <div className="lp-group">
              <label className="lp-label" htmlFor={`${uid}-phone`}>
                {t('auth.phoneLabel')}
              </label>
              <div className="lp-field" data-invalid={phoneInvalid || undefined}>
                <Phone className="lp-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
                <input
                  id={`${uid}-phone`}
                  className="lp-input"
                  type="tel"
                  name="phone"
                  inputMode="numeric"
                  autoComplete="tel"
                  aria-invalid={phoneInvalid || undefined}
                  placeholder="(48) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(formatBrazilPhone(e.target.value))}
                />
              </div>
              {phoneInvalid && (
                <p className="lp-hint lp-hint--error">{t('phoneInput.telefone_incompleto_confira_o')}</p>
              )}
            </div>
          )}

          <div className="lp-group">
            <label className="lp-label" htmlFor={`${uid}-password`}>
              {t('auth.passwordLabel')}
            </label>
            <div className="lp-field">
              <Lock className="lp-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
              <input
                id={`${uid}-password`}
                className="lp-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handlePasswordKey}
                onKeyUp={handlePasswordKey}
                onBlur={() => setCapsOn(false)}
              />
              {capsOn && (
                <span className="lp-caps" role="status" title={t('auth.capsOn')}>
                  <ArrowBigUpDash size={18} strokeWidth={1.5} aria-label={t('auth.capsOn')} />
                </span>
              )}
              <button
                type="button"
                className="lp-iconbtn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={passwordToggleLabel}
                title={passwordToggleLabel}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Eye size={18} strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {!isRegister && (
            <div className="lp-row">
              <label className="lp-check">
                <input
                  type="checkbox"
                  className="lp-check__input"
                  name="remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="lp-check__box" aria-hidden="true">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <span>{t('auth.remember')}</span>
              </label>
            </div>
          )}
        </div>

        {error && (
          <p className="lp-error" role="alert">
            <CircleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={
            isSubmitting ||
            !email ||
            !password ||
            (isRegister && (!name || !isValidBrazilPhone(phone)))
          }
          className={isSubmitting ? 'lp-btn is-busy' : 'lp-btn'}
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="lp-spin" size={18} strokeWidth={1.75} aria-hidden="true" />
              {t('auth.wait')}
            </>
          ) : (
            <>
              {isRegister ? (
                <UserPlus size={18} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <LogIn size={18} strokeWidth={1.5} aria-hidden="true" />
              )}
              {isRegister ? t('auth.createAccount') : t('common.enter')}
            </>
          )}
        </button>

        <div className="lp-or" aria-hidden="true">
          {t('auth.or')}
        </div>

        <button type="button" className="lp-social" onClick={() => setShowGoogleSoon(true)}>
          <GoogleIcon />
          {t('auth.google')}
        </button>
        {showGoogleSoon && <p className="lp-hint">{t('auth.googleSoon')}</p>}

        <button type="button" className="lp-link" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
          {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}
        </button>
      </form>
    </LoginSplit>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}
