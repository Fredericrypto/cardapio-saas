import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowBigUpDash,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FoodBackdrop } from '../components/login/FoodBackdrop';
import { GlowCard } from '../components/login/GlowCard';
import { LoginTip } from '../components/login/LoginTip';
import '../components/login/login.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mesma lógica de antes: login() do AuthContext, depois navega para "/".
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('E-mail ou senha inválidos.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePasswordKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState('CapsLock'));
  }

  return (
    <div className="lg-root">
      <div className="lg-ambient" aria-hidden="true" />
      <FoodBackdrop />
      <div className="lg-vignette" aria-hidden="true" />

      <GlowCard>
        <div className="lg-logo" aria-hidden="true">
          <UtensilsCrossed size={26} strokeWidth={1.25} />
        </div>
        <h1 className="lg-title">Bem-vindo de volta</h1>
        <p className="lg-sub">Entre no painel para gerenciar seu cardápio</p>

        <form onSubmit={handleSubmit} className="lg-form">
          <label className="lg-field">
            <span className="lg-sr">E-mail</span>
            <Mail className="lg-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <input
              className="lg-input"
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
            />
          </label>

          <div className="lg-field">
            <Lock className="lg-field__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <input
              className="lg-input"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              aria-label="Senha"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handlePasswordKey}
              onKeyUp={handlePasswordKey}
              onBlur={() => setCapsOn(false)}
              placeholder="Senha"
            />
            {capsOn && (
              <LoginTip label="Caps Lock ativado">
                <span className="lg-caps">
                  <ArrowBigUpDash size={18} strokeWidth={1.5} aria-label="Caps Lock ativado" />
                </span>
              </LoginTip>
            )}
            <LoginTip label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} align="end">
              <button
                type="button"
                className="lg-iconbtn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
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

          <button type="submit" disabled={isSubmitting} className="lg-btn">
            <span className="lg-btn__ring" aria-hidden="true" />
            <span className="lg-btn__halo" aria-hidden="true" />
            <span className="lg-btn__fill">
              {isSubmitting ? (
                <>
                  <LoaderCircle className="lg-spin" size={18} strokeWidth={1.75} aria-hidden="true" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </>
              )}
            </span>
          </button>
        </form>

        <div className="lg-foot">
          <LoginTip label="O seu cargo define o que aparece no painel">
            <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" />
          </LoginTip>
          <span>Acesso restrito à equipe do estabelecimento</span>
        </div>
      </GlowCard>
    </div>
  );
}
