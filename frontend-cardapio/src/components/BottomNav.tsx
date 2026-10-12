import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { Link, useLocation } from 'react-router-dom';
import { UtensilsCrossed, ShoppingCart, User, MapPin } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTheme } from '../hooks/useTheme';
import type { Tenant } from '../types';
import { LogoViewer } from './LogoViewer';
import { SearchBar } from './SearchBar';

interface BottomNavProps {
  slug: string;
  qrCodeToken?: string;
  tenantId: string;
  primaryColor?: string;
}

type NavCustomer = ReturnType<typeof useCustomerAuth>['customer'];

// Estado/rotas compartilhados entre a barra inferior (celular) e a barra
// superior (desktop) — uma única fonte de verdade pra hrefs, aba ativa,
// cores e contagem do carrinho.
function useNavModel(slug: string, qrCodeToken: string | undefined, primaryColor: string) {
  const location = useLocation();
  const { totalItems } = useCart();
  const { customer } = useCustomerAuth();
  // No escuro: marca clareada (texto/ícone) e cinza inativo com contraste.
  const accent = useAccentColor(primaryColor);
  const { isDark } = useTheme();
  const inactive = isDark ? '#A3A6A4' : '#9CA3AF';
  const { t } = useI18n();

  const base = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
  const menuHref = base;
  const cartHref = `${base}/carrinho`;
  // BUG CORRIGIDO: sem o `?redirect=`, logar/criar conta a partir da
  // mesa sempre devolvia o cliente pro cardápio GERAL (delivery/
  // retirada) em vez de de volta pra própria mesa — aí ele perdia o
  // timer/chamar garçom/pedir conta bem na hora que só queria acessar a
  // conta, e podia acabar tendo que reescanear o QR ou passar pela tela
  // de "você ainda está nessa mesa?" à toa. `menuHref` aqui já é a
  // própria página da mesa quando `qrCodeToken` existe.
  const accountHref = customer
    ? `/${slug}/conta-cliente/perfil`
    : `/${slug}/conta-cliente/entrar?redirect=${encodeURIComponent(menuHref)}`;
  const accountActive = location.pathname.startsWith(`/${slug}/conta-cliente`);

  return {
    t,
    accent,
    inactive,
    customer,
    totalItems,
    menuHref,
    cartHref,
    accountHref,
    accountActive,
    menuActive: location.pathname === menuHref,
    cartActive: location.pathname === cartHref,
  };
}

