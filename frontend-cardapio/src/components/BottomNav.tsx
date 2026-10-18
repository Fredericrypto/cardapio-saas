import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { Link, useLocation } from 'react-router-dom';
import { UtensilsCrossed, ShoppingCart, User, MapPin } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTheme } from '../hooks/useTheme';
import type { Tenant } from '../types';
import { SearchBar } from './SearchBar';
import { Tooltip } from './Tooltip';
import { ThemeToggle } from './ThemeToggle';
import { VerifiedBadge } from './VerifiedBadge';

interface BottomNavProps {
  slug: string;
  qrCodeToken?: string;
  tenantId: string;
  primaryColor?: string;
  // Conteúdo fixo EMPILHADO ACIMA das abas, na mesma barra (o carrinho põe aqui o botão principal).
  topSlot?: ReactNode;
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
  // Rótulo da aba de conta: primeiro nome do cliente logado; sem login, o texto padrão.
  const accountLabel = customer?.name?.trim().split(/\s+/)[0] || t('nav.account');

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
  // A busca global só existe na PÁGINA PRINCIPAL do cardápio (a rota do
  // próprio `menuHref`, com ou sem barra final). Qualquer subpágina —
  // `/conta-cliente/*`, carrinho, avaliações, produto — fica sem a busca.
  const isMenuRoute = location.pathname.replace(/\/+$/, '') === menuHref;

