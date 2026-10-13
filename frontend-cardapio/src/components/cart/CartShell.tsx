import type { ReactNode } from 'react';
import { MENU_DIVIDER, MENU_PAGE_BG } from '../../lib/menuTheme';
import { CART_CONTAINER, CART_TEXT } from '../../lib/cartTheme';
import type { Tenant } from '../../types';
import { BottomNav, DesktopNav } from '../BottomNav';

interface CartShellProps {
  tenant: Tenant;
  slug: string;
  qrCodeToken?: string;
  /** Nome da loja/mesa mostrado na barra do desktop (igual ao Menu). */
  contextLabel?: string;
  /**
   * Botão principal fixo (Ir para pagamento / Revisar / Confirmar). Celular:
   * entra NA BottomNav, empilhado acima das abas (nunca sobrepõe). Tablet
   * (md até lg, sem BottomNav): barra fixa própria, com safe-area. Desktop
   * (lg+): não aparece aqui — vive no painel lateral.
   */
  actionBar?: ReactNode;
  children: ReactNode;
}

// Casca de TODAS as telas do carrinho (itens, vazio, sucesso, Pix...): a MESMA
// navbar do Menu (DesktopNav no desktop, BottomNav no celular, com as mesmas
// props que o MenuPage passa) e o MESMO container (max-w-7xl mx-auto px-4
// md:px-8). A busca da navbar não existe aqui: não há cardápio para filtrar e
// buscar no carrinho confundiria — a DesktopNav omite o campo e a aba
// "Carrinho" fica ativa com o contador de itens.
export function CartShell({ tenant, slug, qrCodeToken, contextLabel, actionBar, children }: CartShellProps) {
  // Espaço no fim para o conteúdo nunca ficar escondido atrás das barras
  // fixas: celular = BottomNav (~5rem) + botão (~5rem); tablet = só o botão.
  const bottomPadding = actionBar ? 'pb-48 md:pb-40 lg:pb-12' : 'pb-28 md:pb-12';

  return (
    <div className={`min-h-screen ${MENU_PAGE_BG} ${CART_TEXT} relative`}>
      <DesktopNav
        slug={slug}
        qrCodeToken={qrCodeToken}
        tenantId={tenant.id}
        primaryColor={tenant.primaryColor}
        tenant={tenant}
        contextLabel={contextLabel}
      />

      {/* overflow-x-clip (não `hidden`): o cartão ilustrativo pode passar um
          pouco da borda do painel no desktop sem gerar rolagem horizontal, e
          o painel `sticky` continua funcionando. */}
      <main className={`${CART_CONTAINER} pt-4 md:pt-8 overflow-x-clip ${bottomPadding}`}>{children}</main>

      {actionBar && (
        <div
          className={`hidden md:block lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t px-8 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-[#FFFFFF] dark:bg-[#131314] ${MENU_DIVIDER}`}
        >
          <div className="max-w-3xl mx-auto">{actionBar}</div>
        </div>
      )}

      <BottomNav
        slug={slug}
        qrCodeToken={qrCodeToken}
        tenantId={tenant.id}
        primaryColor={tenant.primaryColor}
        topSlot={actionBar ? <div className={`p-3 border-b ${MENU_DIVIDER}`}>{actionBar}</div> : undefined}
      />
    </div>
  );
}
