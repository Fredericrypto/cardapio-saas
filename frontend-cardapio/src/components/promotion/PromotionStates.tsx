import { Ticket } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { withAlpha } from '../../lib/promotionPresentation';
import { MENU_BORDER, MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY } from '../../lib/menuTheme';
import { PROMO_LINK_BTN, PROMO_PRIMARY_BTN } from '../../lib/promotionTheme';
import { FoodBackdrop } from '../FoodBackdrop';
import { PromotionAmbient } from './PromotionAmbient';

// Promoção expirada, removida ou indisponível para a loja: o backend só
// devolve promoções ativas, então todos esses casos caem aqui. A tela mantém a
// identidade do restaurante e oferece um caminho (voltar ao cardápio).
export function PromotionUnavailable({
  primaryColor,
  accent,
  onBack,
  failed = false,
  onRetry,
}: {
  primaryColor: string;
  accent: string;
  onBack: () => void;
  // Falha de rede/servidor (não é promoção expirada): mostra "tentar de novo".
  failed?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const canRetry = failed && Boolean(onRetry);
  return (
    <div
      className={`relative isolate min-h-screen ${MENU_PAGE_BG} flex items-center justify-center px-4`}
      style={{ '--brand': primaryColor, '--accent': accent } as React.CSSProperties}
    >
      <FoodBackdrop />
      <div className="relative isolate z-10 w-full max-w-md">
        <PromotionAmbient color={primaryColor} />
        <div
          role={failed ? 'alert' : undefined}
          className={`relative flex w-full flex-col items-center gap-3 rounded-2xl md:rounded-3xl border bg-[#FFFFFF]/55 p-7 text-center backdrop-blur-xl dark:bg-[#131314]/55 ${MENU_BORDER}`}
        >
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{ backgroundColor: withAlpha(primaryColor, 0.12), color: accent }}
            aria-hidden="true"
          >
            <Ticket size={26} strokeWidth={1.5} />
          </span>
          <h1 className={`font-display text-xl font-bold ${MENU_TEXT}`}>
            {failed ? t('promotionDetailPage.loadErrorTitle') : t('promotionDetailPage.essa_promocao_nao_esta')}
          </h1>
          <p className={`text-sm ${MENU_TEXT_BODY}`}>
            {failed ? t('promotionDetailPage.loadErrorHint') : t('promotionDetailPage.confira_outras_ofertas')}
          </p>
          {canRetry ? (
            <>
              <button type="button" onClick={onRetry} className={`${PROMO_PRIMARY_BTN} mt-2`}>
                {t('promotionDetailPage.retry')}
              </button>
              <button type="button" onClick={onBack} className={`${PROMO_LINK_BTN} ${MENU_TEXT}`}>
                {t('promotionDetailPage.voltar_pro_cardapio')}
              </button>
            </>
          ) : (
            <button type="button" onClick={onBack} className={`${PROMO_PRIMARY_BTN} mt-2`}>
              {t('promotionDetailPage.voltar_pro_cardapio')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Carregamento: esqueleto com o mesmo desenho da página (sem animação para
// quem pede movimento reduzido).
export function PromotionSkeleton() {
  const bar = 'rounded-xl bg-black/[0.05] dark:bg-white/[0.08] motion-safe:animate-pulse';
  return (
    <div className={`relative isolate min-h-screen ${MENU_PAGE_BG}`} role="status" aria-busy="true">
      <FoodBackdrop />
      <div className="w-full max-w-[88rem] mx-auto px-4 md:px-8 py-4 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
          <div className={`${bar} aspect-[16/9] rounded-2xl md:rounded-3xl`} />
          <div className="pt-2 flex flex-col gap-4">
            <div className={`${bar} h-7 w-40 rounded-full`} />
            <div className={`${bar} h-9 w-3/4`} />
            <div className={`${bar} h-36 rounded-3xl`} />
            <div className={`${bar} h-20 rounded-2xl`} />
          </div>
        </div>
      </div>
    </div>
  );
}
