// Foto do pedido no exato momento do envio — o carrinho é limpo logo depois de
// criar o pedido (clearCart()), então sem isso a tela de confirmação não teria
// mais como mostrar os itens.
export interface OrderSnapshot {
  items: { name: string; quantity: number; price: number; selectedOptions: string[] }[];
  customerName: string;
  orderType: 'balcao' | 'mesa' | 'entrega';
  paymentMethod: 'dinheiro' | 'cartao' | 'pix' | null;
  tipAmount: number;
  notes: string | null;
  createdAt: string;
  tableNumber: string | null;
  deliveryAddress: string | null;
  deliveryReferencePoint: string | null;
  deliveryFee: number | null;
  deliveryDistanceKm: number | null;
}
