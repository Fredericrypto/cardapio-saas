import { useI18n } from '../../i18n/I18nContext';
import { PROMO_EYEBROW, PROMO_MUTED, PROMO_SERIF } from '../../lib/promotionTheme';

// Ramo em traço fino (decoração, aria-hidden). Folhas = a mesma forma repetida
// com rotação/escala ao longo de uma haste.
const LEAF = 'M0 0C7-9 21-9 30 0C21 9 7 9 0 0Z';
const LEAVES: ReadonlyArray<readonly [number, number, number, number]> = [
  [26, 120, -115, 0.95],
  [26, 120, -10, 0.85],
  [38, 98, -125, 0.9],
  [38, 98, -5, 0.8],
  [50, 78, -120, 0.8],
  [50, 78, -15, 0.75],
  [62, 56, -125, 0.7],
  [62, 56, -10, 0.65],
  [74, 34, -130, 0.55],
  [74, 34, -20, 0.55],
  [86, 10, -75, 0.5],
];

function Botanical({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 110 150"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 146C30 110 48 74 86 10" vectorEffect="non-scaling-stroke" />
      {LEAVES.map(([x, y, rotate, scale]) => (
        <g key={`${x}-${rotate}`} transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
          <path d={LEAF} vectorEffect="non-scaling-stroke" />
          <path d="M0 0H30" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}

// Mensagem editorial abaixo da imagem: ramo, rótulo, título em itálico serifado,
// divisor vertical e um parágrafo de apoio. Texto fixo da página, em i18n.
export function PromotionEditorial() {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10" aria-labelledby="promo-editorial-title">
      <div className="flex items-center gap-5 md:gap-8">
        <Botanical className="h-24 w-auto shrink-0 text-black/35 dark:text-white/30 md:h-32" />
        <div>
          <p className={`flex items-center gap-3 ${PROMO_EYEBROW} ${PROMO_MUTED}`}>
            <span aria-hidden="true" className="h-px w-5 bg-current" />
            {t('promotionDetailPage.editorialEyebrow')}
          </p>
          <h2
            id="promo-editorial-title"
            className="mt-2 text-3xl font-light italic leading-[1.1] text-[#6B7280] dark:text-[#8A8A86] md:text-4xl lg:text-5xl"
            style={{ fontFamily: PROMO_SERIF }}
          >
            {t('promotionDetailPage.editorialTitle')}
          </h2>
        </div>
      </div>
      <span aria-hidden="true" className="hidden h-24 w-px shrink-0 bg-black/10 dark:bg-white/15 md:block" />
      <p className={`max-w-[19rem] text-sm leading-7 ${PROMO_MUTED}`}>{t('promotionDetailPage.editorialText')}</p>
    </section>
  );
}
