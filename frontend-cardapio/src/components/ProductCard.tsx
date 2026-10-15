import { localizedField } from '../i18n/contentText';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Ban, Plus, Sparkles, Star } from 'lucide-react';
import type { ItemPromotionPreview } from '../lib/promotionEligibility';
import { formatBRL } from '../lib/promotionPresentation';
import type { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useTenant } from '../contexts/TenantContext';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import { ShareButton } from './ShareButton';
import { Tooltip } from './Tooltip';
import { useAccentColor } from '../hooks/useAccentColor';
import {
  MENU_BORDER,
  MENU_SURFACE,
  MENU_SURFACE_SUBTLE,
  MENU_TEXT,
  MENU_TEXT_FAINT,
  MENU_TEXT_MUTED,
  MENU_TEXT_SOFT,
} from '../lib/menuTheme';
import { ProductImageCarousel } from './ProductImageCarousel';
import { getProductImages } from '../lib/productImages';
import { isNewProduct } from '../lib/productBadges';
import { loadItemRating, peekItemRating } from '../lib/itemRatings';
import type { ItemRating } from '../lib/itemRatings';

// Mouse parado no card ("hover intent"): só depois desse tempo o card se destaca,
// para passar o mouse rápido pela grade não ficar piscando cards.
const HOVER_INTENT_MS = 140;
// Com o mouse no card, a foto troca a cada 3 s (na tela do item continua 5 s).
const HOVER_AUTOPLAY_MS = 3000;

interface ProductCardProps {
  product: Product;
  primaryColor: string;
  onClick: () => void;
  // Loja fechada: o card continua abrindo (para ler os detalhes), mas o "+" fica travado.
  storeClosed?: boolean;
  // Link público do item; sem ele o card não mostra o botão de compartilhar.
  shareUrl?: string;
  // Simulação da promoção ATIVADA que cobre este item (pickItemPromotion). Quando
  // existe, o card mostra o preço riscado e o preço final do motor.
  itemPromotion?: ItemPromotionPreview | null;
}

