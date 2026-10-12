import { localizedField } from '../i18n/contentText';
import { useI18n } from '../i18n/I18nContext';
import { Ban, Plus } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import { ShareButton } from './ShareButton';
import { useAccentColor } from '../hooks/useAccentColor';
import {
  MENU_BORDER,
  MENU_SURFACE,
  MENU_SURFACE_SUBTLE,
  MENU_TEXT,
  MENU_TEXT_FAINT,
  MENU_TEXT_MUTED,
} from '../lib/menuTheme';

interface ProductCardProps {
  product: Product;
  primaryColor: string;
  onClick: () => void;
  // Loja fechada: o card continua abrindo (para ler os detalhes), mas o "+" fica travado.
  storeClosed?: boolean;
  // Link público do item; sem ele o card não mostra o botão de compartilhar.
  shareUrl?: string;
}

// Card de grid (2 colunas no celular até 5 no desktop) — foto quadrada
// (4:3 no desktop, pra o card não ficar alto), botão "+" circular flutuando
// meio dentro/meio fora da foto (sobrepondo o canto inferior direito),
// nome e preço abaixo. Estrutura calcada no print de referência
// (McDonald's/FoodyPro): grid denso, cartão compacto, preço riscado
// quando há promoção.
export function ProductCard({ product, primaryColor, onClick, storeClosed = false, shareUrl }: ProductCardProps) {
  const { t } = useI18n();
  const { addItem } = useCart();
  const accent = useAccentColor(primaryColor);
  const displayPrice = product.promoPrice ?? product.price;
  const hasPromo = product.promoPrice != null;
  const isUnavailable = product.isAvailable === false;
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);

  return (
    <button
      onClick={onClick}
      className={`flex flex-col h-full text-left rounded-2xl overflow-hidden border shadow-[0_2px_10px_rgba(0,0,0,0.04)] md:hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)] active:scale-[0.985] transition-[transform,box-shadow] ${MENU_SURFACE} ${MENU_BORDER} ${isUnavailable ? 'opacity-90' : ''}`}
    >
      <div className={`relative aspect-square md:aspect-[4/3] ${MENU_SURFACE_SUBTLE}`}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={localizedField(product, 'name')}
            className={`w-full h-full object-cover ${isUnavailable ? 'grayscale opacity-60' : storeClosed ? CLOSED_MUTED_CLASS : ''}`}
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

        {hasPromo && !isUnavailable && (
          <span className="absolute top-2 left-2 bg-white text-[10px] font-bold px-2 py-0.5 rounded-full text-red-600 shadow-sm">
            {t('product.promotion')}
          </span>
        )}

        {storeClosed && !isUnavailable ? (
          <span
            aria-label={`${localizedField(product, 'name')}: ${t('store.closedEstablishment')}`}
            title={t('store.closedEstablishment')}
            className="absolute -bottom-3 right-2.5 md:-bottom-4 md:right-3 w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white dark:border-[#1E1E20] bg-gray-400 cursor-not-allowed"
          >
            <Ban size={15} strokeWidth={1.5} />
          </span>
        ) : isUnavailable ? (
          <span
            aria-label={t('product.unavailable', { name: localizedField(product, 'name') })}
            className="absolute -bottom-3 right-2.5 md:-bottom-4 md:right-3 w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white dark:border-[#1E1E20] bg-gray-400 cursor-not-allowed"
          >
            <Ban size={15} strokeWidth={1.5} />
          </span>
        ) : (
        <span
            role="button"
            aria-label={t('product.add', { name: product.name })}
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
        )}
      </div>

      <div className="flex flex-col flex-1 px-2.5 pt-2.5 pb-3 md:px-3.5 md:pt-4 md:pb-4">
        <p className={`font-display font-bold text-[13px] md:text-sm leading-tight line-clamp-1 ${isUnavailable ? MENU_TEXT_MUTED : MENU_TEXT}`}>
          {localizedField(product, 'name')}
        </p>
        {product.description && (
          <p className={`text-[11px] md:text-xs mt-0.5 line-clamp-1 leading-snug ${MENU_TEXT_MUTED}`}>
            {localizedField(product, 'description')}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 mt-auto pt-1.5">
          {hasPromo && (
            <span className={`text-[11px] line-through ${MENU_TEXT_FAINT}`}>
              R$ {Number(product.price).toFixed(2).replace('.', ',')}
            </span>
          )}
          <span
            className={`font-bold text-sm md:text-base ${!isUnavailable && !hasPromo ? MENU_TEXT : ''}`}
            style={isUnavailable ? { color: '#9ca3af' } : hasPromo ? { color: accent } : undefined}
          >
            R$ {Number(displayPrice).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    </button>
  );
}
