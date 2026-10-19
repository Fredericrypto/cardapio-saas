import { memo } from 'react';
import { Ban, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { AnimatedGradientButton } from '../AnimatedGradientButton';
import { Tooltip } from '../Tooltip';
import { PromotionQuantityStepper } from './PromotionQuantityStepper';
import { localizedField } from '../../i18n/contentText';
import { formatBRL } from '../../lib/promotionPresentation';
import { getProductImages } from '../../lib/productImages';
import type { ItemPromotionPreview } from '../../lib/promotionEligibility';
import { promotionCardDomId } from '../../lib/promotionMode';
import { PROMO_FOCUS, PROMO_INK, PROMO_SERIF } from '../../lib/promotionTheme';
import { MENU_BORDER, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED, MENU_SURFACE_SUBTLE } from '../../lib/menuTheme';
import type { Product } from '../../types';

const DEAL_BADGE =
  'rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#EDE6D6] backdrop-blur-md';

interface PromotionExploreProductCardProps {
  product: Product;
  // Simulação do motor (previewItemPromotion) — nenhuma conta é feita aqui.
  preview: ItemPromotionPreview;
  primaryColor: string;
  storeClosed: boolean;
  // Este card é o aberto no painel (master-detail).
  isSelected: boolean;
  // Id do painel que este card controla (aria-controls) quando selecionado.
  panelId: string;
  // 'wide' = cartão horizontal largo (categoria com UM item); 'compact' = grade.
  layout?: 'compact' | 'wide';
  // Callbacks ESTÁVEIS (useCallback na tela) recebendo o produto: é o que deixa
  // o memo valer — trocar o item aberto re-renderiza só dois cards.
  onToggle: (productId: string) => void;
  onSelect: (productId: string) => void;
  onQuickAdd: (product: Product) => void;
  // Quantidade deste produto no carrinho (soma de todas as linhas). 0 = o botão
  // "+" simples; > 0 = seletor compacto [ − ] [ qtd ] [ + ].
  quantity: number;
  // Também estáveis: agem na linha do carrinho que o card controla
  // (findProductCartLine). "−" em 1 remove o item do carrinho.
  onIncrease: (product: Product) => void;
  onDecrease: (product: Product) => void;
}

// Card do Modo Promoção: preço de hoje riscado e preço com a promoção, ambos
// vindos do motor. O pedido mínimo NÃO bloqueia o preview (decisão da Etapa 1):
// quem avisa quanto falta é o banner. Item fora da promoção (ou indisponível)
// aparece abaixo dos elegíveis, atenuado e com selo, mas segue clicável e
// comprável: o cliente nunca fica travado fora do desconto.
//
// Carrinho no card: sem o item (quantity 0) é o "+" de sempre; com o item vira
// o seletor compacto. Produto com adicionais obrigatórios continua abrindo o
// painel no primeiro "+" (precisa escolher); já no carrinho, "+" repete a linha
// existente e "−" tira dela. Item indisponível ou loja fechada nunca aumenta,
// mas o cliente ainda consegue REMOVER o que já está no carrinho.
//
// Duas apresentações com a MESMA lógica: 'compact' (foto em cima, grade) e
// 'wide' (texto à esquerda, foto dissolvendo à direita).
function PromotionExploreProductCardImpl({
  product,
  preview,
  storeClosed,
  isSelected,
  panelId,
  layout = 'compact',
  onToggle,
  onSelect,
  onQuickAdd,
  quantity,
  onIncrease,
  onDecrease,
}: PromotionExploreProductCardProps) {
  const { t } = useI18n();
  const wide = layout === 'wide';
  const name = localizedField(product, 'name');
  const description = localizedField(product, 'description');
  const image = getProductImages(product)[0];
  const isUnavailable = product.isAvailable === false;
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);
  const showDeal = preview.isEligible && preview.unitDiscount > 0 && !isUnavailable;
  const outOfPromotion = !preview.covered || isUnavailable;
  const from = formatBRL(preview.unitPriceBeforePromo);
  const to = formatBRL(preview.unitPriceAfterPromo);
  // Fora da promoção com promoPrice próprio: mantém o preço de tabela riscado.
  const listStrike = !showDeal && product.promoPrice != null ? formatBRL(preview.listUnitPrice) : null;
  const addLabel = t('product.add', { name });
  const actionLabel = hasRequiredOptions ? t('promotionMode.options') : addLabel;
  const inCart = quantity > 0;
  const blocked = storeClosed || isUnavailable;

  const imgTone = isUnavailable ? 'grayscale opacity-60' : outOfPromotion ? 'opacity-80 saturate-[0.85]' : '';
  const badgePos = wide ? 'inline-flex self-start' : 'absolute left-2.5 top-2.5';
  const actionPos = wide ? 'absolute bottom-3 right-3' : 'absolute bottom-[10px] right-[10px]';
  const showStrike = wide || !inCart;

  const badge = showDeal ? (
    <span className={`${DEAL_BADGE} ${badgePos}`}>
      {t('promotionMode.unitSaving', { value: formatBRL(preview.unitDiscount) })}
    </span>
  ) : isUnavailable ? (
    <span className={`rounded-full bg-gray-800/85 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ${badgePos}`}>
      {t('productCard.indisponivel')}
    </span>
  ) : outOfPromotion ? (
    <span
      className={`rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#374151] shadow-sm dark:bg-[#1E1E20]/90 dark:text-[#C4C7C5] ${badgePos}`}
    >
      {t('promotionMode.notIncluded')}
    </span>
  ) : null;

  const nameNode = (
    <span
      className={`block leading-tight ${
        wide ? 'mt-2.5 line-clamp-2 text-[1.4rem] first:mt-0 sm:text-[1.6rem]' : 'line-clamp-1 text-[0.95rem]'
      } ${isUnavailable ? MENU_TEXT_MUTED : PROMO_INK}`}
      style={{ fontFamily: PROMO_SERIF }}
    >
      {name}
    </span>
  );

  const descNode = wide ? (
    description ? (
      <span className={`mt-2 line-clamp-3 text-[13px] leading-relaxed ${MENU_TEXT_BODY}`}>{description}</span>
    ) : null
  ) : (
    <span className={`mt-0.5 line-clamp-1 min-h-[1.25rem] text-xs ${MENU_TEXT_BODY}`}>{description}</span>
  );

  const priceRow = (
    <span className={`mt-auto flex items-baseline gap-2 ${wide ? 'pt-3' : 'pt-1.5'} ${!wide && inCart ? 'pr-9' : ''}`}>
      {showStrike && showDeal && (
        <span className={`${wide ? 'text-sm' : 'text-xs'} tabular-nums line-through ${MENU_TEXT_MUTED}`}>R$ {from}</span>
      )}
      {showStrike && listStrike && (
        <span className={`${wide ? 'text-sm' : 'text-xs'} tabular-nums line-through ${MENU_TEXT_MUTED}`}>
          R$ {listStrike}
        </span>
      )}
      <span
        className={`whitespace-nowrap font-semibold tabular-nums ${wide ? 'text-lg' : 'text-sm'} ${
          showDeal ? '' : isUnavailable ? MENU_TEXT_MUTED : MENU_TEXT
        }`}
        style={showDeal ? { color: 'var(--accent)' } : undefined}
      >
        R$ {to}
      </span>
    </span>
  );

  return (
    <div
      id={promotionCardDomId(product.id)}
      className={`group relative flex h-full flex-col overflow-hidden ${
        wide ? 'rounded-2xl sm:rounded-3xl' : 'rounded-2xl'
      } border bg-transparent backdrop-blur-md transition-shadow ${MENU_BORDER} ${
        isSelected ? 'ring-2 ring-[color:var(--accent)]' : 'loc-card [--glow:var(--accent)]'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(product.id)}
        aria-pressed={isSelected}
        aria-controls={isSelected ? panelId : undefined}
        className={`flex flex-1 text-left ${wide ? 'relative min-h-[10.5rem] sm:min-h-[13rem]' : 'flex-col'} ${PROMO_FOCUS}`}
        aria-label={showDeal ? `${name}. ${t('promotionMode.priceFromTo', { from, to })}` : name}
      >
        {wide ? (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 right-0 w-[58%] overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,#000_55%)]"
            >
              {image && (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none ${imgTone}`}
                />
              )}
            </span>
            <span className="relative z-10 flex w-[54%] flex-col items-start p-4 sm:p-5">
              {badge}
              {nameNode}
              {descNode}
              {priceRow}
            </span>
          </>
        ) : (
          <>
            <div className={`relative aspect-[16/10] overflow-hidden ${MENU_SURFACE_SUBTLE}`}>
              {image && (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none ${imgTone}`}
                />
              )}
              {badge}
            </div>
            <div className="flex flex-1 flex-col p-3 pr-12">
              {nameNode}
              {descNode}
              {priceRow}
            </div>
          </>
        )}
      </button>

      {inCart ? (
        <PromotionQuantityStepper
          size="compact"
          className={actionPos}
          value={quantity}
          onDecrease={() => onDecrease(product)}
          onIncrease={() => onIncrease(product)}
          disableIncrease={blocked}
          groupLabel={`${name}: ${t('promotionMode.quantity')}`}
          increaseLabel={t('tooltip.increase')}
          decreaseLabel={t('tooltip.decrease')}
          removeLabel={t('tooltip.remove')}
        />
      ) : blocked ? (
        <Tooltip
          label={isUnavailable ? t('productCard.indisponivel') : t('store.closedEstablishment')}
          className="contents"
        >
          <span
            aria-label={`${name}: ${isUnavailable ? t('productCard.indisponivel') : t('store.closedEstablishment')}`}
            className="absolute bottom-3 right-3 flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-gray-400 text-white shadow-md"
          >
            <Ban size={15} strokeWidth={1.5} />
          </span>
        </Tooltip>
      ) : (
        <Tooltip label={actionLabel} className="contents">
          <AnimatedGradientButton
            onClick={() => (hasRequiredOptions ? onSelect(product.id) : onQuickAdd(product))}
            aria-label={actionLabel}
            animation="hover"
            className={`${actionPos} h-9 w-9 rounded-full shadow-md`}
            fillClassName="bg-[var(--brand)] text-white"
            contentClassName="flex h-full w-full items-center justify-center"
          >
            <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
          </AnimatedGradientButton>
        </Tooltip>
      )}
    </div>
  );
}

export const PromotionExploreProductCard = memo(PromotionExploreProductCardImpl);
