import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { getActiveMesaToken } from '../lib/seat';
import { MENU_PAGE_BG, MENU_BORDER, MENU_TEXT } from '../lib/menuTheme';
import { PROMO_SERIF, PROMO_INK } from '../lib/promotionTheme';
import type { Tenant } from '../types';
import { BottomNav, DesktopNav } from './BottomNav';
import { FoodBackdrop } from './FoodBackdrop';
import { Tooltip } from './Tooltip';

interface ProfileSubpageShellProps {
  tenant: Tenant;
  title: string;
  // Rota para onde o botão "voltar" leva.
  backTo: string;
  // Só o histórico de pedidos já tinha a barra inferior no celular.
  bottomNav?: boolean;
  children: ReactNode;
}

// Casca comum das subpáginas da conta: wallpaper (FoodBackdrop), barra de topo
// (sem a busca global), container largo e cabeçalho com voltar + título editorial.
// Só apresentação — nenhuma regra de autenticação ou de dados mora aqui.
export function ProfileSubpageShell({ tenant, title, backTo, bottomNav = false, children }: ProfileSubpageShellProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { token } = useCustomerAuth();
  const activeMesaToken = slug ? getActiveMesaToken(token, slug) ?? undefined : undefined;

  return (
    <div className={`relative isolate min-h-screen ${MENU_PAGE_BG} ${bottomNav ? 'pb-24 md:pb-0' : 'pb-10 md:pb-0'} print:bg-white`}>
      <FoodBackdrop />
      <div className="contents print:hidden">
        <DesktopNav
          slug={slug!}
          qrCodeToken={activeMesaToken}
          tenantId={tenant.id}
          primaryColor={tenant.primaryColor}
          tenant={tenant}
          showSearch={false}
          wide
        />
      </div>

      <div className="w-full max-w-[88rem] mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-6 md:mb-8 print:hidden">
          <Tooltip label={t('common.back')}>
            <button
              onClick={() => navigate(backTo)}
              aria-label={t('common.back')}
              className={`w-10 h-10 rounded-full border bg-transparent ${MENU_BORDER} ${MENU_TEXT} flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors`}
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
          </Tooltip>
          <h1 className={`text-3xl md:text-4xl font-light italic leading-tight ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>
            {title}
          </h1>
        </div>

        {children}
      </div>

      {bottomNav && (
        <div className="contents print:hidden">
          <BottomNav slug={slug!} qrCodeToken={activeMesaToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
        </div>
      )}
    </div>
  );
}
