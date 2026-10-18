import { useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { localizedField } from '../../i18n/contentText';
import { ImageLightbox } from '../ImageLightbox';
import { Tooltip } from '../Tooltip';
import { getHeroNumberScale, getPromotionHeroValue } from '../../lib/promotionPresentation';
import { PROMO_EYEBROW, PROMO_SERIF } from '../../lib/promotionTheme';
import type { Promotion } from '../../types';

// Imagem grande da promoção com o desconto escrito direto sobre ela (canto
// superior esquerdo). O texto é SEMPRE claro (a foto é o fundo, nos dois temas);
// um degradê lateral discreto garante o contraste. Só exibe valores que a
// promoção já tem; não calcula nada. Clique na foto = ampliar (ImageLightbox).
const SCRIM = 'linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.4) 45%, rgba(0,0,0,0) 80%)';
const GOLD = 'linear-gradient(180deg, #F6E8C6 0%, #D8B877 55%, #9A783B 100%)';

export function PromotionHero({
  promotion,
  ariaLabel,
  primaryColor,
  muted = false,
  topBar,
}: {
  promotion: Promotion;
  ariaLabel: string;
  primaryColor: string;
  muted?: boolean;
  /** Acima da imagem (voltar / compartilhar). */
  topBar?: ReactNode;
}) {
  const { t } = useI18n();
  const [zoomOpen, setZoomOpen] = useState(false);
  const hero = getPromotionHeroValue(promotion);
  const title = localizedField(promotion, 'title');
  const subtitle =
    promotion.scope === 'all'
      ? t('promotionDetailPage.em_todo_o_cardapio')
      : t('promotionDetailPage.nos_itens_selecionados');
  const numberSize = {
    short: 'text-7xl sm:text-8xl lg:text-[8.5rem]',
    medium: 'text-6xl sm:text-7xl lg:text-8xl',
    long: 'text-5xl sm:text-6xl lg:text-7xl',
    xlong: 'text-4xl sm:text-5xl lg:text-6xl',
  }[getHeroNumberScale(hero.text)];

  return (
    <div>
      {topBar && <div className="mb-3 flex items-center justify-between gap-2">{topBar}</div>}
      <div className="loc-card [--glow:var(--accent)] relative isolate aspect-[4/3] overflow-hidden rounded-3xl bg-[#1E1E20] ring-1 ring-black/10 dark:ring-white/10 sm:aspect-[16/11] lg:aspect-[16/10]">
        {promotion.imageUrl ? (
          <Tooltip label={t('promotionMode.zoomPhoto')} className="contents">
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label={`${t('promotionMode.zoomPhoto')}: ${title}`}
              className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
            >
              <img
                src={promotion.imageUrl}
                alt=""
                draggable={false}
                className={`h-full w-full object-cover ${muted ? 'grayscale' : ''}`}
              />
            </button>
          </Tooltip>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}99)` }}
          />
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: SCRIM }} />

        <div
          role="group"
          aria-label={ariaLabel}
          className={`pointer-events-none absolute left-5 top-6 w-max max-w-[88%] text-[#F1EBDD] sm:left-9 sm:top-10 lg:left-10 lg:top-14 ${muted ? 'opacity-70' : ''}`}
        >
          <p className={`flex items-center gap-3 ${PROMO_EYEBROW} text-[#F1EBDD]/80`}>
            <span aria-hidden="true" className="h-px w-5 bg-current" />
            {t('promotionDetailPage.specialPromo')}
          </p>
          <div className="mt-3 flex items-end gap-2 sm:gap-3" style={{ fontFamily: PROMO_SERIF }}>
            <span
              className={`font-medium leading-[0.85] tabular-nums ${numberSize}`}
              style={{
                backgroundImage: GOLD,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {hero.text}
            </span>
            <span className="mb-1 text-2xl tracking-wide sm:mb-3 sm:text-4xl">{t('promotionDetailPage.off')}</span>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-[#F1EBDD]/25 pt-3 text-sm sm:text-base">
            <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
            <span className="text-[#F1EBDD]/90">{subtitle}</span>
          </div>
        </div>

        {zoomOpen && promotion.imageUrl && (
          <ImageLightbox images={[promotion.imageUrl]} alt={title} initialIndex={0} onClose={() => setZoomOpen(false)} />
        )}
      </div>
    </div>
  );
}
