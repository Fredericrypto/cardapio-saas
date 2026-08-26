import { Plus } from 'lucide-react';
import type { Product } from '../types';
import { useCart } from '../contexts/CartContext';

interface ProductCardProps {
  product: Product;
  primaryColor: string;
  onClick: () => void;
}

// Card de grid 2 colunas — foto quadrada, botão "+" circular flutuando
// meio dentro/meio fora da foto (sobrepondo o canto inferior direito),
// nome e preço abaixo. Estrutura calcada no print de referência
// (McDonald's/FoodyPro): grid denso, cartão compacto, preço riscado
// quando há promoção.
export function ProductCard({ product, primaryColor, onClick }: ProductCardProps) {
  const { addItem } = useCart();
  const displayPrice = product.promoPrice ?? product.price;
  const hasPromo = product.promoPrice != null;
  const hasRequiredOptions = (product.options ?? []).some((g) => g.minSelect > 0);

  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.985] transition-transform"
    >
      <div className="relative aspect-square bg-gray-100">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
            Sem foto
          </div>
        )}

        {hasPromo && (
          <span className="absolute top-2 left-2 bg-white text-[10px] font-bold px-2 py-0.5 rounded-full text-red-600 shadow-sm">
            Promoção
          </span>
        )}

        <span
          role="button"
          aria-label={`Adicionar ${product.name}`}
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
      </div>

      <div className="px-2.5 pt-2.5 pb-3">
        <p className="font-display font-bold text-[13px] text-gray-900 leading-tight line-clamp-1">
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
          <span className="font-bold text-sm" style={{ color: hasPromo ? primaryColor : '#111827' }}>
            R$ {Number(displayPrice).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    </button>
  );
}
