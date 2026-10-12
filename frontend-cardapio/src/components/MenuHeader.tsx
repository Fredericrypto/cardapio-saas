import { useI18n } from '../i18n/I18nContext';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { BannerViewer, LogoViewer } from './LogoViewer';
import { Bike, ChevronDown, ChevronLeft, MapPin } from 'lucide-react';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import type { Tenant, Location } from '../types';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { QrScanButton } from './QrScanButton';
import { ReviewBadge, OpenStatusRow } from './HeaderStatus';
import {
  MENU_BANNER_BASE,
  MENU_BORDER,
  MENU_DIVIDER,
  MENU_HEADER_SHEET,
  MENU_HEADER_SHELL,
  MENU_SURFACE_SUBTLE,
  MENU_TEXT,
  MENU_TEXT_MUTED,
  MENU_TEXT_SOFT,
} from '../lib/menuTheme';

interface MenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  onBack?: () => void;
}

// Header estilo delivery app de verdade (McDonald's/FoodyPro): banner
// (foto de capa da loja) e, logo abaixo, nome, status e o cartão de infos de
// entrega.
//
// Celular: desenho vertical original (banner + "sheet" que sobe sobre ele,
// centralizado). Desktop (md+): UM ÚNICO cartão arredondado e com borda que
// encapsula tudo — banner baixo em cima e, embaixo, logo + nome/nota/status à
// esquerda e, à direita, o indicador de unidade e o cartão de entrega
// empilhados. Voltar vira um botão com rótulo sobre o banner.
//
// Todas as cores vêm de lib/menuTheme (par claro/escuro explícito): nenhuma
// superfície fica branca no tema escuro.
export function MenuHeader({ tenant, location, onBack }: MenuHeaderProps) {
  const { t } = useI18n();
  const deliveryAvailable = location?.latitude != null && location?.longitude != null;
  const isOpenNow = useStoreStatus(location).isOpen;

  return (
    // Loja fechada: só banner, logo e o card de entrega ficam em tom atenuado.
    // Selo "Fechado" (vermelho), avaliações e Informações/redes sociais mantêm
    // as cores e continuam clicáveis.
    <div className={MENU_HEADER_SHELL}>
      {/* Banner / capa */}
      <div
        className={`${MENU_BANNER_BASE} h-40 md:h-32 lg:h-36 transition-[filter] ${!isOpenNow ? 'grayscale' : ''}`}
        style={
          tenant.coverImageUrl
            ? undefined
            : {
                background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})`,
              }
        }
      >
        <BannerViewer tenant={tenant} />

        {/* Voltar (só existe quando há mais de uma unidade): círculo no
            celular; no desktop vira pílula com o rótulo. Sobre a foto, então
            no escuro usa vidro preto translúcido em vez de círculo branco. */}
        {onBack && (
          <button
            onClick={onBack}
            aria-label={t('common.back')}
            className="absolute z-10 top-3.5 left-3.5 md:top-4 md:left-4 h-9 w-9 md:w-auto md:px-3.5 md:gap-1.5 rounded-full bg-white/90 text-[#374151] dark:bg-black/55 dark:text-white backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform md:hover:bg-white dark:md:hover:bg-black/70"
          >
            <ChevronLeft size={20} strokeWidth={1.5} className="shrink-0" />
            <span className="hidden md:inline text-sm font-medium">{t('common.back')}</span>
          </button>
        )}
      </div>

      {/* Sheet (celular) / corpo do cartão da loja (desktop) */}
      <div className={MENU_HEADER_SHEET}>
        <div className="md:flex md:items-center md:gap-8">
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
                  className={`font-display text-lg md:text-2xl font-bold leading-tight text-center md:text-left text-balance ${MENU_TEXT}`}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {tenant.name}
                </h1>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 md:static md:translate-y-0 md:shrink-0">
                  <QrScanButton />
                </div>
              </div>
              {/* No celular o nome da unidade fica sob o nome do restaurante;
                  no desktop ele vira o indicador de unidade (ao lado). */}
              {location && <p className={`text-xs mt-0.5 md:hidden ${MENU_TEXT_MUTED}`}>{location.name}</p>}
              <ReviewBadge tenant={tenant} location={location} />
              <OpenStatusRow location={location} />
            </div>
          </div>

          {(location || deliveryAvailable) && (
            <div className={`${deliveryAvailable ? 'mt-3' : ''} md:mt-0 md:w-80 md:shrink-0 flex flex-col gap-2`}>
              {location && <UnitIndicator name={location.name} onChange={onBack} />}

              {deliveryAvailable && location && (
                <div
                  className={`rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 ${MENU_SURFACE_SUBTLE} ${MENU_BORDER} ${!isOpenNow ? CLOSED_MUTED_CLASS : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: tenant.primaryColor }}
                    >
                      <Bike size={15} strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${MENU_TEXT_SOFT}`}>{t('menu.acceptsDelivery')}</p>
                      <p className={`text-[11px] ${MENU_TEXT_MUTED}`}>
                        {t('menuHeader.taxa_a_partir_de')} {location.deliveryFee.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  </div>
                  {location.minOrderValue > 0 && (
                    <div className={`text-right shrink-0 pl-3 border-l ${MENU_DIVIDER}`}>
                      <p className={`text-[11px] ${MENU_TEXT_MUTED}`}>{t('menu.minimumOrder')}</p>
                      <p className={`text-xs font-bold ${MENU_TEXT_SOFT}`}>
                        R$ {location.minOrderValue.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  )}
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

// Indicador de unidade — só no desktop (no celular o nome da unidade já
// aparece sob o nome do restaurante). Com mais de uma unidade (`onChange`
// presente) vira um seletor: tocar leva à tela de escolha de loja, a mesma
// rota do botão Voltar. Com uma unidade só é um rótulo estático.
function UnitIndicator({ name, onChange }: { name: string; onChange?: () => void }) {
  const base = `hidden md:flex items-center gap-2 w-full rounded-xl border px-3 py-2 text-left ${MENU_SURFACE_SUBTLE} ${MENU_BORDER}`;
  const content = (
    <>
      <MapPin size={15} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
      <span className={`flex-1 min-w-0 truncate text-sm font-medium ${MENU_TEXT_SOFT}`} title={name}>
        {name}
      </span>
      {onChange && <ChevronDown size={15} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />}
    </>
  );

  if (!onChange) return <div className={base}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={name}
      className={`${base} transition-colors md:hover:brightness-95 dark:md:hover:brightness-110`}
    >
      {content}
    </button>
  );
}
