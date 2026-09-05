import { Bell, Receipt } from 'lucide-react';
import type { Tenant, Location, TableSession } from '../types';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { TableSessionTimer } from './TableSessionTimer';
import { QrScanButton } from './QrScanButton';

interface TableMenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  tableNumber?: string;
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
export function TableMenuHeader({
  tenant,
  location,
  tableNumber,
  onCallWaiter,
  onOpenAccount,
  isCallingWaiter,
  session,
  onExpiryTick,
}: TableMenuHeaderProps) {
  return (
    <div>
      <div
        className="relative h-32 w-full overflow-hidden"
        style={
          tenant.coverImageUrl
            ? undefined
            : { background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})` }
        }
      >
        {tenant.coverImageUrl && (
          <img src={tenant.coverImageUrl} alt={tenant.name} className="w-full h-full object-cover" />
        )}
      </div>

      <div className="relative -mt-6 rounded-t-3xl bg-white px-4 pt-3.5 pb-1 z-10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 -mt-10 rounded-2xl border-4 border-white shadow-md bg-white overflow-hidden shrink-0">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {tenant.name[0]?.toUpperCase()}
              </div>
            )}
          </div>

          <div className="w-full flex items-center justify-center gap-2 mt-1.5 px-1">
            <div className="flex-1 flex justify-end min-w-0">
              {session?.expiresAt && onExpiryTick && (
                <TableSessionTimer session={session} onExpiryTick={onExpiryTick} variant="inline" />
              )}
            </div>
            <h1 className="font-display text-lg font-bold leading-tight text-gray-900 shrink-0 truncate max-w-[60%]">
              {tenant.name}
            </h1>
            <div className="flex-1 flex justify-start min-w-0">
              <QrScanButton />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {tableNumber ? `Mesa ${tableNumber}` : 'Consumo no local'}
          </p>
        </div>

        {location?.closingInMinutes != null && (
          <p className="text-xs font-bold text-red-500 mt-2 text-center">
            Fecha em {location.closingInMinutes} min
          </p>
        )}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onCallWaiter}
            disabled={isCallingWaiter}
            className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            <Bell size={14} />
            {isCallingWaiter ? 'Chamando...' : 'Chamar garçom'}
          </button>
          <button
            onClick={onOpenAccount}
            className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-100"
          >
            <Receipt size={14} />
            Minha conta
          </button>
        </div>

        <RestaurantInfoPanel tenant={tenant} location={location} />
      </div>
    </div>
  );
}
