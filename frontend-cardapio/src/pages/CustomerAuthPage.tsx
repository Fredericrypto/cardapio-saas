import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowBigUpDash,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { AppSplashScreen } from '../components/AppSplashScreen';
import { formatBrazilPhone, isValidBrazilPhone } from '../lib/phone';
import { GlowCard } from '../components/login/GlowCard';
import { LoginShell } from '../components/login/LoginShell';
import { LoginTip } from '../components/login/LoginTip';

// Cadastro/login do CLIENTE FINAL — única porta de entrada do app
// (cardápio inteiro atrás de login, ver RequireCustomerAuth). Conta é
// DESTE restaurante (:slug), nunca cruzando vários.
//
// Visual: o MESMO da tela de login do admin (components/login/*) — cartão de
// vidro com glow que segue o mouse e vira dois pontos de luz na borda, campos
// em pílula, botão com borda de luz, fundo escuro com ícones de comida.
// A identidade do restaurante aparece na caixinha do logo e no nome acima do título.
export function CustomerAuthPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenant, error: tenantError, retry: retryTenant } = useTenant();
  const { login, register, customer, isLoading: isLoadingAuth } = useCustomerAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, name, phone: phone || undefined });
      }
      setJustAuthenticated(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || t('auth.submitError'),
      );
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
      <LoginShell>
        <div className="lg-state">
          <p className="lg-sub">{tenantError}</p>
          <button type="button" onClick={retryTenant} className="lg-link">
            {t('optionalCustomerAuth.tentar_de_novo')}
          </button>
        </div>
      </LoginShell>
    );
  }

  if (!tenant) {
    return (
      <LoginShell>
        <LoaderCircle className="lg-spin lg-state-spinner" size={28} strokeWidth={1.5} aria-hidden="true" />
      </LoginShell>
    );
  }

  const isRegister = mode === 'register';
  const phoneInvalid = phone.length > 0 && !isValidBrazilPhone(phone);

  return (
    <LoginShell>
      <GlowCard>
        <div className="lg-logo lg-logo--tenant">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} />
          ) : (
            <span className="lg-logo__letter">{tenant.name.charAt(0)}</span>
          )}
        </div>
        <p className="lg-eyebrow">{tenant.name}</p>
        <h1 className="lg-title">{isRegister ? t('auth.createTitle') : t('auth.welcomeBack')}</h1>
        <p className="lg-sub">{isRegister ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}</p>

        <form onSubmit={handleSubmit} className="lg-form" noValidate>
          {isRegister && (
            <div className="lg-field">
              <User className="lg-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
              <input
                className="lg-input"
                type="text"
                name="name"
                autoComplete="name"
                aria-label={t('auth.namePlaceholder')}
                placeholder={t('auth.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="lg-field">
            <Mail className="lg-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <input
              className="lg-input"
              type="email"
              name="email"
              autoComplete={isRegister ? 'email' : 'username'}
              autoFocus={autoFocusEmail}
              aria-label={t('auth.emailPlaceholder')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {isRegister && (
            <>
              <div className="lg-field">
                <Phone className="lg-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
                <input
                  className="lg-input"
                  type="tel"
                  name="phone"
                  inputMode="numeric"
                  autoComplete="tel"
                  aria-label="(48) 99999-9999"
                  aria-invalid={phoneInvalid || undefined}
                  placeholder="(48) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(formatBrazilPhone(e.target.value))}
                />
              </div>
              {phoneInvalid && (
                <p className="lg-hint lg-hint--error">{t('phoneInput.telefone_incompleto_confira_o')}</p>
              )}
            </>
          )}

          <div className="lg-field">
            <Lock className="lg-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <input
              className="lg-input"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              aria-label={t('auth.passwordPlaceholder')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handlePasswordKey}
              onKeyUp={handlePasswordKey}
              onBlur={() => setCapsOn(false)}
            />
            {capsOn && (
              <LoginTip label={t('auth.capsOn')}>
                <span className="lg-caps">
                  <ArrowBigUpDash size={18} strokeWidth={1.5} aria-label={t('auth.capsOn')} />
                </span>
              </LoginTip>
            )}
            <LoginTip label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')} align="end">
              <button
                type="button"
                className="lg-iconbtn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Eye size={18} strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            </LoginTip>
          </div>

          {error && (
            <p className="lg-error" role="alert">
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
            className={isSubmitting ? 'lg-btn is-busy' : 'lg-btn'}
          >
            <span className="lg-btn__ring" aria-hidden="true" />
            <span className="lg-btn__halo" aria-hidden="true" />
            <span className="lg-btn__fill">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="lg-spin" size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t('auth.wait')}
                </>
              ) : (
                <>
                  {isRegister ? t('auth.createAccount') : t('common.enter')}
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </>
              )}
            </span>
          </button>

          <div className="lg-or" aria-hidden="true">
            {t('auth.or')}
          </div>

          <button type="button" className="lg-social" onClick={() => setShowGoogleSoon(true)}>
            <GoogleIcon />
            {t('auth.google')}
          </button>
          {showGoogleSoon && <p className="lg-hint">{t('auth.googleSoon')}</p>}

          <button
            type="button"
            className="lg-link"
            onClick={() => {
              setError(null);
              setShowGoogleSoon(false);
              setMode((m) => (m === 'login' ? 'register' : 'login'));
            }}
          >
            {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}
          </button>
        </form>
      </GlowCard>
    </LoginShell>
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
