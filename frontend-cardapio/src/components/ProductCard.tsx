import { useI18n } from '../i18n/I18nContext';
import { Ban, Plus } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import { ShareButton } from './ShareButton';

interface ProductCardProps {
  product: Product;
  primaryColor: string;
  onClick: () => void;
  // Loja fechada: o card continua abrindo (para ler os detalhes), mas o "+" fica travado.
  storeClosed?: boolean;
  // Link público do item; sem ele o card não mostra o botão de compartilhar.
  shareUrl?: string;
}

// Card de grid 2 colunas — foto quadrada, botão "+" circular flutuando
// meio dentro/meio fora da foto (sobrepondo o canto inferior direito),
// nome e preço abaixo. Estrutura calcada no print de referência
// (McDonald's/FoodyPro): grid denso, cartão compacto, preço riscado
// quando há promoção.
export function ProductCard({ product, primaryColor, onClick, storeClosed = false, shareUrl }: ProductCardProps) {
  const { t } = useI18n();
  const { addItem } = useCart();
  const displayPrice = product.promoPrice ?? product.price;
  const hasPromo = product.promoPrice != null;
  const isUnavailable = product.isAvailable === false;
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.985] transition-transform ${isUnavailable ? 'opacity-90' : ''}`}
    >
      <div className="relative aspect-square bg-gray-100">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover ${isUnavailable ? 'grayscale opacity-60' : storeClosed ? CLOSED_MUTED_CLASS : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
            Sem foto
          </div>
        )}

        {shareUrl && (
          <ShareButton
            variant="chip"
            className="absolute top-2 right-2"
            url={shareUrl}
            title={product.name}
            text={product.description ?? undefined}
          />
        )}

        {isUnavailable && (
          <span className="absolute top-2 left-2 bg-gray-800/85 text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm">
            Indisponível
          </span>
        )}

        {hasPromo && !isUnavailable && (
          <span className="absolute top-2 left-2 bg-white text-[10px] font-bold px-2 py-0.5 rounded-full text-red-600 shadow-sm">
            {t('product.promotion')}
          </span>
        )}

        {storeClosed && !isUnavailable ? (
          <span
            aria-label={`${product.name}: ${t('store.closedEstablishment')}`}
            title={t('store.closedEstablishment')}
            className="absolute -bottom-3 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white bg-gray-400 cursor-not-allowed"
          >
            <Ban size={15} strokeWidth={1.5} />
          </span>
        ) : isUnavailable ? (
          <span
            aria-label={t('product.unavailable', { name: product.name })}
            className="absolute -bottom-3 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white bg-gray-400 cursor-not-allowed"
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
            className="absolute -bottom-3 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md active:scale-90 transition-transform border-2 border-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={16} strokeWidth={2.75} />
          </span>
        )}
      </div>

      <div className="px-2.5 pt-2.5 pb-3">
        <p className={`font-display font-bold text-[13px] leading-tight line-clamp-1 ${isUnavailable ? 'text-gray-400' : 'text-gray-900'}`}>
          {product.name}
        </p>
        {product.description && (
          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 leading-snug">
            {product.description}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 mt-1.5">
          {hasPromo && (
            <span className="text-[11px] text-gray-300 line-through">
              R$ {Number(product.price).toFixed(2).replace('.', ',')}
            </span>
          )}
          <span className="font-bold text-sm" style={{ color: isUnavailable ? '#9ca3af' : hasPromo ? primaryColor : '#111827' }}>
            R$ {Number(displayPrice).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    </button>
  );
}
