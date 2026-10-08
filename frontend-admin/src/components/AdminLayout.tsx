import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyTenant } from '../lib/admin-api';
import { AdminSidebar } from './layout/AdminSidebar';
import { useAttentionStatus } from '../hooks/useAttentionStatus';
import { DashboardDataProvider, useDashboardData } from '../contexts/DashboardDataContext';
import { InternalNotificationsProvider } from '../contexts/InternalNotificationsContext';
import { NotificationBell } from './notifications/NotificationBell';
import { disableDevicePush, enableDevicePush, getPermission, registerPanelServiceWorker, wantsDevicePush } from '../lib/internalPush';

// O DashboardDataProvider precisa envolver TUDO que usa useAttentionStatus
// (inclusive este layout, pro blink do "Painel") e tudo que usa
// useDashboardData (a PainelPage, dentro do <Outlet />) — por isso ele
// entra aqui como o componente mais externo, e a lógica de verdade do
// layout mora em AdminLayoutContent, que já roda por dentro do provider.
export function AdminLayout() {
  return (
    <DashboardDataProvider>
      <InternalNotificationsProvider>
      <AdminLayoutContent />
      </InternalNotificationsProvider>
    </DashboardDataProvider>
  );
}

function AdminLayoutContent() {
  const { logout, updateTenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Pisca o item "Painel" quando tem algo pedindo atenção (chamado de
  // garçom, pedido novo, fechamento de conta solicitado) e o admin está
  // em outra aba. Guarda a assinatura do que já foi visto da última vez
  // que ele visitou o Painel — assim, ao sair e voltar pra outra aba, só
  // volta a piscar se surgir algo GENUINAMENTE novo (outro pedido, outro
  // chamado), não simplesmente porque ele saiu da tela. Sem isso, o item
  // ficava piscando pra sempre com o mesmo pedido/chamado antigo que ele
  // já tinha visto.
  const { hasAny, signature } = useAttentionStatus();
  const [dismissedSignature, setDismissedSignature] = useState('');

  useEffect(() => {
    if (location.pathname === '/') {
      setDismissedSignature(signature);
    }
  }, [location.pathname, signature]);

  const shouldBlinkPainel = hasAny && signature !== dismissedSignature;

  // Mesmo mecanismo, trilha própria: pisca "Verificações" quando existe
  // uma solicitação pendente nova, independente do que está acontecendo
  // no Painel — os dois nunca compartilham a mesma assinatura, senão uma
  // verificação nova faria "Painel" piscar à toa (e vice-versa).
  const { pendingVerifications } = useDashboardData();
  const verificationSignature = (pendingVerifications ?? [])
    .map((v) => v.id)
    .sort()
    .join(',');
  const [dismissedVerificationSignature, setDismissedVerificationSignature] = useState('');
  useEffect(() => {
    if (location.pathname === '/verificacoes') {
      setDismissedVerificationSignature(verificationSignature);
    }
  }, [location.pathname, verificationSignature]);
  const shouldBlinkVerifications =
    Boolean(verificationSignature) && verificationSignature !== dismissedVerificationSignature;

  // BUG CORRIGIDO: sessões antigas (de antes do login passar a devolver o
  // tenant inteiro) tinham só {id, name, slug} salvos no localStorage —
  // todo o resto (isOpen, deliveryFee, horários...) ficava undefined até
  // o admin salvar alguma coisa em Configurações, causando valores
  // "fantasma" na tela (ex: toggle de aberto/fechado caindo no fallback
  // do React em vez do valor real). Busca o tenant completo assim que o
  // painel abre, sempre — sem precisar de logout/login pra corrigir.
  useEffect(() => {
    fetchMyTenant().then(updateTenant).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Service worker do painel (push interno): registra sempre; se a pessoa já
  // tinha ativado neste aparelho, religa em silêncio ao entrar (sem pedir
  // permissão outra vez).
  useEffect(() => {
    void registerPanelServiceWorker().then(() => {
      if (wantsDevicePush() && getPermission() === 'granted') void enableDevicePush({ silent: true });
    });
    // Toque na notificação com o painel aberto: a SPA navega sem recarregar.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'navigate' || typeof e.data.url !== 'string') return;
      const url = new URL(e.data.url, window.location.origin);
      if (url.origin === window.location.origin) navigate(url.pathname + url.search);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const routeLocation = useLocation();
  useEffect(() => setMenuOpen(false), [routeLocation.pathname, routeLocation.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menuOpen]);

  async function handleLogout() {
    if (!window.confirm('Tem certeza que deseja sair?')) return;
    // Para de receber push neste aparelho enquanto a sessão não existe mais
    // (a preferência fica guardada: ao entrar de novo, religa sozinho).
    await disableDevicePush({ keepPreference: true }).catch(() => undefined);
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Celular: o menu lateral vira uma gaveta (botão no topo); a partir de
          md (768px) continua fixo na lateral, como sempre foi. */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden />
      )}
      <AdminSidebar
        menuOpen={menuOpen}
        blinking={{ painel: shouldBlinkPainel, verificacoes: shouldBlinkVerifications }}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 px-4 md:px-6 flex items-center justify-between gap-3 bg-gray-50/90 backdrop-blur border-b border-gray-100">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="md:hidden w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-600"
          >
            <Menu size={18} />
          </button>
          <span className="hidden md:block" />
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
