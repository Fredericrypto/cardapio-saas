import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { PhoneInput } from '../components/PhoneInput';
import { AppSplashScreen } from '../components/AppSplashScreen';
import { isValidBrazilPhone } from '../lib/phone';

// Cadastro/login do CLIENTE FINAL — única porta de entrada do app
// (cardápio inteiro atrás de login, ver RequireCustomerAuth). Conta é
// DESTE restaurante (:slug), nunca cruzando vários.
//
// Visual: claro e apetitoso, não uma tela de rede network escura — a
// foto de capa do restaurante (se existir) desfocada ao fundo, cartão
// de vidro branco por cima (glassmorphism de verdade, não um preto
// genérico), botão principal com glow nas cores da marca. Cada
// restaurante que usa o SaaS ganha uma tela com a cara dele.
export function CustomerAuthPage() {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoogleSoon, setShowGoogleSoon] = useState(false);
  // true só entre "acabou de logar/cadastrar com sucesso" e "terminou de
  // mostrar a splash e navegou" — controla a AppSplashScreen abaixo.
  // Não confundir com a sessão já existente ao ABRIR a tela (esse caso
  // usa o redirect imediato do efeito logo ali embaixo, sem splash —
  // splash é só pra reforçar "acabei de entrar", não pra todo acesso).
  const [justAuthenticated, setJustAuthenticated] = useState(false);

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

  async function handleSubmit() {
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
        err?.response?.data?.message || 'Não foi possível concluir. Confira os dados e tente de novo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (justAuthenticated) {
    return <AppSplashScreen onFinish={() => navigate(redirectTo, { replace: true })} />;
  }

  if (tenantError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center bg-gray-50">
        <p className="text-sm text-gray-500">{tenantError}</p>
        <button onClick={retryTenant} className="text-sm font-semibold text-gray-900 underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
      </div>
    );
  }

  const primary = tenant.primaryColor;
  const secondary = tenant.secondaryColor;

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-5 py-10 bg-gray-50">
      {/* Fundo: foto de capa do restaurante desfocada (se existir),
          senão um gradiente claro nas cores da marca — nunca um preto
          genérico. */}
      {tenant.coverImageUrl ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-40"
            style={{ backgroundImage: `url(${tenant.coverImageUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/70 to-white/90" />
        </>
      ) : (
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{ background: `radial-gradient(circle at 20% 10%, ${primary}, transparent 55%), radial-gradient(circle at 85% 90%, ${secondary}, transparent 55%)` }}
        />
      )}

      <div className="relative w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden bg-white border border-gray-100"
            style={{ boxShadow: `0 12px 32px -8px ${primary}66` }}
          >
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl font-bold" style={{ color: primary }}>
                {tenant.name.charAt(0)}
              </span>
            )}
          </div>
        </div>

        {/* Cartão de vidro CLARO — fundo branco translúcido com blur,
            não um cartão preto opaco. */}
        <div
          className="rounded-3xl border border-white/60 p-7 backdrop-blur-xl"
          style={{
            background: 'rgba(255,255,255,0.75)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
          }}
        >
          <p className="text-center text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            {tenant.name}
          </p>
          <h1 className="font-display text-2xl font-bold text-gray-900 text-center mt-1">
            {mode === 'login' ? 'Bem-vindo de volta' : 'Criar sua conta'}
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1.5">
            {mode === 'login' ? 'Entre pra fazer seu pedido.' : 'Leva menos de um minuto.'}
          </p>

          <div className="flex flex-col gap-3 mt-6">
            {mode === 'register' && (
              <GlassInput type="text" value={name} onChange={setName} placeholder="Seu nome" accent={primary} />
            )}
            <GlassInput type="email" value={email} onChange={setEmail} placeholder="E-mail" accent={primary} />
            {mode === 'register' && (
              <PhoneInput
                value={phone}
                onChange={setPhone}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none w-full transition-colors"
              />
            )}
            <GlassInput
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Senha"
              accent={primary}
            />

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !email ||
                !password ||
                (mode === 'register' && (!name || !isValidBrazilPhone(phone)))
              }
              className="relative mt-1 py-3.5 rounded-xl text-sm font-bold text-white overflow-hidden disabled:opacity-40 disabled:grayscale transition-all active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                boxShadow: `0 8px 28px -6px ${primary}99`,
              }}
            >
              {isSubmitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium">ou</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button
              onClick={() => setShowGoogleSoon(true)}
              className="py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 flex items-center justify-center gap-2.5 transition-colors hover:bg-gray-50"
            >
              <GoogleIcon />
              Continuar com Google
            </button>
            {showGoogleSoon && (
              <p className="text-[11px] text-gray-400 text-center -mt-1">
                Login com Google chegando em breve por aqui.
              </p>
            )}

            <button
              onClick={() => {
                setError(null);
                setShowGoogleSoon(false);
                setMode((m) => (m === 'login' ? 'register' : 'login'));
              }}
              className="text-xs font-semibold text-gray-500 mt-1 py-1"
            >
              {mode === 'login' ? 'Não tem conta? Criar uma agora' : 'Já tem conta? Entrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlassInput({
  type,
  value,
  onChange,
  placeholder,
  accent,
}: {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  accent: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none w-full transition-colors"
      onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = '#E5E7EB')}
    />
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}
