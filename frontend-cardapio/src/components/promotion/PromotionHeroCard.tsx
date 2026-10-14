import { useI18n } from '../../i18n/I18nContext';
import { getHeroNumberScale, getPromotionHeroValue } from '../../lib/promotionPresentation';
import { MENU_TEXT, MENU_TEXT_SOFT } from '../../lib/menuTheme';
import type { Promotion } from '../../types';

// Painel do desconto, ABAIXO da imagem: vidro transparente, compacto (largura
// do conteúdo), com a SUA PRÓPRIA luz ambiente atrás, mais leve que a da
// imagem: branca no tema escuro e escura no tema claro. A luz é um bloco do
// mesmo tamanho do painel, desfocado (sem máscara: o desfoque cria o
// esmaecimento, então não há bordas retas). Texto nos tokens do app.
// Só exibe valores que a promoção já tem; não calcula nada.
// Requer um ancestral `isolate` (PromotionMedia) para o z-index negativo da luz
// ficar acima do fundo da página e abaixo do painel.
export function PromotionHeroCard({
  promotion,
  ariaLabel,
  muted = false,
  className = '',
}: {
  promotion: Promotion;
  ariaLabel: string;
  muted?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const hero = getPromotionHeroValue(promotion);
  const subtitle =
    promotion.scope === 'all'
      ? t('promotionDetailPage.em_todo_o_cardapio')
      : t('promotionDetailPage.nos_itens_selecionados');
  // Tamanho pelo comprimento do valor (o admin edita livremente).
  const numberSize = {
    short: 'text-6xl md:text-8xl lg:text-9xl',
    medium: 'text-5xl md:text-7xl lg:text-8xl',
    long: 'text-4xl md:text-6xl lg:text-7xl',
    xlong: 'text-3xl md:text-5xl lg:text-6xl',
  }[getHeroNumberScale(hero.text)];

  return (
    <div className={`relative w-max max-w-full ${className}`}>
      {/* luz própria do painel: escura no claro, branca no escuro; sutil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl md:rounded-3xl bg-[#111827]/20 dark:bg-white/15 blur-xl md:blur-2xl"
      />
      <div
        role="group"
        aria-label={ariaLabel}
        className={`rounded-2xl md:rounded-3xl border border-black/10 dark:border-white/15 bg-[#FFFFFF]/45 dark:bg-white/[0.05] backdrop-blur-xl shadow-lg px-4 py-3 md:px-7 md:py-5 ${muted ? 'opacity-80 grayscale' : ''}`}
      >
        <div className="flex flex-wrap items-end gap-x-2 md:gap-x-3 gap-y-1">
          <span className={`font-display font-extrabold leading-[0.9] tracking-tight tabular-nums ${numberSize} ${MENU_TEXT}`}>
            {hero.text}
          </span>
          <span className={`mb-1 md:mb-2 font-display text-lg md:text-3xl font-extrabold tracking-wide ${MENU_TEXT_SOFT}`}>
            {t('promotionDetailPage.off')}
          </span>
        </div>
        <p className={`mt-2 md:mt-3 text-sm md:text-base font-semibold ${MENU_TEXT_SOFT}`}>{subtitle}</p>
      </div>
    </div>
  );
}
