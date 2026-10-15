import { Outlet, matchPath, useLocation, useParams } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { BottomNav, DesktopNav } from './BottomNav';

// Layout das rotas `/:slug/*` que NÃO montam a própria navbar (promoção,
// exploração, produto, avaliações, escolher loja, entrar, conta da mesa):
// põe a MESMA barra do cardápio — DesktopNav no topo (md+) e BottomNav no
// celular — com as mesmas props que o MenuPage passa. Sem busca: ela só existe
// na página principal do cardápio. Só apresentação: nenhuma regra de
// autenticação ou de dados mora aqui (as rotas filhas continuam com os seus
// RequireCustomerAuth/TableSessionGate).
//
// - `--bottom-nav-h` (5rem no celular, 0 de md em diante) é a altura da
//   BottomNav; barras fixas de página usam `bottom-[var(--bottom-nav-h,0px)]`
//   para ficar ACIMA dela, e o wrapper reserva esse espaço no fim da página.
// - Em md+ a navbar (h-16) ocupa o topo; como a página já tem `min-h-screen`, a
//   raiz da página (2º filho) passa a `min-h-[calc(100dvh-4rem)]`, senão
//   surgiria uma rolagem de 4rem em páginas curtas.
export function NavLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { pathname } = useLocation();
  const { tenant } = useTenant();
  // Fluxo de mesa: o token vem da URL (`/:slug/mesa/:qrCodeToken/...`).
  const qrCodeToken = matchPath({ path: '/:slug/mesa/:qrCodeToken/*' }, pathname)?.params.qrCodeToken;

  // Tenant ainda carregando/inexistente: a página filha cuida do estado.
  if (!tenant || !slug) return <Outlet />;

  return (
    <div className="[--bottom-nav-h:5rem] md:[--bottom-nav-h:0px] pb-[var(--bottom-nav-h)] md:[&>*:nth-child(2)]:min-h-[calc(100dvh_-_4rem)]">
      <div className="contents print:hidden">
        <DesktopNav
          slug={slug}
          qrCodeToken={qrCodeToken}
          tenantId={tenant.id}
          primaryColor={tenant.primaryColor}
          tenant={tenant}
          showSearch={false}
        />
      </div>
      <Outlet />
      <div className="contents print:hidden">
        <BottomNav slug={slug} qrCodeToken={qrCodeToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
      </div>
    </div>
  );
}
