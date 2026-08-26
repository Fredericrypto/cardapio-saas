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
  ScanLine,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyTenant } from '../lib/admin-api';
import { useAttentionStatus } from '../hooks/useAttentionStatus';
import { DashboardDataProvider } from '../contexts/DashboardDataContext';

const NAV_ITEMS = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { to: '/mesas', label: 'Mesas', icon: Table2 },
  { to: '/lojas', label: 'Lojas', icon: Store },
  { to: '/promocoes', label: 'Promoções', icon: Percent },
  { to: '/fidelidade', label: 'Fidelidade', icon: Gift },
  { to: '/cashback', label: 'Cashback', icon: Wallet },
  { to: '/avaliacoes', label: 'Avaliações', icon: Star },
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
      <AdminLayoutContent />
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

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-100">
          <p className="font-display font-bold text-gray-900 truncate">
            {tenant?.name}
          </p>
          <p className="text-xs text-gray-400 truncate">{tenant?.slug}</p>
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
                        label === 'Painel' && shouldBlinkPainel ? 'nav-attention-blink' : ''
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
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 w-full"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
