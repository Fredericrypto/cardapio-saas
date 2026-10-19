import { useI18n } from '../i18n/I18nContext';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { BannerViewer, LogoViewer } from './LogoViewer';
import { Bike, ChevronDown, ChevronLeft, MapPin } from 'lucide-react';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import type { Tenant, Location } from '../types';
import { RestaurantInfoPanel } from './RestaurantInfoPanel';
import { QrScanButton } from './QrScanButton';
import { ReviewBadge, OpenStatusRow } from './HeaderStatus';
import { ThemeToggle } from './ThemeToggle';
import { Tooltip } from './Tooltip';
import {
  MENU_BORDER,
  MENU_DIVIDER,
  MENU_HEADER_SHELL,
  MENU_TEXT,
  MENU_TEXT_MUTED,
  MENU_TEXT_SOFT,
} from '../lib/menuTheme';
import { PROMO_SERIF } from '../lib/promotionTheme';

interface MenuHeaderProps {
  tenant: Tenant;
  location: Location | null;
  onBack?: () => void;
}

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
export function MenuHeader({ tenant, location, onBack }: MenuHeaderProps) {
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
          style={{
            background:
              'linear-gradient(90deg, rgba(8,8,9,.88) 0%, rgba(8,8,9,.6) 38%, rgba(8,8,9,.1) 72%), linear-gradient(0deg, rgba(8,8,9,.85) 0%, transparent 40%)',
          }}
        />

        {/* Voltar (só existe quando há mais de uma unidade): círculo no celular; no desktop fica
            oculto (a troca de unidade é feita pelo seletor da unidade). */}
        {onBack && (
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
        className={`relative z-10 mt-0 rounded-3xl border ${MENU_BORDER} bg-transparent px-4 pb-3 pt-2 backdrop-blur-md md:border-0 md:px-8 md:pb-0 md:pt-10 md:backdrop-blur-none md:pointer-events-none ${wide ? 'dark' : ''}`}
      >
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
              {/* No celular o nome da unidade fica sob o nome do restaurante; no desktop ele vira o
                  seletor de unidade, abaixo do status. */}
              {location && <p className={`mt-0.5 text-xs md:hidden ${MENU_TEXT_MUTED}`}>{location.name}</p>}
              <ReviewBadge tenant={tenant} location={location} />
              <OpenStatusRow location={location} />
              {location && (
                <>
                  <span
                    aria-hidden="true"
                    className="mt-3 hidden h-px w-72 max-w-full bg-gradient-to-r from-white/25 to-transparent md:block"
                  />
                  <UnitIndicator name={location.name} onChange={onBack} />
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
                  <div className={`shrink-0 border-l pl-3 text-center ${MENU_DIVIDER}`}>
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
        <div className="md:pointer-events-auto md:-mx-8 md:mt-5 md:bg-black/45 md:px-8 md:pb-4 md:backdrop-blur-md">
          <RestaurantInfoPanel tenant={tenant} location={location} />
        </div>
      </div>
    </div>
  );
}

// Seletor de unidade — só no desktop (no celular o nome da unidade já aparece sob o nome do
// restaurante). Com mais de uma unidade (`onChange` presente) vira um botão: tocar leva à tela de
// escolha de loja, a mesma rota do botão Voltar. Com uma unidade só é um rótulo estático.
function UnitIndicator({ name, onChange }: { name: string; onChange?: () => void }) {
  const { t } = useI18n();
  const base = 'hidden md:flex items-center gap-2 w-fit max-w-full rounded-lg py-1.5 text-left';
  const content = (
    <>
      <MapPin size={15} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
      <span data-truncate className={`min-w-0 flex-1 truncate text-sm font-medium ${MENU_TEXT_SOFT}`}>
        {name}
      </span>
      {onChange && <ChevronDown size={15} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />}
    </>
  );

  // Uma unidade só: rótulo estático; o balão (nome completo) só aparece se o nome estiver cortado.
  // Várias unidades: botão que troca de unidade — o balão sempre aparece ("Trocar de unidade: <nome>").
  if (!onChange) {
    return (
      <Tooltip label={name} onlyIfTruncated className="hidden md:flex w-fit max-w-full">
        <div className={base}>{content}</div>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={`${t('tooltip.changeUnit')}: ${name}`} className="hidden md:flex w-fit max-w-full">
      <button
        type="button"
        onClick={onChange}
        aria-label={name}
        className={`${base} -ml-1 px-1 transition-colors md:hover:bg-white/[0.06]`}
      >
        {content}
      </button>
    </Tooltip>
  );
}