// Avatar do cliente, igual Instagram — foto de verdade se tiver, senão um
// círculo com a inicial do nome (nunca o ícone genérico de "pessoa").
// Contorno colorido quando a aba está ativa, do mesmo jeito que os outros
// ícones.
function AccountAvatar({ customer, active, accent }: { customer: NavCustomer; active: boolean; accent: string }) {
  return (
    <div
      className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
      style={{
        boxShadow: active ? `0 0 0 1.5px ${accent}` : undefined,
        backgroundColor: customer?.avatarUrl ? undefined : '#D1D5DB',
      }}
    >
      {customer?.avatarUrl ? (
        <img src={customer.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : customer?.name ? (
        <span className="text-[10px] font-bold text-white">{customer.name[0].toUpperCase()}</span>
      ) : (
        <User size={13} className="text-white" />
      )}
    </div>
  );
}

// Navegação persistente do app do cliente — Cardápio / Carrinho / Conta,
// sempre visível, dentro de UM restaurante (cliente é por restaurante,
// não uma conta cruzando vários — por isso slug/tenantId são sempre
// obrigatórios aqui, nunca "último visitado").
//
// Barra flutuante inferior só no celular (`md:hidden`): em telas grandes ela
// fica redundante e é substituída pela `DesktopNav` no topo da página.
export function BottomNav({ slug, qrCodeToken, primaryColor = '#111827' }: BottomNavProps) {
  const nav = useNavModel(slug, qrCodeToken, primaryColor);

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 flex z-40 md:hidden">
      <NavItem
        to={nav.menuHref}
        icon={UtensilsCrossed}
        label={nav.t('nav.menu')}
        active={nav.menuActive}
        color={nav.accent}
        inactiveColor={nav.inactive}
      />
      <NavItem
        to={nav.cartHref}
        icon={ShoppingCart}
        label={nav.t('nav.cart')}
        active={nav.cartActive}
        color={nav.accent}
        inactiveColor={nav.inactive}
        badgeColor={primaryColor}
        badge={nav.totalItems > 0 ? nav.totalItems : undefined}
      />
      <Link to={nav.accountHref} className="flex-1 flex">
        <div className="flex flex-col items-center gap-1 py-2.5 flex-1 relative">
          <div
            className="relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors"
            style={{ backgroundColor: nav.accountActive ? `${nav.accent}1a` : 'transparent' }}
          >
            <AccountAvatar customer={nav.customer} active={nav.accountActive} accent={nav.accent} />
          </div>
          <span
            className="text-[10px] font-semibold"
            style={{ color: nav.accountActive ? nav.accent : nav.inactive }}
          >
            {nav.t('nav.account')}
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
  inactiveColor: string;
  badgeColor?: string;
  badge?: number;
}

function NavItem({ to, icon: Icon, label, active, color, inactiveColor, badgeColor, badge }: NavItemProps) {
  return (
    <Link to={to} className="flex-1 flex">
      <div className="flex flex-col items-center gap-1 py-2.5 flex-1 relative">
        <div
          className="relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors"
          style={{ backgroundColor: active ? `${color}1a` : 'transparent' }}
        >
          <Icon size={19} color={active ? color : inactiveColor} />
          {Boolean(badge) && (
            <span
              className="absolute -top-1 -right-1.5 text-[9px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center"
              style={{ backgroundColor: badgeColor ?? color }}
            >
              {badge}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold" style={{ color: active ? color : inactiveColor }}>
          {label}
        </span>
      </div>
    </Link>
  );
}

// Equivalente desktop da BottomNav: barra de topo fixa (sticky) no padrão de
// web app — marca à esquerda, busca global no centro, loja/mesa e os mesmos
// três destinos (Cardápio, Carrinho com contador, Conta) à direita. Sem ela,
// o acesso a Carrinho/Conta sumiria quando a barra inferior é ocultada. Só
// aparece a partir de `md`; a altura fixa (h-16) é a referência do `top-16` das
// categorias fixas da MenuPage.
interface DesktopNavProps extends BottomNavProps {
  tenant: Tenant;
  searchValue: string;
  onSearchChange: (value: string) => void;
  contextLabel?: string;
}

export function DesktopNav({
  slug,
  qrCodeToken,
  primaryColor = '#111827',
  tenant,
  searchValue,
  onSearchChange,
  contextLabel,
}: DesktopNavProps) {
  const nav = useNavModel(slug, qrCodeToken, primaryColor);

  return (
    <nav className="hidden md:block sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="mx-auto w-full max-w-7xl md:px-8 h-16 flex items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2.5 shrink-0 min-w-0 max-w-[14rem]">
          <LogoViewer tenant={tenant} size="w-9 h-9" />
          <span className="font-display text-sm font-bold text-gray-900 truncate">{tenant.name}</span>
        </div>

        <div className="flex-1 min-w-0 max-w-xl">
          <SearchBar value={searchValue} onChange={onSearchChange} />
        </div>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {contextLabel && (
            <span className="hidden lg:flex items-center gap-1.5 max-w-[10rem] mr-2 text-xs font-semibold text-gray-700">
              <MapPin size={15} strokeWidth={1.5} className="shrink-0 text-gray-400" />
              <span className="truncate">{contextLabel}</span>
            </span>
          )}
          <DesktopNavItem
            to={nav.menuHref}
            label={nav.t('nav.menu')}
            active={nav.menuActive}
            color={nav.accent}
            inactiveColor={nav.inactive}
            icon={<UtensilsCrossed size={18} color={nav.menuActive ? nav.accent : nav.inactive} />}
          />
          <DesktopNavItem
            to={nav.cartHref}
            label={nav.t('nav.cart')}
            active={nav.cartActive}
            color={nav.accent}
            inactiveColor={nav.inactive}
            icon={
              <span className="relative flex">
                <ShoppingCart size={18} color={nav.cartActive ? nav.accent : nav.inactive} />
                {nav.totalItems > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 text-[9px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {nav.totalItems}
                  </span>
                )}
              </span>
            }
          />
          <DesktopNavItem
            to={nav.accountHref}
            label={nav.t('nav.account')}
            active={nav.accountActive}
            color={nav.accent}
            inactiveColor={nav.inactive}
            icon={<AccountAvatar customer={nav.customer} active={nav.accountActive} accent={nav.accent} />}
          />
        </div>
      </div>
    </nav>
  );
}

interface DesktopNavItemProps {
  to: string;
  label: string;
  active: boolean;
  color: string;
  inactiveColor: string;
  icon: ReactNode;
}

function DesktopNavItem({ to, label, active, color, inactiveColor, icon }: DesktopNavItemProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3.5 py-2 rounded-2xl transition-colors hover:bg-gray-50"
      style={{ backgroundColor: active ? `${color}1a` : undefined }}
    >
      {icon}
      <span className="text-xs font-semibold" style={{ color: active ? color : inactiveColor }}>
        {label}
      </span>
    </Link>
  );
}