  return {
    t,
    accent,
    inactive,
    customer,
    totalItems,
    menuHref,
    cartHref,
    accountHref,
    accountLabel,
    accountActive,
    isMenuRoute,
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
    <span className="relative inline-flex shrink-0">
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
      {/* Cliente verificado: selo no canto da foto (só `isVerified` decide). */}
      {customer?.isVerified && (
        <span className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-white dark:ring-[#1E1E20] inline-flex">
          <VerifiedBadge size={12} />
        </span>
      )}
    </span>
  );
}

// Navegação persistente do app do cliente — Cardápio / Carrinho / Conta,
// sempre visível, dentro de UM restaurante (cliente é por restaurante,
// não uma conta cruzando vários — por isso slug/tenantId são sempre
// obrigatórios aqui, nunca "último visitado").
//
// Barra flutuante inferior só no celular (`md:hidden`): em telas grandes ela
// fica redundante e é substituída pela `DesktopNav` no topo da página.
export function BottomNav({ slug, qrCodeToken, primaryColor = '#111827', topSlot }: BottomNavProps) {
  const nav = useNavModel(slug, qrCodeToken, primaryColor);

  return (
    <div className="fixed bottom-0 inset-x-0 w-full bg-[#FFFFFF]/80 dark:bg-[#131314]/80 backdrop-blur-md rounded-t-3xl border border-b-0 border-[#F3F4F6] dark:border-white/10 z-40 md:hidden">
      {topSlot}
      <div className="flex">
      <NavItem
        to={nav.menuHref}
        icon={UtensilsCrossed}
        label={nav.t('nav.menu')}
        tooltip={nav.t('nav.menu')}
        active={nav.menuActive}
        color={nav.accent}
        inactiveColor={nav.inactive}
      />
      <NavItem
        to={nav.cartHref}
        icon={ShoppingCart}
        label={nav.t('nav.cart')}
        tooltip={nav.t('tooltip.cart')}
        active={nav.cartActive}
        color={nav.accent}
        inactiveColor={nav.inactive}
        badgeColor={primaryColor}
        badge={nav.totalItems > 0 ? nav.totalItems : undefined}
      />
      <Tooltip label={nav.t('tooltip.profile')} className="flex flex-1">
        <Link to={nav.accountHref} className="flex-1 flex">
          <div className="flex flex-col items-center gap-1 py-2.5 flex-1 relative">
            <div
              className="relative w-9 h-9 rounded-2xl flex items-center justify-center transition-colors"
              style={{ backgroundColor: nav.accountActive ? `${nav.accent}1a` : 'transparent' }}
            >
              <AccountAvatar customer={nav.customer} active={nav.accountActive} accent={nav.accent} />
            </div>
            <span
              className="text-[10px] font-semibold max-w-[5.5rem] truncate"
              style={{ color: nav.accountActive ? nav.accent : nav.inactive }}
            >
              {nav.accountLabel}
            </span>
          </div>
        </Link>
      </Tooltip>
      </div>
    </div>
  );
}

interface NavItemProps {
  to: string;
  icon: typeof User;
  label: string;
  // Texto do balão (hover no desktop). O `label` visível fica abaixo do ícone.
  tooltip: string;
  active: boolean;
  color: string;
  inactiveColor: string;
  badgeColor?: string;
  badge?: number;
}

function NavItem({ to, icon: Icon, label, tooltip, active, color, inactiveColor, badgeColor, badge }: NavItemProps) {
  return (
    <Tooltip label={tooltip} className="flex flex-1">
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
    </Tooltip>
  );
}

// Equivalente desktop da BottomNav: barra de topo fixa (sticky) no padrão de
// web app — marca à esquerda, busca global no centro, loja/mesa e os mesmos
// três destinos (Cardápio, Carrinho com contador, Conta) à direita. A busca
// só é desenhada na página principal do cardápio (ver `showSearch`). Sem ela,
// o acesso a Carrinho/Conta sumiria quando a barra inferior é ocultada. Só
// aparece a partir de `md`; a altura fixa (h-16) é a referência do `top-16` das
// categorias fixas da MenuPage.
interface DesktopNavProps extends BottomNavProps {
  tenant: Tenant;
  // Opcionais: só a MenuPage precisa passar. Subpáginas podem omitir.
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  contextLabel?: string;
  // Força mostrar/ocultar a busca. Sem isso vale a regra por rota: aparece
  // só na página principal do cardápio e só se `onSearchChange` existir.
  showSearch?: boolean;
  // Borda inferior recuada das laterais, com esmaecimento nas pontas.
  insetBorder?: boolean;
}

export function DesktopNav({
  slug,
  qrCodeToken,
  primaryColor = '#111827',
  tenant,
  searchValue = '',
  onSearchChange,
  contextLabel,
  showSearch,
  insetBorder = false,
}: DesktopNavProps) {
  const nav = useNavModel(slug, qrCodeToken, primaryColor);
  const searchVisible = (showSearch ?? nav.isMenuRoute) && Boolean(onSearchChange);

  return (
    <nav className={`hidden md:block sticky top-0 z-40 bg-transparent backdrop-blur-md ${insetBorder ? '' : 'border-b border-[#F3F4F6] dark:border-white/10'}`}>
      {insetBorder && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 bottom-0 h-px text-black/15 dark:text-white/15"
          style={{ background: 'linear-gradient(90deg, transparent, currentColor 18%, currentColor 82%, transparent)' }}
        />
      )}
      <div className="mx-auto w-full max-w-7xl md:px-8 h-16 flex items-center gap-4 lg:gap-6">
        {/* Marca (logo + nome) = botão "início do cardápio": leva à rota-base do
            restaurante (com a mesa, se houver). Tooltip no hover e no foco do
            teclado. A logo aqui é só imagem; a do BANNER (LogoViewer) continua
            expandindo a foto, sem relação com este botão. */}
        <Tooltip label={nav.t('nav.goHome')} className="inline-flex shrink-0 min-w-0 max-w-[14rem] self-center">
          <Link
            to={nav.menuHref}
            aria-label={nav.t('nav.goHome')}
            className="flex items-center gap-2.5 min-w-0 rounded-2xl px-2 py-1.5 -mx-2 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
          >
            <NavBrandLogo tenant={tenant} />
            <span className="font-display text-sm font-bold text-gray-900 truncate">{tenant.name}</span>
          </Link>
        </Tooltip>

        {searchVisible && onSearchChange && (
          <div className="flex-1 min-w-0 max-w-xl">
            <SearchBar value={searchValue} onChange={onSearchChange} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {contextLabel && (
            <span className="hidden lg:flex items-center gap-1.5 max-w-[10rem] mr-2 text-xs font-semibold text-gray-700">
              <MapPin size={15} strokeWidth={1.5} className="shrink-0 text-gray-400" />
              <span className="truncate">{contextLabel}</span>
            </span>
          )}
          {/* Alternar tema em toda subpágina; na página principal do cardápio
              o botão fica no banner (MenuHeader), então aqui não repete. */}
          {!nav.isMenuRoute && (
            <div className="flex items-center mr-1">
              <ThemeToggle />
            </div>
          )}
          <DesktopNavItem
            to={nav.menuHref}
            label={nav.t('nav.menu')}
            tooltip={nav.t('nav.menu')}
            active={nav.menuActive}
            color={nav.accent}
            inactiveColor={nav.inactive}
            icon={<UtensilsCrossed size={18} color={nav.menuActive ? nav.accent : nav.inactive} />}
          />
          <DesktopNavItem
            to={nav.cartHref}
            label={nav.t('nav.cart')}
            tooltip={nav.t('tooltip.cart')}
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
            label={nav.accountLabel}
            tooltip={nav.t('tooltip.profile')}
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

// Logo da navbar: só a imagem (ou a inicial sobre a cor da marca). Não abre o
// lightbox — quem faz isso é o LogoViewer do banner do cardápio.
function NavBrandLogo({ tenant }: { tenant: Tenant }) {
  return (
    <span className="w-9 h-9 shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-white border border-gray-100">
      {tenant.logoUrl ? (
        <img src={tenant.logoUrl} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span
          className="w-full h-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          {tenant.name[0]?.toUpperCase()}
        </span>
      )}
    </span>
  );
}

interface DesktopNavItemProps {
  to: string;
  label: string;
  tooltip: string;
  active: boolean;
  color: string;
  inactiveColor: string;
  icon: ReactNode;
}

function DesktopNavItem({ to, label, tooltip, active, color, inactiveColor, icon }: DesktopNavItemProps) {
  return (
    <Tooltip label={tooltip}>
      <Link
        to={to}
        className="flex items-center gap-2 px-3.5 py-2 rounded-2xl transition-colors hover:bg-gray-50"
        style={{ backgroundColor: active ? `${color}1a` : undefined }}
      >
        {icon}
        <span className="text-xs font-semibold max-w-[8rem] truncate" style={{ color: active ? color : inactiveColor }}>
          {label}
        </span>
      </Link>
    </Tooltip>
  );
}
