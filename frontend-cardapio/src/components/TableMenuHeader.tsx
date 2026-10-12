import { useI18n } from '../i18n/I18nContext';
import { BannerViewer, LogoViewer } from './LogoViewer';
import { Bell, Receipt } from 'lucide-react';
import type { Tenant, Location, TableSession } from '../types';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { TableSessionTimer } from './TableSessionTimer';
import { ReviewBadge, OpenStatusRow } from './HeaderStatus';
import { ACTION_BUTTON_BASE } from '../lib/uiClasses';
import { ThemeToggle } from './ThemeToggle';

interface TableMenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  tableNumber?: string;
  tableKind?: 'mesa' | 'balcao';
  onCallWaiter: () => void;
  onOpenAccount: () => void;
  isCallingWaiter: boolean;
  session?: TableSession | null;
  onExpiryTick?: () => void;
}

// Mesmo esqueleto visual do MenuHeader (banner + sheet branco flutuante)
// pra ficar consistente com o fluxo geral — só troca o conteúdo do
// sheet pelas ações específicas de mesa (chamar garçom / minha conta)
// no lugar do card de entrega.
//
// Responsivo: igual ao MenuHeader — banner mais alto com cantos
// arredondados a partir de `md`, conteúdo do sheet numa coluna centralizada
// (`md:max-w-3xl`) e os botões de ação com largura contida (`md:max-w-md`)
// em vez de esticados pelo monitor inteiro.
export function TableMenuHeader({
  tenant,
  location,
  tableNumber,
  tableKind,
  onCallWaiter,
  onOpenAccount,
  isCallingWaiter,
  session,
  onExpiryTick,
}: TableMenuHeaderProps) {
  const { t } = useI18n();
  return (
    <div>
      <div
        className="relative h-32 md:h-36 lg:h-44 w-full overflow-hidden md:rounded-3xl"
        style={
          tenant.coverImageUrl
            ? undefined
            : { background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})` }
        }
      >
        <BannerViewer tenant={tenant} />

        <div className="absolute top-3.5 right-3.5 z-10">
          <ThemeToggle variant="floating" />
        </div>
      </div>

      <div className="relative -mt-6 md:mt-4 rounded-t-3xl md:rounded-3xl bg-white px-4 pt-3.5 pb-1 md:px-6 md:py-5 md:border md:border-gray-100 z-10">
        <div className="md:flex md:items-center md:gap-6">
          <div className="flex flex-col items-center text-center md:flex-row md:gap-5 md:text-left md:flex-1 md:min-w-0">
            <div className="shrink-0">
              <LogoViewer tenant={tenant} size="w-16 h-16" />
            </div>
            <div className="flex flex-col items-center md:items-start w-full md:w-auto md:flex-1 md:min-w-0">
              {/* Nome sem truncar (quebra em várias linhas se preciso, sempre
                  centralizado — padding simétrico px-14 reserva o espaço do
                  timer da mesa, que fica preso no canto esquerdo). */}
              <div className="relative w-full mt-1.5 md:mt-0 px-14 md:px-0 md:flex md:items-center md:gap-3">
                <h1
                  className="font-display text-lg md:text-xl font-bold leading-tight text-gray-900 text-center md:text-left text-balance"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {tenant.name}
                </h1>
                {session?.expiresAt && onExpiryTick && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 md:static md:translate-y-0 md:shrink-0">
                    <TableSessionTimer session={session} onExpiryTick={onExpiryTick} variant="inline" />
                  </div>
                )}
                {/* Pedido do Felipe (13/09): o ícone de escanear QR não
                      deve aparecer aqui — dentro do fluxo de mesa já existe
                      uma sessão ativa, então usar o scanner pra "entrar"
                      numa mesa diferente por cima da atual só cria confusão
                      (a conta antiga continua aberta no painel do admin sem
                      jeito do cliente fechar pelo celular). O ícone só faz
                      sentido quando NÃO há sessão de mesa ativa — nesse caso
                      o cardápio genérico (MenuHeader) já mostra o dele. Div
                      vazia só pra manter o título centralizado no layout. */}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {/* O admin já pode nomear a mesa como "Mesa 1" ou "Balcão 1"
                    (campo livre) — prefixar de novo aqui sempre virava "Mesa
                    Mesa 1"/"Mesa Balcão 1". Com `kind` disponível, decide o
                    prefixo certo direto por ele em vez de adivinhar pelo
                    texto; sem `kind` (sessões antigas), cai no teste de texto
                    de antes como fallback. */}
                {tableNumber
                  ? tableKind === 'balcao'
                    ? /^balc/i.test(tableNumber.trim())
                      ? tableNumber
                      : t('tableMenuHeader.balcao_tablenumber', { tableNumber: tableNumber })
                    : /^mesa\b/i.test(tableNumber.trim())
                      ? tableNumber
                      : t('tableMenuHeader.mesa_tablenumber', { tableNumber: tableNumber })
                  : t('tableMenuHeader.consumo_no_local')}
              </p>
              <ReviewBadge tenant={tenant} location={location} />
              {/* Horário de funcionamento + selo Aberto/Fechado (e "Fecha em X
                  min") continuam visíveis dentro do fluxo de mesa. */}
              <OpenStatusRow location={location} />
            </div>
          </div>

          <div className="flex gap-2 mt-3 md:mt-0 md:w-80 md:shrink-0">
            <button
              onClick={onCallWaiter}
              disabled={isCallingWaiter}
              className={`flex-1 text-white ${ACTION_BUTTON_BASE}`}
              style={{ backgroundColor: tenant.primaryColor }}
            >
              <Bell size={14} strokeWidth={1.5} />
              {isCallingWaiter ? 'Chamando...' : t('tableMenuHeader.chamar_garcom')}
            </button>
            <button
              onClick={onOpenAccount}
              className={`flex-1 text-gray-700 bg-gray-50 border border-gray-100 ${ACTION_BUTTON_BASE}`}
            >
              <Receipt size={14} strokeWidth={1.5} />
              {t('tableMenuHeader.minha_conta')}
            </button>
          </div>
        </div>

        <RestaurantInfoPanel tenant={tenant} location={location} />
      </div>
    </div>
  );
}
