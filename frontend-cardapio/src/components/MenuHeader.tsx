import { useI18n } from '../i18n/I18nContext';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { BannerViewer, LogoViewer } from './LogoViewer';
import { Bike, ChevronLeft } from 'lucide-react';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import type { Tenant, Location } from '../types';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { QrScanButton } from './QrScanButton';
import { ReviewBadge, OpenStatusRow } from './HeaderStatus';
import { ThemeToggle } from './ThemeToggle';
import { Tooltip } from './Tooltip';
import { FadeRule, GlassFade } from './FadeRule';
import { UnitSelector } from './UnitSelector';
import {
  MENU_BORDER,
  MENU_HEADER_SHELL,
  MENU_TEXT,
  MENU_TEXT_MUTED,
  MENU_TEXT_SOFT,
} from '../lib/menuTheme';
import { PROMO_SERIF } from '../lib/promotionTheme';

interface MenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  // Voltar do header: OCULTO por ora (SHOW_BACK_BUTTON). Fica no codigo para a futura Home
  // multi-restaurantes (estilo iFood), onde ele volta para a lista de restaurantes.
  onBack?: () => void;
  // Unidades do restaurante; com mais de uma o header mostra o dropdown de troca.
  locations?: Location[] | null;
  onSelectLocation?: (location: Location) => void;
}

const SHOW_BACK_BUTTON = false;

