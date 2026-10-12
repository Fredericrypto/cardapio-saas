import { useI18n } from '../i18n/I18nContext';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { BannerViewer, LogoViewer } from './LogoViewer';
import { Bike, ChevronLeft } from 'lucide-react';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
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
//
// Responsivo: no celular segue o desenho vertical (banner + sheet
// centralizado). A partir de `md` vira um header de loja HORIZONTAL e
// compacto: capa baixa com cantos arredondados e, logo abaixo, um cartão com
// logo + nome/nota/status à esquerda e o resumo de entrega à direita.
export function MenuHeader({ tenant, location, onBack }: MenuHeaderProps) {
  const { t } = useI18n();
  const deliveryAvailable = location?.latitude != null && location?.longitude != null;
  const isOpenNow = useStoreStatus(location).isOpen;

  return (
    // Loja fechada: só banner, logo e o card de entrega ficam em tom atenuado.
    // Selo "Fechado" (vermelho), avaliações e Informações/redes sociais mantêm
    // as cores e continuam clicáveis.
    <div>
      {/* Banner / capa */}
      <div
        className={`relative h-40 md:h-36 lg:h-44 w-full overflow-hidden md:rounded-3xl transition-[filter] ${!isOpenNow ? 'grayscale' : ''}`}
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
            aria-label={t('common.back')}
            className="absolute top-3.5 left-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <ChevronLeft size={20} strokeWidth={1.5} className="text-gray-700" />
          </button>
        )}
      </div>

      {/* Sheet branco flutuante (celular) / cartão da loja (desktop) */}
      <div className="relative -mt-6 md:mt-4 rounded-t-3xl md:rounded-3xl bg-white px-4 pt-3.5 pb-1 md:px-6 md:py-5 md:border md:border-gray-100 z-10">
        <div className="md:flex md:items-center md:gap-6">
          <div className="flex flex-col items-center text-center md:flex-row md:gap-5 md:text-left md:flex-1 md:min-w-0">
            <div className={`shrink-0 transition-[filter] ${!isOpenNow ? 'grayscale' : ''}`}>
              <LogoViewer tenant={tenant} size="w-16 h-16" />
            </div>

            <div className="flex flex-col items-center md:items-start w-full md:w-auto md:flex-1 md:min-w-0">
              {/* Nome do restaurante SEM truncar: quebra em quantas linhas
                  precisar (text-balance deixa as linhas equilibradas) e
                  `overflowWrap: anywhere` cobre até uma palavra gigante. No
                  celular o botão de QR fica preso no canto direito,
                  centralizado na vertical; o padding lateral simétrico
                  (px-11) reserva o espaço dele nos DOIS lados, então o nome
                  continua centralizado e nunca passa por baixo do botão. No
                  desktop o botão passa a ficar ao lado do nome (em linha). */}
              <div className="relative w-full mt-1.5 md:mt-0 px-11 md:px-0 md:flex md:items-center md:gap-3">
                <h1
                  className="font-display text-lg md:text-xl font-bold leading-tight text-gray-900 text-center md:text-left text-balance"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {tenant.name}
                </h1>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 md:static md:translate-y-0 md:shrink-0">
                  <QrScanButton />
                </div>
              </div>
              {location && <p className="text-xs text-gray-400 mt-0.5">{location.name}</p>}
              <ReviewBadge tenant={tenant} location={location} />
              <OpenStatusRow location={location} />
            </div>
          </div>

          {deliveryAvailable && location && (
            <div className={`mt-3 md:mt-0 md:w-80 md:shrink-0 rounded-2xl bg-gray-50 border border-gray-100 px-3.5 py-2.5 flex items-center justify-between ${!isOpenNow ? CLOSED_MUTED_CLASS : ''}`}>
              <div className="flex items-center gap-2">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  <Bike size={15} strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-gray-700">{t('menu.acceptsDelivery')}</p>
                  <p className="text-[11px] text-gray-400">
                    {t('menuHeader.taxa_a_partir_de')} {location.deliveryFee.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
              {location.minOrderValue > 0 && (
                <div className="text-right shrink-0 pl-2">
                  <p className="text-[11px] text-gray-400">{t('menu.minimumOrder')}</p>
                  <p className="text-xs font-bold text-gray-700">
                    R$ {location.minOrderValue.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <RestaurantInfoPanel tenant={tenant} location={location} />
      </div>
    </div>
  );
}
