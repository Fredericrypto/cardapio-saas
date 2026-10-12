import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { getActiveMesaToken } from '../lib/seat';
import { MENU_PAGE_BG, MENU_SURFACE, MENU_BORDER, MENU_TEXT } from '../lib/menuTheme';
import { PAGE_CONTAINER } from '../lib/profileTheme';
import type { Tenant } from '../types';
import { BottomNav, DesktopNav } from './BottomNav';
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

// Casca comum das subpáginas da conta: barra de topo (DesktopNav, só md+),
// container largo (max-w-7xl) e cabeçalho com botão voltar + título. Só
// apresentação — nenhuma regra de autenticação ou de dados mora aqui.
export function ProfileSubpageShell({ tenant, title, backTo, bottomNav = false, children }: ProfileSubpageShellProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { token } = useCustomerAuth();
  // A DesktopNav exige os props da busca global; aqui não há lista a filtrar.
  const [navSearch, setNavSearch] = useState('');
  // Mesma correção do CustomerProfilePage: preserva a mesa ativa nos links.
  const activeMesaToken = slug ? getActiveMesaToken(token, slug) ?? undefined : undefined;

  return (
    <div className={`min-h-screen ${MENU_PAGE_BG} ${bottomNav ? 'pb-24 md:pb-0' : 'pb-10 md:pb-0'} print:bg-white`}>
      {/* `contents` não gera caixa (o sticky da barra continua valendo);
          na impressão (cupons) o wrapper some e leva a barra junto. */}
      <div className="contents print:hidden">
        <DesktopNav
          slug={slug!}
          qrCodeToken={activeMesaToken}
          tenantId={tenant.id}
          primaryColor={tenant.primaryColor}
          tenant={tenant}
          searchValue={navSearch}
          onSearchChange={setNavSearch}
        />
      </div>

      <div className={PAGE_CONTAINER}>
        <div className="flex items-center gap-3 mb-5 md:mb-6 print:hidden">
          <Tooltip label={t('common.back')}>
            <button
              onClick={() => navigate(backTo)}
              aria-label={t('common.back')}
              className={`w-10 h-10 rounded-full ${MENU_SURFACE} border ${MENU_BORDER} ${MENU_TEXT} flex items-center justify-center hover:bg-black/[0.03] dark:hover:bg-white/5 transition-colors`}
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
          </Tooltip>
          <h1 className={`font-display font-bold text-lg md:text-2xl ${MENU_TEXT}`}>{title}</h1>
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
