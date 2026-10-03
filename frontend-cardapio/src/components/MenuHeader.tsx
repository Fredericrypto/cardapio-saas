import { BannerViewer, LogoViewer } from './LogoViewer';
import { Bike, ChevronLeft } from 'lucide-react';
import type { Tenant, Location } from '../types';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { QrScanButton } from './QrScanButton';
import { ReviewBadge, OpenStatusRow } from './HeaderStatus';

interface MenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  onBack?: () => void;
}

// Header estilo delivery app de verdade (McDonald's/FoodyPro): banner
// grande no topo (foto de capa da loja), avatar/logo sobrepondo a foto,
// e um "sheet" branco flutuante logo abaixo com nome, status, e o
// cartão de infos de entrega — no lugar da faixa lisa de cor sólida que
// existia antes.
export function MenuHeader({ tenant, location, onBack }: MenuHeaderProps) {
  const deliveryAvailable = location?.latitude != null && location?.longitude != null;
  const isOpenNow = location?.isOpenNow ?? true;

  return (
    <div className={`transition-[filter] ${!isOpenNow ? 'grayscale' : ''}`}>
      {/* Banner / capa */}
      <div
        className="relative h-40 w-full overflow-hidden"
        style={
          tenant.coverImageUrl
            ? undefined
            : {
                background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})`,
              }
        }
      >
        <BannerViewer tenant={tenant} />

        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="absolute top-3.5 left-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
        )}
      </div>

      {/* Sheet branco flutuante */}
      <div className="relative -mt-6 rounded-t-3xl bg-white px-4 pt-3.5 pb-1 z-10">
        <div className="flex flex-col items-center text-center">
          <LogoViewer tenant={tenant} size="w-16 h-16" />

          {/* Nome do restaurante SEM truncar: quebra em quantas linhas
              precisar (text-balance deixa as linhas equilibradas) e
              `overflowWrap: anywhere` cobre até uma palavra gigante. O
              botão de QR fica preso no canto direito, centralizado na
              vertical; o padding lateral simétrico (px-11) reserva o
              espaço dele nos DOIS lados, então o nome continua
              perfeitamente centralizado e nunca passa por baixo do
              botão, seja 1 linha ou 4. */}
          <div className="relative w-full mt-1.5 px-11">
            <h1
              className="font-display text-lg font-bold leading-tight text-gray-900 text-center text-balance"
              style={{ overflowWrap: 'anywhere' }}
            >
              {tenant.name}
            </h1>
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <QrScanButton />
            </div>
          </div>
          {location && <p className="text-xs text-gray-400 mt-0.5">{location.name}</p>}
          <ReviewBadge tenant={tenant} location={location} />
        </div>

        <OpenStatusRow location={location} />

        {deliveryAvailable && location && (
          <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-100 px-3.5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <Bike size={15} />
              </span>
              <div>
                <p className="text-xs font-semibold text-gray-700">Aceita entrega</p>
                <p className="text-[11px] text-gray-400">
                  Taxa a partir de R$ {location.deliveryFee.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>
            {location.minOrderValue > 0 && (
              <div className="text-right shrink-0 pl-2">
                <p className="text-[11px] text-gray-400">Pedido mínimo</p>
                <p className="text-xs font-bold text-gray-700">
                  R$ {location.minOrderValue.toFixed(2).replace('.', ',')}
                </p>
              </div>
            )}
          </div>
        )}

        <RestaurantInfoPanel tenant={tenant} location={location} />
      </div>
    </div>
  );
}
