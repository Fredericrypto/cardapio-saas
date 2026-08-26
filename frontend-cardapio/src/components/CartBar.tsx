import { useCart } from '../contexts/CartContext';

interface CartBarProps {
  primaryColor: string;
  onClick: () => void;
}

export function CartBar({ primaryColor, onClick }: CartBarProps) {
  const { totalItems, totalPrice } = useCart();

  if (totalItems === 0) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 left-4 right-4 max-w-md mx-auto rounded-xl px-4 py-3.5 flex justify-between items-center text-white font-semibold shadow-lg z-50"
      style={{ backgroundColor: primaryColor }}
    >
      <span className="text-sm">
        {totalItems} {totalItems === 1 ? 'item' : 'itens'} no carrinho
      </span>
      <span className="text-sm">
        R$ {totalPrice.toFixed(2).replace('.', ',')} →
      </span>
    </button>
  );
}
