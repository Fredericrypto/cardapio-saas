import { Link, useLocation } from 'react-router-dom';
import { UtensilsCrossed, ShoppingCart, User } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';

interface BottomNavProps {
  slug: string;
  qrCodeToken?: string;
  tenantId: string;
  primaryColor?: string;
}

// Navegação persistente do app do cliente — Cardápio / Carrinho / Conta,
// sempre visível, dentro de UM restaurante (cliente é por restaurante,
// não uma conta cruzando vários — por isso slug/tenantId são sempre
// obrigatórios aqui, nunca "último visitado").
export function BottomNav({ slug, qrCodeToken, primaryColor = '#111827' }: BottomNavProps) {
  const location = useLocation();
  const { totalItems } = useCart();
  const { customer } = useCustomerAuth();

  const base = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
  const menuHref = base;
  const cartHref = `${base}/carrinho`;
  const accountHref = customer ? `/${slug}/conta-cliente/perfil` : `/${slug}/conta-cliente/entrar`;
  const accountActive = location.pathname.startsWith(`/${slug}/conta-cliente`);

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 flex z-40">
      <NavItem
        to={menuHref}
        icon={UtensilsCrossed}
        label="Cardápio"
        active={location.pathname === menuHref}
        color={primaryColor}
      />
      <NavItem
        to={cartHref}
        icon={ShoppingCart}
        label="Carrinho"
        active={location.pathname === cartHref}
        color={primaryColor}
        badge={totalItems > 0 ? totalItems : undefined}
      />
      <Link to={accountHref} className="flex-1 flex">
        <div className="flex flex-col items-center gap-1 py-2.5 flex-1 relative">
          <div
            className="relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors"
            style={{ backgroundColor: accountActive ? `${primaryColor}1a` : 'transparent' }}
          >
            {/* Avatar do cliente, igual Instagram — foto de verdade se
                tiver, senão um círculo com a inicial do nome (nunca o
                ícone genérico de "pessoa"). Contorno colorido quando a
                aba está ativa, do mesmo jeito que os outros ícones. */}
            <div
              className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
              style={{
                boxShadow: accountActive ? `0 0 0 1.5px ${primaryColor}` : undefined,
                backgroundColor: customer?.avatarUrl ? undefined : '#D1D5DB',
              }}
            >
              {customer?.avatarUrl ? (
                <img src={customer.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : customer?.name ? (
                <span className="text-[10px] font-bold text-white">
                  {customer.name[0].toUpperCase()}
                </span>
              ) : (
                <User size={13} className="text-white" />
              )}
            </div>
          </div>
          <span className="text-[10px] font-semibold" style={{ color: accountActive ? primaryColor : '#9CA3AF' }}>
            Conta
          </span>
        </div>
      </Link>
    </div>
  );
}

interface NavItemProps {
  to: string;
  icon: typeof User;
  label: string;
  active: boolean;
  color: string;
  badge?: number;
}

function NavItem({ to, icon: Icon, label, active, color, badge }: NavItemProps) {
  return (
    <Link to={to} className="flex-1 flex">
      <div className="flex flex-col items-center gap-1 py-2.5 flex-1 relative">
        <div
          className="relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors"
          style={{ backgroundColor: active ? `${color}1a` : 'transparent' }}
        >
          <Icon size={19} color={active ? color : '#9CA3AF'} />
          {Boolean(badge) && (
            <span
              className="absolute -top-1 -right-1.5 text-[9px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              {badge}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold" style={{ color: active ? color : '#9CA3AF' }}>
          {label}
        </span>
      </div>
    </Link>
  );
}
