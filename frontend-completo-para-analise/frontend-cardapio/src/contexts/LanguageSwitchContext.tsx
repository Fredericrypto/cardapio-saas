import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SplashScreen } from '../components/SplashScreen';
import { updateMyCustomerProfile } from '../lib/customer-api';
import { getActiveMesaToken } from '../lib/seat';
import { useI18n } from '../i18n/I18nContext';
import { normalizeLanguage, storeLanguage, type AppLanguage } from '../i18n/languages';
import { useCustomerAuth } from './CustomerAuthContext';
import { useTenant } from './TenantContext';

// Fluxo "recarregamento limpo" da troca de idioma:
//   0 ms     Splash do restaurante em tela cheia (mesmo componente da abertura).
//   0 ms     Idioma salvo no localStorage; PATCH do perfil dispara em paralelo.
//   700 ms   Contexto de i18n inicializa com os dicionários do novo idioma
//            (por baixo da splash, sem ninguém ver o meio-termo).
//   1100 ms  Redireciona para a rota atual do cardápio (mesa aberta ou geral).
//   1600 ms  A própria splash termina o fade e sai (dentro dos 1,5–2 s pedidos).
// Nada de `window.location.reload()`: carrinho, sessão de mesa e login
// continuam intactos — só parece um recarregamento.
const APPLY_AT_MS = 700;
const NAVIGATE_AT_MS = 1100;
const PENDING_SYNC_KEY = 'cardapio_language_pending_sync';

interface LanguageSwitchValue {
  switchLanguage: (next: AppLanguage) => void;
  isSwitching: boolean;
}

const LanguageSwitchContext = createContext<LanguageSwitchValue | null>(null);

export function LanguageSwitchProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { customer, token, setCustomer } = useCustomerAuth();
  const { language, setLanguage, t } = useI18n();
  const [isSwitching, setIsSwitching] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const busyRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const pushToServer = useCallback(
    async (next: AppLanguage): Promise<boolean> => {
      if (!tenant || !token) return true; // sem conta não há perfil para sincronizar
      try {
        localStorage.setItem(PENDING_SYNC_KEY, next);
      } catch {
        /* sem storage: segue sem a marca de pendência */
      }
      try {
        const profile = await updateMyCustomerProfile(tenant.id, token, { language: next });
        setCustomer(profile);
        try {
          localStorage.removeItem(PENDING_SYNC_KEY);
        } catch {
          /* idem */
        }
        return true;
      } catch {
        return false; // fica pendente: é reenviado no próximo login/abertura
      }
    },
    [tenant, token, setCustomer],
  );

  // Ao conhecer o perfil: se uma troca anterior ficou sem sincronizar, reenvia;
  // senão o idioma da CONTA vale (entrar em outro aparelho já abre no idioma certo).
  useEffect(() => {
    if (!customer || busyRef.current) return;
    let pending: AppLanguage | null = null;
    try {
      const raw = localStorage.getItem(PENDING_SYNC_KEY);
      pending = raw ? normalizeLanguage(raw) : null;
    } catch {
      pending = null;
    }
    if (pending && pending !== customer.language) {
      void pushToServer(pending);
      return;
    }
    if (customer.language) {
      const accountLanguage = normalizeLanguage(customer.language);
      if (accountLanguage !== language) setLanguage(accountLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, customer?.language]);

  useEffect(() => {
    if (!syncFailed) return;
    const timer = setTimeout(() => setSyncFailed(false), 6000);
    return () => clearTimeout(timer);
  }, [syncFailed]);

  const switchLanguage = useCallback(
    (next: AppLanguage) => {
      if (busyRef.current || !slug || !tenant) return;
      busyRef.current = true;
      setIsSwitching(true);
      storeLanguage(next);
      const syncPromise = pushToServer(next);

      timersRef.current.push(setTimeout(() => setLanguage(next), APPLY_AT_MS));
      timersRef.current.push(
        setTimeout(() => {
          const mesaToken = getActiveMesaToken(token, slug);
          navigate(mesaToken ? `/${slug}/mesa/${mesaToken}` : `/${slug}`, { replace: true });
          void syncPromise.then((ok) => {
            if (!ok) setSyncFailed(true);
          });
        }, NAVIGATE_AT_MS),
      );
    },
    [navigate, pushToServer, setLanguage, slug, tenant, token],
  );

  const handleSplashFinish = useCallback(() => {
    busyRef.current = false;
    setIsSwitching(false);
  }, []);

  return (
    <LanguageSwitchContext.Provider value={{ switchLanguage, isSwitching }}>
      {children}
      {isSwitching && <SplashScreen tenant={tenant} onFinish={handleSplashFinish} />}
      {syncFailed && (
        <div
          role="status"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[calc(100%-2rem)] rounded-xl bg-gray-900 text-white text-xs px-4 py-3 shadow-lg"
        >
          {t('language.syncError')}
        </div>
      )}
    </LanguageSwitchContext.Provider>
  );
}

export function useLanguageSwitch(): LanguageSwitchValue {
  const ctx = useContext(LanguageSwitchContext);
  if (!ctx) throw new Error('useLanguageSwitch precisa estar dentro de um LanguageSwitchProvider');
  return ctx;
}
