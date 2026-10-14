import { Ticket } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { withAlpha } from '../../lib/promotionPresentation';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY } from '../../lib/menuTheme';
import { PROMO_CARD, PROMO_PRIMARY_BTN } from '../../lib/promotionTheme';
import { PromotionAmbient } from './PromotionAmbient';

// Promoção expirada, removida ou indisponível para a loja: o backend só
// devolve promoções ativas, então todos esses casos caem aqui. A tela mantém a
// identidade do restaurante e oferece um caminho (voltar ao cardápio).
export function PromotionUnavailable({
  primaryColor,
  accent,
  onBack,
}: {
  primaryColor: string;
  accent: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`relative min-h-screen ${MENU_PAGE_BG} flex items-center justify-center px-4`}
      style={{ '--brand': primaryColor, '--accent': accent } as React.CSSProperties}
    >
      <PromotionAmbient color={primaryColor} />
      <div className={`${PROMO_CARD} relative z-10 w-full max-w-md p-7 text-center flex flex-col items-center gap-3`}>
        <span
          className="grid h-14 w-14 place-items-center rounded-2xl"
          style={{ backgroundColor: withAlpha(primaryColor, 0.12), color: accent }}
          aria-hidden="true"
        >
          <Ticket size={26} strokeWidth={1.5} />
        </span>
        <h1 className={`font-display text-xl font-bold ${MENU_TEXT}`}>
          {t('promotionDetailPage.essa_promocao_nao_esta')}
        </h1>
        <p className={`text-sm ${MENU_TEXT_BODY}`}>{t('promotionDetailPage.confira_outras_ofertas')}</p>
        <button type="button" onClick={onBack} className={`${PROMO_PRIMARY_BTN} mt-2`}>
          {t('promotionDetailPage.voltar_pro_cardapio')}
        </button>
      </div>
    </div>
  );
}

// Carregamento: esqueleto com o mesmo desenho da página (sem animação para
// quem pede movimento reduzido).
export function PromotionSkeleton() {
  const bar = 'rounded-xl bg-[#F3F4F6] dark:bg-[#282A2C] motion-safe:animate-pulse';
  return (
    <div className={`min-h-screen ${MENU_PAGE_BG}`} role="status" aria-busy="true">
      <div className="w-full max-w-7xl mx-auto md:px-8 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <div className={`${bar} aspect-[16/10] lg:aspect-[4/3] md:rounded-3xl`} />
          <div className="p-4 md:p-0 pt-5 flex flex-col gap-4">
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
