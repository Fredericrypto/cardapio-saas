import type { CSSProperties } from 'react';
import { BookOpen, Leaf } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { PROMO_INK, PROMO_SERIF } from '../../lib/promotionTheme';
import { HungryBowlMascot } from './HungryBowlMascot';
import './empty-cart.css';

interface EmptyCartStateProps {
  /** Cor do restaurante (tenant.primaryColor): tinge o botão, nunca um hex fixo. */
  tenantColor: string;
  onBrowse: () => void;
}

const stagger = (s: number): CSSProperties => ({ '--d': `${s}s` } as CSSProperties);

// Estado "carrinho vazio": mascote animado "Hungry Little Bowl" (SVG inline, ver HungryBowlMascot), título serifado, botão em pílula e filete ornamental. O wallpaper
// de comida e a navbar continuam vindo do CartShell (não são desenhados aqui).
// Duas versões da arte (public/): ramos em marfim no escuro, ramos escuros no claro.
export function EmptyCartState({ tenantColor, onBrowse }: EmptyCartStateProps) {
  const { t } = useI18n();

  return (
    <section
      className="ec flex flex-col items-center justify-center px-4 text-center min-h-[calc(100svh-8.5rem)] md:min-h-[calc(100svh-9.5rem)]"
      style={{ '--ec-brand': tenantColor } as CSSProperties}
    >
      <div className="ec-mascot ec-in" style={stagger(0)}>
        <HungryBowlMascot size="100%" />
      </div>

      <h1 className={`ec-in ec-title ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF, ...stagger(0.12) }}>
        {t('cartPage.seu_carrinho_esta_vazio')}
      </h1>
      <p className="ec-in ec-sub" style={stagger(0.2)}>
        {t('cartPage.adicione_itens_do_cardapio')}
      </p>

      <button
        type="button"
        onClick={onBrowse}
        className="ec-in ec-btn loc-dist"
        style={{ ...stagger(0.28), '--glow': tenantColor } as CSSProperties}
      >
        <BookOpen size={17} strokeWidth={1.5} aria-hidden="true" />
        <span>{t('cartPage.ver_cardapio')}</span>
      </button>

      <div className="ec-in ec-sep" style={stagger(0.36)} aria-hidden="true">
        <span className="ec-line ec-line--l" />
        <div className="flex flex-col items-center gap-2.5">
          <Leaf size={16} strokeWidth={1.25} />
          <span className="ec-eyebrow">{t('cartPage.bons_sabores_te_esperam')}</span>
        </div>
        <span className="ec-line ec-line--r" />
      </div>
    </section>
  );
}
