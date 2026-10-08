import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Table2,
  Store,
  Percent,
  Gift,
  Wallet,
  Star,
  History,
  TrendingUp,
  StickyNote,
  Menu,
  ScanLine,
  Settings,
  LogOut,
  BadgeCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyTenant } from '../lib/admin-api';
import { BUILD_VERSION } from '../buildInfo';
import { useAttentionStatus } from '../hooks/useAttentionStatus';
import { DashboardDataProvider, useDashboardData } from '../contexts/DashboardDataContext';
import { InternalNotificationsProvider } from '../contexts/InternalNotificationsContext';
import { NotificationBell } from './notifications/NotificationBell';
import { disableDevicePush, enableDevicePush, getPermission, registerPanelServiceWorker, wantsDevicePush } from '../lib/internalPush';

const NAV_ITEMS = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { to: '/mesas', label: 'Mesas', icon: Table2 },
  { to: '/lojas', label: 'Lojas', icon: Store },
  { to: '/promocoes', label: 'Promoções', icon: Percent },
  { to: '/fidelidade', label: 'Fidelidade', icon: Gift },
  { to: '/cashback', label: 'Cashback', icon: Wallet },
  { to: '/avaliacoes', label: 'Avaliações', icon: Star },
  { to: '/verificacoes', label: 'Verificações', icon: BadgeCheck },
  { to: '/analise', label: 'Análise', icon: TrendingUp },
  { to: '/anotacoes', label: 'Anotações', icon: StickyNote },
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/verificar-cupom', label: 'Verificar cupom', icon: ScanLine },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

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
  const { tenant, logout, updateTenant } = useAuth();
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
      <aside
        className={`bg-white border-r border-gray-100 flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 md:overflow-visible ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-gray-100">
          {/* Nome SEM cortar: quebra em quantas linhas precisar, qualquer que
              seja o tamanho (overflowWrap pega até palavra gigante sem espaço). */}
          <p
            className="font-display font-bold text-gray-900 leading-tight"
            style={{ overflowWrap: 'anywhere' }}
          >
            {tenant?.name}
          </p>
          <p className="text-xs text-gray-400 mt-0.5" style={{ overflowWrap: 'anywhere' }}>
            {tenant?.slug}
          </p>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : `text-gray-600 hover:bg-gray-100 ${
                        (label === 'Painel' && shouldBlinkPainel) ||
                        (label === 'Verificações' && shouldBlinkVerifications)
                          ? 'nav-attention-blink'
                          : ''
                      }`
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          {/* Mesmo estilo do "Chamar garçom" do cardápio, centralizado. */}
          <button
            onClick={handleLogout}
            className="w-full rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: tenant?.primaryColor ?? '#3d3846' }}
          >
            <LogOut size={14} />
            Sair
          </button>
          <p className="text-[10px] text-gray-300 text-center mt-2 select-all">
            build {BUILD_VERSION}
          </p>
        </div>
      </aside>

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