// Header do cardápio.
//
// Celular: desenho vertical de sempre (banner + "sheet" que sobe sobre ele, centralizado).
//
// Desktop (md+): HERO editorial num único cartão arredondado. O banner (foto de capa) ocupa o
// cartão INTEIRO como fundo, escurecido da esquerda para a direita e para baixo; sobre ele ficam
// a logo, o nome serifado grande (com o botão de QR), nota, status/horário, a unidade (com um
// filete que se dissolve) e, à direita embaixo, o cartão de entrega/pedido mínimo em vidro.
// A faixa "Informações" fecha o cartão, também em vidro escuro. Como o texto fica sobre foto, o
// conteúdo do hero usa SEMPRE a variante escura dos tokens (classe `dark` só em md+), em ambos os
// temas — o restante da página segue o tema escolhido.
//
// Cliques: o sheet não captura ponteiro no desktop (a foto continua clicável pelo BannerViewer);
// só os blocos de conteúdo (logo, textos, entrega, informações) recebem ponteiro.
export function MenuHeader({ tenant, location, onBack, locations, onSelectLocation }: MenuHeaderProps) {
  const { t } = useI18n();
  const deliveryAvailable = location?.latitude != null && location?.longitude != null;
  const isOpenNow = useStoreStatus(location).isOpen;
  const wide = useMediaQuery('(min-width: 768px)');

  return (
    // Loja fechada: só banner, logo e o card de entrega ficam em tom atenuado.
    // Selo "Fechado" (vermelho), avaliações e Informações/redes sociais mantêm
    // as cores e continuam clicáveis.
    <div className={`${MENU_HEADER_SHELL} md:relative md:isolate md:overflow-hidden md:border-white/10`}>
      {/* Banner / capa: no desktop vira o fundo do cartão inteiro. */}
      <div
        className={`hdr-banner relative h-40 w-full overflow-hidden transition-[filter] md:absolute md:inset-0 md:h-full md:rounded-3xl ${!isOpenNow ? 'grayscale' : ''}`}
        style={
          tenant.coverImageUrl
            ? undefined
            : {
                background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.secondaryColor})`,
              }
        }
      >
        <BannerViewer tenant={tenant} />
        {/* Profundidade sutil sobre o banner (decorativa; não intercepta toque). */}
        <span aria-hidden="true" className="atm-banner-depth" />
        {/* Desktop: escurece a foto (esquerda e base) para o texto claro ficar legível. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{ backgroundImage: 'linear-gradient(90deg, rgba(8,8,9,0.82), rgba(8,8,9,0) 78%)' }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3/5 md:block"
          style={{ backgroundImage: 'linear-gradient(0deg, rgba(8,8,9,0.55), rgba(8,8,9,0))' }}
        />

        {/* Voltar (só existe quando há mais de uma unidade): círculo no celular; no desktop fica
            oculto (a troca de unidade é feita pelo seletor da unidade). */}
        {SHOW_BACK_BUTTON && onBack && (
          <Tooltip label={t('tooltip.back')} className="contents">
            <button
              onClick={onBack}
              aria-label={t('common.back')}
              className="absolute z-10 top-3.5 left-3.5 md:hidden h-9 w-9 rounded-full bg-white/90 text-[#374151] dark:bg-black/55 dark:text-white backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
            >
              <ChevronLeft size={20} strokeWidth={1.5} className="shrink-0" />
            </button>
          </Tooltip>
        )}

        {/* Alternador de tema (claro/escuro), mesmo posicionamento do header de mesa. */}
        <div className="absolute top-3.5 right-3.5 z-10">
          <ThemeToggle />
        </div>
      </div>

      {/* Sheet (celular) / camada de conteúdo do hero (desktop) */}
      <div
        className={`relative z-10 mt-0 rounded-3xl border ${MENU_BORDER} bg-transparent px-4 pb-3 pt-2 md:border-0 md:px-8 md:pb-0 md:pt-10 md:pointer-events-none ${wide ? 'dark' : ''}`}
      >
        <GlassFade className="rounded-3xl md:hidden" fadeRem={2} />
        <div className="md:flex md:items-end md:justify-between md:gap-8">
          <div className="flex flex-col items-center text-center md:min-w-0 md:flex-1 md:flex-row md:items-start md:gap-6 md:text-left">
            {/* Logo: no desktop, tile 80x80 no topo do bloco de texto, sem margem herdada do
                LogoViewer. No celular o desenho original (logo sobrepondo o banner) não muda. */}
            <div
              className={`shrink-0 transition-[filter] md:pointer-events-auto md:flex md:h-20 md:w-20 md:items-center md:justify-center md:self-start md:[&>*]:!m-0 md:[&>*]:!top-0 md:[&>*]:!translate-y-0 ${!isOpenNow ? 'grayscale' : ''}`}
            >
              <LogoViewer tenant={tenant} size={wide ? 'w-20 h-20' : 'w-16 h-16'} />
            </div>

            <div className="flex w-full flex-col items-center md:pointer-events-auto md:w-auto md:min-w-0 md:flex-1 md:items-start">
              {/* Nome do restaurante SEM truncar: quebra em quantas linhas precisar. Celular:
                  botão de QR preso no canto direito (padding lateral simétrico mantém o nome
                  centralizado). Desktop: nome serifado grande com o QR ao lado, em linha. */}
              <div className="relative mt-1.5 w-full px-11 md:mt-0 md:flex md:items-center md:gap-3 md:px-0">
                <h1
                  className={`font-display text-lg font-bold leading-tight text-balance text-center md:text-left md:text-[2.6rem] md:font-light md:leading-[1.05] ${MENU_TEXT}`}
                  style={wide ? { overflowWrap: 'anywhere', fontFamily: PROMO_SERIF } : { overflowWrap: 'anywhere' }}
                >
                  {tenant.name}
                </h1>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 md:static md:shrink-0 md:translate-y-0">
                  <Tooltip label={t('tooltip.qrScan')} className="contents">
                    <QrScanButton />
                  </Tooltip>
                </div>
              </div>
                            <ReviewBadge tenant={tenant} location={location} />
              <OpenStatusRow location={location} />
              {location && (
                <>
                  <FadeRule className="mt-3 w-72 max-w-full self-center md:self-start" />
                  <UnitSelector
                    current={location}
                    locations={locations ?? null}
                    onSelect={onSelectLocation}
                    primaryColor={tenant.primaryColor}
                    className="mt-3 self-center md:mt-4 md:self-start"
                  />
                </>
              )}
            </div>
          </div>

          {deliveryAvailable && location && (
            <div className="mt-3 md:mb-1 md:mt-0 md:w-[24rem] md:shrink-0 md:pointer-events-auto">
              <div
                className={`flex items-center justify-between gap-3 rounded-2xl border bg-transparent px-3.5 py-2.5 backdrop-blur-md md:bg-black/35 md:px-5 md:py-3.5 ${MENU_BORDER} ${!isOpenNow ? CLOSED_MUTED_CLASS : ''}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#374151] shadow-sm backdrop-blur-sm dark:bg-black/55 dark:text-white">
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
                  <div className="relative shrink-0 pl-3 text-center">
                    <FadeRule orientation="vertical" className="absolute inset-y-0 left-0" />
                    <p className={`text-[11px] ${MENU_TEXT_MUTED}`}>{t('menu.minimumOrder')}</p>
                    <p className={`text-xs font-bold ${MENU_TEXT_SOFT}`}>
                      R$ {location.minOrderValue.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: a faixa "Informações" fecha o hero em vidro escuro, de borda a borda. */}
        <div className="relative md:pointer-events-auto md:-mx-8 md:px-8 md:pb-4">
          <GlassFade className="hidden md:block" topRem={1} fadeRem={2} />
          <RestaurantInfoPanel tenant={tenant} location={location} />
        </div>
      </div>
    </div>
  );
}