// Card de grid (2 colunas no celular até 5 no desktop) — foto quadrada
// (4:3 no desktop, pra o card não ficar alto), botão "+" circular flutuando
// meio dentro/meio fora da foto (sobrepondo o canto inferior direito),
// nome e preço abaixo. Estrutura calcada no print de referência
// (McDonald's/FoodyPro): grid denso, cartão compacto, preço riscado
// quando há promoção.
export function ProductCard({ product, primaryColor, onClick, storeClosed = false, shareUrl, itemPromotion = null }: ProductCardProps) {
  const { t } = useI18n();
  const { addItem } = useCart();
  const accent = useAccentColor(primaryColor);
  const isUnavailable = product.isAvailable === false;
  // Promoção ativada pelo cliente (Modo Promoção ou cupom) cobrindo o item:
  // preço de hoje riscado e preço com a promoção, ambos vindos do motor.
  const dealPreview = itemPromotion && itemPromotion.isEligible && !isUnavailable ? itemPromotion : null;
  const displayPrice = dealPreview ? dealPreview.unitPriceAfterPromo : (product.promoPrice ?? product.price);
  const strikePrice = dealPreview ? dealPreview.unitPriceBeforePromo : product.promoPrice != null ? product.price : null;
  const hasPromo = dealPreview != null || product.promoPrice != null;
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);
  // Galeria do item (até 5). Com 2+ fotos vira carrossel; com 1 é a imagem de sempre.
  const images = getProductImages(product);

  // ---- Destaque ao parar o mouse no card (só mouse; toque não tem "hover") ----
  // O card cresce um pouco, mostra mais da descrição, passa as fotos sozinho e
  // exibe a nota (ou "Novo"). Ele passa a flutuar (absolute) em cima da grade, com
  // a célula travada na altura original: nenhum vizinho se mexe.
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const cellRef = useRef<HTMLDivElement | null>(null);
  const intentTimer = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [chipOn, setChipOn] = useState(false);
  // undefined = ainda não buscou · null = falhou · {count:0} = sem avaliações
  const [rating, setRating] = useState<ItemRating | null | undefined>(() =>
    tenantId ? peekItemRating(tenantId, product.id) : undefined,
  );

  function clearIntent() {
    if (intentTimer.current !== null) {
      window.clearTimeout(intentTimer.current);
      intentTimer.current = null;
    }
  }
  useEffect(() => clearIntent, []);

  function handlePointerEnter(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    clearIntent();
    // A busca da nota já começa agora, para estar pronta quando o card abrir.
    if (tenantId) void loadItemRating(tenantId, product.id).then(setRating);
    intentTimer.current = window.setTimeout(() => {
      intentTimer.current = null;
      // Altura EXATA (fracionada): offsetHeight arredonda e empurraria a linha de baixo ~1px.
      if (cellRef.current) setLockedHeight(cellRef.current.getBoundingClientRect().height);
      setHovered(true);
    }, HOVER_INTENT_MS);
  }
  function handlePointerLeave(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    clearIntent();
    setHovered(false);
    setLockedHeight(null);
  }

  // Detalhe extra (canto inferior direito): nota se já foi avaliado; "Novo" só se
  // NÃO tem avaliações e foi adicionado há menos de uma semana.
  const detail: 'rating' | 'new' | null =
    rating && rating.count > 0 ? 'rating' : rating && isNewProduct(product.createdAt) ? 'new' : null;
  const showChip = hovered && detail !== null;
  useEffect(() => {
    if (!showChip) {
      setChipOn(false);
      return;
    }
    const frame = requestAnimationFrame(() => setChipOn(true));
    return () => cancelAnimationFrame(frame);
  }, [showChip]);

  return (
    <div
      ref={cellRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={`relative h-full ${hovered ? 'z-20' : ''}`}
      style={lockedHeight !== null ? { minHeight: lockedHeight } : undefined}
    >
    <button
      onClick={onClick}
      className={`flex flex-col w-full text-left rounded-2xl overflow-hidden border shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.985] transition-[transform,scale,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
        hovered
          ? 'absolute inset-x-0 top-0 min-h-full scale-[1.04] motion-reduce:scale-100 shadow-[0_16px_36px_rgba(0,0,0,0.2)]'
          : 'h-full md:hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)]'
      } ${MENU_SURFACE} ${MENU_BORDER} ${isUnavailable ? 'opacity-90' : ''}`}
    >
      <div className={`relative w-full aspect-square md:aspect-[4/3] ${MENU_SURFACE_SUBTLE}`}>
        {images.length > 0 ? (
          <ProductImageCarousel
            images={images}
            alt={localizedField(product, 'name')}
            size="card"
            nestedInButton
            playing={hovered}
            autoplayMs={HOVER_AUTOPLAY_MS}
            imgClassName={isUnavailable ? 'grayscale opacity-60' : storeClosed ? CLOSED_MUTED_CLASS : ''}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center text-xs ${MENU_TEXT_FAINT}`}>
            {t('productCard.sem_foto')}
          </div>
        )}

        {shareUrl && (
          <ShareButton
            variant="chip"
            className="absolute top-2 right-2"
            url={shareUrl}
            title={localizedField(product, 'name')}
            text={product.description ?? undefined}
          />
        )}

        {isUnavailable && (
          <span className="absolute top-2 left-2 bg-gray-800/85 text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm">
            {t('productCard.indisponivel')}
          </span>
        )}

        {dealPreview ? (
          <span className="absolute top-2 left-2 bg-white text-[10px] font-bold px-2 py-0.5 rounded-full text-red-600 shadow-sm">
            {t('promotionMode.unitSaving', { value: formatBRL(dealPreview.unitDiscount) })}
          </span>
        ) : (
          hasPromo &&
          !isUnavailable && (
            <span className="absolute top-2 left-2 bg-white text-[10px] font-bold px-2 py-0.5 rounded-full text-red-600 shadow-sm">
              {t('product.promotion')}
            </span>
          )
        )}

        {/* Os três estados do botão redondo (loja fechada, item indisponível,
            adicionar) usam o `Tooltip` com invólucro `contents`: o botão segue
            posicionado (absolute) em relação à foto, como antes. Sem `title`
            nativo (seria um segundo balão). */}
        {storeClosed && !isUnavailable ? (
          <Tooltip label={t('store.closedEstablishment')} className="contents">
            <span
              aria-label={`${localizedField(product, 'name')}: ${t('store.closedEstablishment')}`}
              className="absolute -bottom-3 right-2.5 md:-bottom-4 md:right-3 w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white dark:border-[#1E1E20] bg-gray-400 cursor-not-allowed"
            >
              <Ban size={15} strokeWidth={1.5} />
            </span>
          </Tooltip>
        ) : isUnavailable ? (
          <Tooltip label={t('productCard.indisponivel')} className="contents">
            <span
              aria-label={t('product.unavailable', { name: localizedField(product, 'name') })}
              className="absolute -bottom-3 right-2.5 md:-bottom-4 md:right-3 w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white dark:border-[#1E1E20] bg-gray-400 cursor-not-allowed"
            >
              <Ban size={15} strokeWidth={1.5} />
            </span>
          </Tooltip>
        ) : (
          <Tooltip label={t('product.add', { name: localizedField(product, 'name') })} className="contents">
            <span
              role="button"
              aria-label={t('product.add', { name: localizedField(product, 'name') })}
              onClick={(e) => {
                e.stopPropagation();
                if (hasRequiredOptions) {
                  onClick(); // tem escolha obrigatória — precisa passar pela tela de detalhe
                } else {
                  addItem(product);
                }
              }}
              className="absolute -bottom-3 right-2.5 md:-bottom-4 md:right-3 w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shadow-md active:scale-90 transition-transform border-2 border-white dark:border-[#1E1E20]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={16} strokeWidth={2.75} />
            </span>
          </Tooltip>
        )}
      </div>

      <div className="flex flex-col flex-1 px-2.5 pt-2.5 pb-3 md:px-3.5 md:pt-4 md:pb-4">
        {/* Nome e descrição de uma linha só: o balão com o texto completo abre
            apenas quando o texto está cortado (reticências). */}
        <Tooltip label={localizedField(product, 'name')} onlyIfTruncated className="block min-w-0">
          <p
            data-truncate
            className={`font-display font-bold text-[13px] md:text-sm leading-tight truncate ${isUnavailable ? MENU_TEXT_MUTED : MENU_TEXT}`}
          >
            {localizedField(product, 'name')}
          </p>
        </Tooltip>
        {product.description && (
          <Tooltip label={localizedField(product, 'description')} onlyIfTruncated className="block min-w-0">
            <p
              data-truncate
              className={`text-[11px] md:text-xs mt-0.5 leading-snug transition-[max-height] duration-200 ease-out ${
                hovered ? 'whitespace-normal line-clamp-3 max-h-[4.125em]' : 'truncate max-h-[1.375em]'
              } ${MENU_TEXT_MUTED}`}
            >
              {localizedField(product, 'description')}
            </p>
          </Tooltip>
        )}
        <div className="flex items-baseline gap-1.5 mt-auto pt-1.5">
          {strikePrice != null && (
            <span className={`text-[11px] line-through ${MENU_TEXT_FAINT}`}>
              R$ {Number(strikePrice).toFixed(2).replace('.', ',')}
            </span>
          )}
          <span
            className={`font-bold text-sm md:text-base ${!isUnavailable && !hasPromo ? MENU_TEXT : ''}`}
            style={isUnavailable ? { color: '#9ca3af' } : hasPromo ? { color: accent } : undefined}
          >
            R$ {Number(displayPrice).toFixed(2).replace('.', ',')}
          </span>
          {showChip && (
            <span
              className={`ml-auto self-center shrink-0 inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap transition-opacity duration-200 ${
                chipOn ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {detail === 'rating' && rating ? (
                <>
                  <Star size={12} strokeWidth={1.5} fill="#F59E0B" className="text-amber-500" aria-hidden="true" />
                  <span className={`font-semibold tabular-nums ${MENU_TEXT_SOFT}`}>{rating.average.toFixed(1)}</span>
                  <span className={`tabular-nums ${MENU_TEXT_FAINT}`}>({rating.count})</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} strokeWidth={1.5} className="text-amber-500" aria-hidden="true" />
                  <span className={`font-semibold ${MENU_TEXT_SOFT}`}>{t('productCard.novo')}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
    </div>
  );
}
