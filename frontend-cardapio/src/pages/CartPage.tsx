import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, Trash2, MapPin, AlertTriangle, Tag, X } from 'lucide-react';
import { createOrder, quoteDeliveryFee, callWaiter, cancelWaiterCall, getWaiterCallStatus, cancelOrder, flagOrderForAttention, fetchLocationById, fetchActivePromotions } from '../lib/menu-api';
import { computePromotionEligibility, computeSelectedPromotionsEligibility } from '../lib/promotionEligibility';
import type { Location, DeliveryQuote, CreatedOrder, Promotion } from '../types';
import { PixWaitingPanel } from '../components/PixWaitingPanel';
import { useCart } from '../contexts/CartContext';
import { useTenant } from '../contexts/TenantContext';
import { useTableSession } from '../hooks/useTableSession';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { fetchMyCashbackBalance, fetchActiveCashbackSettings } from '../lib/customer-api';
import type { ActiveCashbackSettings } from '../lib/customer-api';
import { CurrencyInput } from '../components/CurrencyInput';
import { PhoneInput } from '../components/PhoneInput';
import { isValidBrazilPhone } from '../lib/phone';

const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const TIP_PERCENT_OPTIONS = [0, 10, 15];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
};

// Só balcão/entrega passam por "pagamento" + "revisão" antes de enviar —
// mesa não tem essas etapas porque o pagamento de verdade acontece depois,
// com o admin, ao fechar a conta. Pix pode ser só informativo (o padrão,
// se o restaurante não configurou nada em Configurações) ou "de verdade"
// (QR com valor já preenchido, pedido só entra na cozinha depois que o
// admin confirma o recebimento) — ver PixWaitingPanel, decidido pelo
// backend a partir de tenant.pixEnabled, nunca pelo frontend.
type CheckoutStep = 'form' | 'payment' | 'review';

// Foto do pedido no exato momento do envio — o carrinho é limpo logo
// depois de criar o pedido (clearCart()), então sem isso a tela de
// confirmação não teria mais como mostrar os itens.
interface OrderSnapshot {
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

export function CartPage() {
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken?: string }>();
  const navigate = useNavigate();
  const {
    items,
    increaseItem,
    decreaseItem,
    removeItem,
    totalPrice,
    clearCart,
    selectedPromotionIds,
    togglePromotion,
  } = useCart();
  const { session } = useTableSession(qrCodeToken);
  const isTableFlow = Boolean(qrCodeToken);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showCouponPicker, setShowCouponPicker] = useState(false);
  const { tenant } = useTenant();
  const { location: selectedLocation } = useSelectedLocation(!isTableFlow ? tenant?.id : undefined);
  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  useEffect(() => {
    if (!isTableFlow || !tenant || !session?.table?.locationId) return;
    fetchLocationById(tenant.id, session.table.locationId).then(setTableLocation);
  }, [isTableFlow, tenant, session?.table?.locationId]);
  const activeLocation = isTableFlow ? tableLocation : selectedLocation;

  const { token: customerToken, customer } = useCustomerAuth();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Se o cliente já tem conta e já salvou nome/telefone, usa esses dados
  // direto — nunca pede pra digitar de novo. Isso também é o que causava
  // o nome aparecendo "duplicado"/embolado no painel do admin: o cliente
  // logado digitava um nome diferente (ou deixava vazio) no formulário,
  // e esse valor ficava dessincronizado do nome de verdade da conta.
  // Com uma ÚNICA fonte de verdade (a conta, quando existe), esse
  // problema desaparece de vez. Só preenche o que estiver faltando —
  // se faltar só o telefone, por exemplo, continua pedindo só o telefone.
  useEffect(() => {
    if (!customer) return;
    if (customer.name) setCustomerName(customer.name);
    if (customer.phone) setCustomerPhone(customer.phone);
  }, [customer]);

  const hasSavedName = Boolean(customer?.name);
  const hasSavedPhone = Boolean(customer?.phone);

  // Saldo de cashback do cliente — só existe pra quem está logado.
  // Buscado uma vez ao entrar no carrinho; se o cliente completar um
  // pedido usando cashback, o saldo é zerado localmente na hora (nunca
  // precisa recarregar a página pra refletir).
  const [cashbackBalance, setCashbackBalance] = useState(0);
  const [useCashback, setUseCashback] = useState(false);
  useEffect(() => {
    if (!tenant || !customerToken) {
      setCashbackBalance(0);
      return;
    }
    fetchMyCashbackBalance(tenant.id, customerToken)
      .then(setCashbackBalance)
      .catch(() => setCashbackBalance(0));
  }, [tenant, customerToken]);

  // Config de cashback ativa pra essa loja — só pra ESTIMAR "você vai
  // ganhar ~R$X" no resumo. O valor real é sempre recalculado no
  // backend na hora do pagamento (ver OrdersService.
  // creditCashbackForPaidOrder), podendo ser um pouco menor se o
  // cliente já tiver batido o teto diário — por isso a estimativa aqui
  // é sempre marcada como aproximada ("~").
  const [activeCashbackSettings, setActiveCashbackSettings] = useState<ActiveCashbackSettings | null>(
    null,
  );
  useEffect(() => {
    if (!tenant) {
      setActiveCashbackSettings(null);
      return;
    }
    fetchActiveCashbackSettings(tenant.id, activeLocation?.id)
      .then(setActiveCashbackSettings)
      .catch(() => setActiveCashbackSettings(null));
  }, [tenant, activeLocation?.id]);

  const [orderType, setOrderType] = useState<'balcao' | 'mesa' | 'entrega'>(
    isTableFlow ? 'mesa' : 'balcao',
  );
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('form');
  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'cartao' | 'pix'>('dinheiro');
  const [tipAmountCents, setTipAmountCents] = useState(0);
  const [tipSelection, setTipSelection] = useState<0 | 10 | 15 | 'custom'>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<CreatedOrder | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<OrderSnapshot | null>(null);
  const [pixState, setPixState] = useState<'waiting' | 'confirmed' | 'expired' | 'cancelled'>(
    'waiting',
  );

  // Chamar garçom + cancelar pedido, na tela de confirmação — só faz
  // sentido depois que o pedido já existe (successOrder). Chamar garçom
  // só se aplica a mesa (balcão/entrega não têm mesa/garçom).
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [isWaiterCallPending, setIsWaiterCallPending] = useState(false);
  const [callWaiterError, setCallWaiterError] = useState<string | null>(null);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);
  const [isFlaggingAttention, setIsFlaggingAttention] = useState(false);
  const [attentionFlagged, setAttentionFlagged] = useState(false);
  const [flagAttentionError, setFlagAttentionError] = useState<string | null>(null);
  const [orderCancelledByCustomer, setOrderCancelledByCustomer] = useState(false);
  const [itemPendingRemoval, setItemPendingRemoval] = useState<string | null>(null);

  // ---------- Endereço de entrega (estruturado, pra maior precisão na
  // geocodificação) e cotação da taxa por distância ----------
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryAddressNumber, setDeliveryAddressNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryPostcode, setDeliveryPostcode] = useState('');
  const [deliveryReferencePoint, setDeliveryReferencePoint] = useState('');
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant?.id) return;
    // Essa busca roda de novo toda vez que `activeLocation` muda —
    // primeiro sem location (ainda resolvendo), depois com a location
    // certa assim que ela chega. Sem a guarda de "essa ainda é a busca
    // mais recente?", se a busca SEM location demorar mais que a busca
    // COM location pra responder, ela chegava DEPOIS e sobrescrevia o
    // resultado certo com um incompleto — o cliente ficava vendo "Nenhum
    // cupom disponível" até clicar em algo que disparasse outra busca.
    let isStale = false;
    fetchActivePromotions(tenant.id, customerToken, activeLocation?.id)
      .then((result) => {
        if (!isStale) setPromotions(result);
      })
      .catch(() => {
        if (!isStale) setPromotions([]);
      });
    return () => {
      isStale = true;
    };
  }, [tenant?.id, customerToken, activeLocation?.id]);

  // Igual iFood: se o cliente está logado e já tem endereço salvo,
  // preenche sozinho ao escolher "Entrega" — sem redigitar nada. Só
  // preenche se os campos ainda estiverem vazios (não sobrescreve o que
  // o cliente já tiver digitado/editado na mão). O endereço salvo já foi
  // verificado ao ser cadastrado, mas recotamos a taxa aqui mesmo assim
  // (preço/distância podem ter mudado desde então).
  useEffect(() => {
    if (orderType !== 'entrega' || !tenant || !customer?.address || deliveryStreet) return;

    const addr = customer.address;
    setDeliveryStreet(addr.street);
    setDeliveryAddressNumber(addr.number ?? '');
    setDeliveryNeighborhood(addr.neighborhood ?? '');
    setDeliveryCity(addr.city);
    setDeliveryState(addr.state);
    setDeliveryPostcode(addr.postcode ?? '');
    setDeliveryReferencePoint(addr.referencePoint ?? '');

    if (!activeLocation) return;
    setIsQuoting(true);
    setQuoteError(null);
    quoteDeliveryFee(activeLocation.id, {
      street: addr.street,
      addressNumber: addr.number ?? undefined,
      neighborhood: addr.neighborhood ?? undefined,
      city: addr.city,
      state: addr.state,
      postcode: addr.postcode ?? undefined,
    })
      .then(setQuote)
      .catch(() =>
        setQuoteError('Não conseguimos recalcular a taxa pro endereço salvo. Confira os dados.'),
      )
      .finally(() => setIsQuoting(false));
  }, [orderType, tenant, activeLocation, customer, deliveryStreet]);

  // Qualquer mudança no endereço invalida a cotação anterior — nunca
  // deixamos o cliente confirmar um pedido com uma taxa calculada pra um
  // endereço diferente do que está escrito agora.
  function updateDeliveryField(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setQuote(null);
      setQuoteError(null);
    };
  }

  const deliveryFieldsFilled =
    deliveryStreet.trim().length > 1 &&
    deliveryCity.trim().length > 1 &&
    deliveryState.trim().length > 1;

  async function handleQuoteDelivery() {
    if (!tenant || !activeLocation || !deliveryFieldsFilled) return;
    setIsQuoting(true);
    setQuoteError(null);
    try {
      const result = await quoteDeliveryFee(activeLocation.id, {
        street: deliveryStreet,
        addressNumber: deliveryAddressNumber || undefined,
        neighborhood: deliveryNeighborhood || undefined,
        city: deliveryCity,
        state: deliveryState,
        postcode: deliveryPostcode || undefined,
      });
      setQuote(result);
    } catch (err: any) {
      setQuoteError(
        err?.response?.data?.message ||
          'Não conseguimos calcular a taxa de entrega para esse endereço.',
      );
    } finally {
      setIsQuoting(false);
    }
  }

  const resolvedTip = orderType !== 'mesa' ? tipAmountCents / 100 : 0;

  // Sempre em centavos inteiros ao computar o valor da gorjeta. Mas o
  // botão "selecionado" NUNCA é decidido comparando esse valor calculado
  // de volta (tipAmountCents === percentToCents(x)) — pedidos baratos
  // fazem 10% e 15% arredondarem pro MESMO centavo (ex: R$0,05 → 10% e
  // 15% viram ambos 0 ou 1 centavo), então os dois botões apareciam
  // "selecionados" ao mesmo tempo. A seleção agora é um estado próprio
  // (tipSelection), independente do valor resultante.
  function percentToCents(percent: number): number {
    const totalCents = Math.round(totalPrice * 100);
    return Math.round((totalCents * percent) / 100);
  }

  function handleSelectTipPercent(percent: 0 | 10 | 15) {
    setTipSelection(percent);
    setTipAmountCents(percentToCents(percent));
  }

  async function handleSubmit() {
    if (!tenant) return;
    if (!activeLocation?.isOpenNow) return; // botão já deveria estar desabilitado, defesa extra
    if (orderType === 'entrega' && !quote) return; // botão já deveria estar desabilitado, defesa extra

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const order = await createOrder(
        tenant.id,
        {
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          tableSessionId: orderType === 'mesa' ? session?.id : undefined,
          locationId: orderType !== 'mesa' ? activeLocation?.id : undefined,
          orderType,
          deliveryStreet: orderType === 'entrega' ? deliveryStreet : undefined,
          deliveryAddressNumber: orderType === 'entrega' ? deliveryAddressNumber || undefined : undefined,
          deliveryNeighborhood: orderType === 'entrega' ? deliveryNeighborhood || undefined : undefined,
          deliveryCity: orderType === 'entrega' ? deliveryCity : undefined,
          deliveryState: orderType === 'entrega' ? deliveryState : undefined,
          deliveryPostcode: orderType === 'entrega' ? deliveryPostcode || undefined : undefined,
          deliveryReferencePoint: orderType === 'entrega' ? deliveryReferencePoint || undefined : undefined,
          paymentMethod: orderType !== 'mesa' ? paymentMethod : undefined,
          tipAmount: orderType !== 'mesa' ? resolvedTip : undefined,
          notes: notes.trim() || undefined,
          // Só manda as promoções que estão elegíveis AGORA pro carrinho
          // atual — evita mandar ids que o backend vai rejeitar de cara.
          // O backend revalida tudo de novo de qualquer forma (nunca
          // confia nisso vindo do cliente).
          promotionIds:
            selectedPromotions.length > 0
              ? selectedPromotions
                  .filter((p) => multiEligibility.perPromo.get(p.id)?.isEligible)
                  .map((p) => p.id)
              : undefined,
          useCashback: useCashback && cashbackBalance > 0 ? true : undefined,
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            selectedValueIds:
              item.selectedOptions.length > 0
                ? item.selectedOptions.map((o) => o.valueId)
                : undefined,
          })),
        },
        customerToken,
      );
      setSuccessOrder(order);
      setOrderSnapshot({
        items: items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price:
            Number(item.product.promoPrice ?? item.product.price) +
            item.selectedOptions.reduce((s, o) => s + o.priceDelta, 0),
          selectedOptions: item.selectedOptions.map((o) => o.label),
        })),
        customerName,
        orderType,
        paymentMethod: orderType !== 'mesa' ? paymentMethod : null,
        tipAmount: orderType !== 'mesa' ? resolvedTip : 0,
        notes: notes.trim() || null,
        createdAt: new Date().toISOString(),
        tableNumber: orderType === 'mesa' ? (session?.table?.number ?? null) : null,
        deliveryAddress: orderType === 'entrega' && quote ? quote.formattedAddress : null,
        deliveryReferencePoint: orderType === 'entrega' ? deliveryReferencePoint || null : null,
        deliveryFee: orderType === 'entrega' && quote ? quote.fee : null,
        deliveryDistanceKm: orderType === 'entrega' && quote ? quote.distanceKm : null,
      });
      setPixState('waiting');
      setIsWaiterCallPending(false);
      setOrderCancelledByCustomer(false);
      clearCart();
      // Reflete o saldo de cashback gasto/ganho imediatamente, sem
      // esperar um novo round-trip — subtrai o que foi usado, soma o
      // que esse pedido já rendeu de volta (normalmente 0 aqui, já que
      // o cashback é creditado só quando o pagamento é confirmado, não
      // na criação do pedido).
      setCashbackBalance((prev) => prev - (order.cashbackUsed ?? 0) + (order.cashbackEarned ?? 0));
      setUseCashback(false);
      // Rebusca as promoções — o pedido que acabou de ser feito pode ter
      // batido no limite por cliente de algum cupom (ou zerado o "N
      // disponíveis"), e sem isso a lista ficava com o snapshot de ANTES
      // do pedido até o cliente sair e voltar pro cardápio (o fetch só
      // roda de novo se tenant/cliente/loja mudarem — nunca por causa de
      // um pedido novo).
      if (tenant?.id) {
        fetchActivePromotions(tenant.id, customerToken, activeLocation?.id)
          .then(setPromotions)
          .catch(() => {});
      }
    } catch (err) {
      // Loga o erro de verdade no console (F12) — a mensagem genérica
      // pro cliente escondia demais, e isso já causou confusão antes
      // tentando adivinhar a causa raiz sem essa informação.
      console.error('Falha ao criar pedido:', err);
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setErrorMessage(
        backendMessage ?? 'Não foi possível enviar o pedido. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCallWaiter() {
    if (!tenant || !session) return;
    setIsCallingWaiter(true);
    setCallWaiterError(null);
    try {
      await callWaiter(tenant.id, session.id);
      setIsWaiterCallPending(true);
    } catch {
      setCallWaiterError('Não foi possível chamar o garçom agora. Tente novamente.');
    } finally {
      setIsCallingWaiter(false);
    }
  }

  // "Cancelar chamar garçom" — pro caso de ter clicado sem querer.
  async function handleCancelWaiterCall() {
    if (!tenant || !session) return;
    try {
      await cancelWaiterCall(tenant.id, session.id);
    } finally {
      setIsWaiterCallPending(false);
    }
  }

  async function handleCancelOrder() {
    if (!tenant || !successOrder) return;
    if (!confirm('Cancelar esse pedido? Essa ação não pode ser desfeita.')) return;
    setIsCancellingOrder(true);
    setCancelOrderError(null);
    try {
      await cancelOrder(tenant.id, successOrder.id);
      setOrderCancelledByCustomer(true);
    } catch (err) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setCancelOrderError(
        backendMessage ?? 'Não foi possível cancelar o pedido agora. Tente novamente.',
      );
    } finally {
      setIsCancellingOrder(false);
    }
  }

  // "Chamar atendente" pra pedido de balcão — não tem mesa/sessão, então
  // não usa o mesmo fluxo de WaiterCall; só sinaliza o painel do admin
  // (order.flagged) igual o destaque de "precisa de atenção" já existente.
  async function handleFlagAttention() {
    if (!tenant || !successOrder) return;
    setIsFlaggingAttention(true);
    setFlagAttentionError(null);
    try {
      await flagOrderForAttention(tenant.id, successOrder.id);
      setAttentionFlagged(true);
    } catch (err) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setFlagAttentionError(backendMessage ?? 'Não foi possível chamar o atendente agora.');
    } finally {
      setIsFlaggingAttention(false);
    }
  }

  // Enquanto o aviso "garçom chamado" está visível nessa tela, confere a
  // cada 3s se já foi atendido (ou cancelado em outra aba) — mesmo
  // esquema já usado no cardápio (MenuPage).
  useEffect(() => {
    if (!isWaiterCallPending || !tenant || !session) return;
    const interval = setInterval(async () => {
      try {
        const result = await getWaiterCallStatus(tenant.id, session.id);
        if (result.status !== 'pendente') {
          setIsWaiterCallPending(false);
        }
      } catch {
        // Falha pontual — tenta de novo no próximo tick.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isWaiterCallPending, tenant, session]);

  // Auto-navega de volta pro cardápio um instante depois do cliente
  // cancelar o próprio pedido — pedido explícito do Felipe ("cancela
  // tudo e volta automaticamente pro cardápio").
  useEffect(() => {
    if (!orderCancelledByCustomer) return;
    const timeout = setTimeout(() => {
      navigate(isTableFlow ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`);
    }, 1800);
    return () => clearTimeout(timeout);
  }, [orderCancelledByCustomer, isTableFlow, slug, qrCodeToken, navigate]);

  const canProceedFromForm =
    Boolean(activeLocation?.isOpenNow) &&
    customerName.trim().length > 0 &&
    isValidBrazilPhone(customerPhone) &&
    (orderType !== 'entrega' || Boolean(quote));

  // Mesa não tem etapa de pagamento/revisão — vai direto pro envio, igual
  // sempre foi (o pagamento acontece depois, em pessoa, com o admin).
  function handlePrimaryAction() {
    if (orderType === 'mesa') {
      handleSubmit();
      return;
    }
    if (checkoutStep === 'form') {
      if (!canProceedFromForm) return;
      setErrorMessage(null);
      setCheckoutStep('payment');
    } else if (checkoutStep === 'payment') {
      setCheckoutStep('review');
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (checkoutStep === 'payment') setCheckoutStep('form');
    else if (checkoutStep === 'review') setCheckoutStep('payment');
    else navigate(-1);
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Área de informações do pedido, depois de enviado — mostra o que foi
  // decidido na etapa de pagamento também, pra confirmar tudo de uma vez.
  // Se o restaurante tem Pix "de verdade" habilitado, primeiro mostra o
  // QR + contador de 6min (PixWaitingPanel) até o admin confirmar — só
  // depois disso (ou se nunca foi Pix real) mostra a tela de "Pedido
  // enviado!" de sempre.
  if (successOrder && orderSnapshot) {
    if (orderCancelledByCustomer) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl mb-4 bg-gray-400">
            ✕
          </div>
          <h1 className="font-display text-xl font-bold text-gray-900">Pedido cancelado</h1>
          <p className="text-sm text-gray-500 mt-2">Voltando ao cardápio...</p>
        </div>
      );
    }

    if (successOrder.status === 'aguardando_pagamento' && pixState === 'waiting') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 max-w-md mx-auto">
          <PixWaitingPanel
            tenant={tenant}
            order={successOrder}
            onConfirmed={() => setPixState('confirmed')}
            onExpired={() => setPixState('expired')}
            onCancelledByRestaurant={() => setPixState('cancelled')}
          />
        </div>
      );
    }

    if (pixState === 'expired' || pixState === 'cancelled') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl mb-4 bg-red-500">
            ✕
          </div>
          <h1 className="font-display text-xl font-bold text-gray-900">
            {pixState === 'cancelled' ? 'O pedido foi cancelado' : 'O tempo pra pagar acabou'}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {pixState === 'cancelled'
              ? `${tenant.name} cancelou esse pedido. Se achar que foi engano, entre em contato antes de fazer um novo pedido.`
              : 'Esse pedido foi cancelado porque o Pix não foi confirmado a tempo. Monte o pedido de novo pra tentar outra vez.'}
          </p>
          <button
            onClick={() => {
              setSuccessOrder(null);
              navigate(isTableFlow ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`);
            }}
            className="mt-6 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            Voltar ao cardápio
          </button>
        </div>
      );
    }

    // Cancelamento pelo próprio cliente só faz sentido pra ENTREGA —
    // mesa e balcão nunca podem ser autocancelados (ver
    // OrdersService.cancelByCustomer): nesses casos a ação do cliente é
    // sempre "chamar atendente/garçom".
    const canStillCancelOrder =
      orderSnapshot.orderType === 'entrega' &&
      (successOrder.status === 'aguardando_pagamento' || successOrder.status === 'pendente');
    const canFlagAttention =
      orderSnapshot.orderType === 'balcao' &&
      (successOrder.status === 'aguardando_pagamento' || successOrder.status === 'pendente');
    const receivingLabel =
      orderSnapshot.orderType === 'mesa'
        ? orderSnapshot.tableNumber ?? 'Mesa'
        : orderSnapshot.orderType === 'entrega'
          ? 'Entrega'
          : 'Balcão';

    return (
      <div className="min-h-screen flex flex-col items-center px-6 py-8 max-w-md mx-auto">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl mb-4"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          ✓
        </div>
        <h1 className="font-display text-xl font-bold text-gray-900 text-center">
          {pixState === 'confirmed' ? 'Pagamento confirmado!' : 'Pedido enviado!'}
        </h1>
        <p className="text-sm text-gray-500 mt-1 text-center">
          {pixState === 'confirmed'
            ? 'Seu Pix foi confirmado e o pedido já está na cozinha.'
            : 'O estabelecimento já recebeu seu pedido e vai confirmar em instantes.'}
        </p>

        <div className="w-full bg-white border border-gray-100 rounded-2xl mt-5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{tenant.name}</p>
              <p className="text-xs text-gray-400">
                {new Date(orderSnapshot.createdAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' · '}
                {receivingLabel}
              </p>
            </div>
          </div>

          <div className="px-4 py-3 flex flex-col gap-1.5 border-b border-gray-100">
            {orderSnapshot.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.quantity}x {item.name}
                  {item.selectedOptions.length > 0 && (
                    <span className="block text-xs text-gray-400">
                      {item.selectedOptions.join(', ')}
                    </span>
                  )}
                </span>
                <span className="text-gray-500 shrink-0 ml-2">
                  R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 flex flex-col gap-1.5 text-xs text-gray-500">
            {orderSnapshot.customerName && (
              <p>
                Cliente: <span className="font-medium text-gray-700">{orderSnapshot.customerName}</span>
              </p>
            )}

            {orderSnapshot.orderType === 'entrega' && orderSnapshot.deliveryAddress && (
              <>
                <p className="font-semibold text-gray-500 flex items-center gap-1.5 mt-1">
                  <MapPin size={13} />
                  Entrega para:
                </p>
                <p className="text-sm font-medium text-gray-800">{orderSnapshot.deliveryAddress}</p>
                {orderSnapshot.deliveryReferencePoint && (
                  <p>Ref: {orderSnapshot.deliveryReferencePoint}</p>
                )}
                {orderSnapshot.deliveryFee != null && (
                  <p>
                    Taxa de entrega: R$ {orderSnapshot.deliveryFee.toFixed(2).replace('.', ',')}
                    {orderSnapshot.deliveryDistanceKm != null &&
                      ` (${orderSnapshot.deliveryDistanceKm.toFixed(1)} km)`}
                  </p>
                )}
              </>
            )}

            {orderSnapshot.orderType !== 'mesa' && orderSnapshot.paymentMethod && (
              <p>
                Pagamento:{' '}
                <span className="font-medium text-gray-700">
                  {PAYMENT_METHOD_LABELS[orderSnapshot.paymentMethod]}
                </span>{' '}
                na {orderSnapshot.orderType === 'entrega' ? 'entrega' : 'retirada'}
              </p>
            )}

            <p>
              Gorjeta:{' '}
              <span className="font-medium text-gray-700">
                {orderSnapshot.tipAmount > 0
                  ? `R$ ${orderSnapshot.tipAmount.toFixed(2).replace('.', ',')}`
                  : 'Sem gorjeta'}
              </span>
            </p>

            {(successOrder.discountAmount ?? 0) > 0 && (
              <p className="text-red-600">
                Desconto aplicado
                {(() => {
                  const titles = successOrder.promotionTitlesSnapshot?.length
                    ? successOrder.promotionTitlesSnapshot
                    : successOrder.promotionTitleSnapshot
                      ? [successOrder.promotionTitleSnapshot]
                      : [];
                  return titles.length > 0 ? ` (${titles.join(', ')})` : '';
                })()}
                :{' '}
                <span className="font-medium">
                  - R$ {Number(successOrder.discountAmount).toFixed(2).replace('.', ',')}
                </span>
              </p>
            )}

            {(successOrder.cashbackUsed ?? 0) > 0 && (
              <p className="text-red-600">
                Cashback usado:{' '}
                <span className="font-medium">
                  - R$ {Number(successOrder.cashbackUsed).toFixed(2).replace('.', ',')}
                </span>
              </p>
            )}

            {successOrder.total != null && (
              <p className="pt-1 mt-1 border-t border-gray-100 flex justify-between text-sm">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold text-gray-900">
                  R$ {(Number(successOrder.total) + orderSnapshot.tipAmount).toFixed(2).replace('.', ',')}
                </span>
              </p>
            )}

            {orderSnapshot.notes && (
              <p>
                Observação: <span className="font-medium text-gray-700">{orderSnapshot.notes}</span>
              </p>
            )}
          </div>
        </div>

        {isTableFlow && (
          <div className="w-full mt-3 flex flex-col gap-2">
            {callWaiterError && (
              <p className="text-xs text-red-500 text-center">{callWaiterError}</p>
            )}
            {isWaiterCallPending ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center"
                  style={{ backgroundColor: tenant.secondaryColor, color: 'white' }}
                >
                  Garçom chamado!
                </div>
                <button
                  onClick={handleCancelWaiterCall}
                  className="py-2.5 px-3 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500"
                >
                  Cancelar chamado
                </button>
              </div>
            ) : (
              <button
                onClick={handleCallWaiter}
                disabled={isCallingWaiter}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 disabled:opacity-50"
              >
                {isCallingWaiter ? 'Chamando...' : 'Algo errado com o pedido? Chamar garçom'}
              </button>
            )}
          </div>
        )}

        {canFlagAttention && (
          <div className="w-full mt-2 flex flex-col gap-1.5">
            {flagAttentionError && (
              <p className="text-xs text-red-500 text-center">{flagAttentionError}</p>
            )}
            {attentionFlagged ? (
              <div
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white"
                style={{ backgroundColor: tenant.secondaryColor }}
              >
                Atendente chamado!
              </div>
            ) : (
              <button
                onClick={handleFlagAttention}
                disabled={isFlaggingAttention}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 disabled:opacity-50"
              >
                {isFlaggingAttention ? 'Chamando...' : 'Algo errado com o pedido? Chamar atendente'}
              </button>
            )}
          </div>
        )}

        {canStillCancelOrder && (
          <div className="w-full mt-2 flex flex-col gap-1.5">
            {cancelOrderError && (
              <p className="text-xs text-red-500 text-center">{cancelOrderError}</p>
            )}
            <button
              onClick={handleCancelOrder}
              disabled={isCancellingOrder}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-100 bg-red-50 disabled:opacity-50"
            >
              {isCancellingOrder ? 'Cancelando...' : 'Cancelar pedido'}
            </button>
          </div>
        )}

        <button
          onClick={() => navigate(isTableFlow ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`)}
          className="mt-5 text-sm font-semibold"
          style={{ color: tenant.primaryColor }}
        >
          Voltar ao cardápio
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
        <p className="text-gray-400 text-sm">Seu carrinho está vazio.</p>
        <button
          onClick={() => navigate(isTableFlow ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`)}
          className="mt-4 text-sm font-semibold"
          style={{ color: tenant.primaryColor }}
        >
          Ver cardápio
        </button>
      </div>
    );
  }

  const deliveryFeeValue = orderType === 'entrega' && quote ? quote.fee : 0;

  // A promoção que o CLIENTE escolheu usar (tela de detalhe da
  // promoção, ou selecionada aqui mesmo no carrinho) — nunca aplicada
  // sozinha, igual iFood. PREVIEW apenas: o valor de verdade, cobrado e
  // gravado no pedido, é sempre recalculado no backend
  // (PromotionsService.validateSelectedPromotions).
  const selectedPromotions = promotions.filter((p) => selectedPromotionIds.includes(p.id));
  // "Disponível" = compatível com o carrinho ATUAL (tem pelo menos um
  // item elegível, bate o pedido mínimo, e o cliente ainda não esgotou
  // o próprio limite) — não basta só "não usei ainda". Cada promoção é
  // checada de forma ISOLADA aqui (como se fosse a única escolhida) pra
  // decidir se ela sequer aparece como opção — independe de quais
  // outras já estão selecionadas.
  const availablePromotionsCount = promotions.filter(
    (p) => computePromotionEligibility(p, items, totalPrice).isEligible,
  ).length;
  // As promoções SELECIONADAS, por outro lado, disputam o carrinho ENTRE
  // ELAS na ordem em que foram escolhidas — ver
  // computeSelectedPromotionsEligibility. Isso é o que decide o valor
  // final e quais unidades ficam isoladas no carrinho.
  const multiEligibility = computeSelectedPromotionsEligibility(selectedPromotions, items, totalPrice);
  const appliedDiscountAmount = multiEligibility.totalDiscountAmount;

  // Quantas unidades de uma linha do carrinho têm cupom aplicado — usado
  // pra ISOLAR visualmente essas unidades das demais (ver requisito: "o
  // item com desconto precisa ficar completamente isolado no carrinho").
  // 0 = nada dessa linha tem desconto agora. Pode ser MENOR que a
  // quantidade total do item (cupom trava em N unidades, ou outro cupom
  // já reivindicou o resto) ou igual a ela.
  function discountedQtyFor(lineKey: string): number {
    return multiEligibility.discountedQuantityByLine.get(lineKey) ?? 0;
  }

  // Estimativa de quanto do saldo de cashback entra no total — só uma
  // prévia visual, o valor real é sempre recalculado no backend (ver
  // OrdersService.create). Abate depois de promoção e taxa de entrega,
  // antes da gorjeta (que fica sempre fora desse cálculo, igual o
  // backend trata tipAmount separado de total).
  const totalBeforeCashback = totalPrice - appliedDiscountAmount + deliveryFeeValue;
  const cashbackToUseEstimate = useCashback ? Math.min(cashbackBalance, totalBeforeCashback) : 0;
  const displayTotal = totalBeforeCashback - cashbackToUseEstimate + resolvedTip;

  // Estimativa de quanto cashback esse pedido vai GERAR — mesma base
  // que o backend usa de verdade (itens líquidos de promoção e do
  // próprio cashback usado, nunca a taxa de entrega): pagar com
  // cashback não gera mais cashback, igual pagar com vale-presente.
  const cashbackEarnEligible = totalPrice - appliedDiscountAmount - cashbackToUseEstimate;
  const estimatedCashbackEarn = (() => {
    if (!activeCashbackSettings || cashbackEarnEligible <= 0) return 0;
    if (cashbackEarnEligible < activeCashbackSettings.minOrderValue) return 0;
    let amount = (cashbackEarnEligible * activeCashbackSettings.percentage) / 100;
    if (activeCashbackSettings.maxCashbackPerOrder != null) {
      amount = Math.min(amount, activeCashbackSettings.maxCashbackPerOrder);
    }
    return amount;
  })();
  // Só mesa mantém o botão único de sempre; balcão/entrega passam pelas
  // etapas de pagamento e revisão antes de poder enviar de verdade.
  const canSubmit =
    orderType === 'mesa'
      ? activeLocation?.isOpenNow
      : checkoutStep === 'review' && activeLocation?.isOpenNow && (orderType !== 'entrega' || Boolean(quote));
  const deliveryAvailable = activeLocation?.latitude != null && activeLocation?.longitude != null;
  const orderTypeOptions = (['mesa', 'balcao', 'entrega'] as const).filter(
    (type) => (type !== 'mesa' || isTableFlow) && (type !== 'entrega' || deliveryAvailable),
  );

  const showFormStep = orderType === 'mesa' || checkoutStep === 'form';
  const showPaymentStep = orderType !== 'mesa' && checkoutStep === 'payment';
  const showReviewStep = orderType !== 'mesa' && checkoutStep === 'review';

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto pb-40">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <button onClick={handleBack}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-lg">
          {showPaymentStep ? 'Pagamento' : showReviewStep ? 'Revisar pedido' : 'Seu pedido'}
        </h1>
      </div>

      {showFormStep && (
        <>
          <div className="p-4 flex flex-col gap-3">
            {items.map((item) => {
              const unitPrice =
                Number(item.product.promoPrice ?? item.product.price) +
                item.selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
              const discountedQty = discountedQtyFor(item.lineKey);
              const regularQty = item.quantity - discountedQty;
              // Isola visualmente as unidades com cupom das demais SÓ
              // quando o cupom cobre uma PARTE da quantidade (ex: cupom
              // trava em 1 unidade, cliente tem 3 no carrinho) — se
              // cobre tudo ou nada, mantém a linha simples de sempre.
              const isSplit = discountedQty > 0 && regularQty > 0;
              const optionsLabel =
                item.selectedOptions.length > 0
                  ? item.selectedOptions.map((o) => o.label).join(', ')
                  : null;
              return (
                <div key={item.lineKey} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                    {item.product.imageUrl && (
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {isSplit ? (
                      <>
                        <div
                          className="rounded-lg px-2 py-1.5 border"
                          style={{
                            borderColor: `${tenant.primaryColor}55`,
                            backgroundColor: `${tenant.primaryColor}0D`,
                          }}
                        >
                          <p className="text-sm font-semibold truncate">
                            {discountedQty}x {item.product.name}
                          </p>
                          {optionsLabel && (
                            <p className="text-xs text-gray-400 truncate">{optionsLabel}</p>
                          )}
                          <p className="text-[11px] font-semibold mt-0.5" style={{ color: tenant.primaryColor }}>
                            🏷 Cupom aplicado · R$ {(unitPrice * discountedQty).toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                        <div className="px-0.5">
                          <p className="text-sm font-semibold truncate">
                            {regularQty}x {item.product.name}
                          </p>
                          {optionsLabel && (
                            <p className="text-xs text-gray-400 truncate">{optionsLabel}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            R$ {(unitPrice * regularQty).toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold truncate">{item.product.name}</p>
                        {optionsLabel && (
                          <p className="text-xs text-gray-400 truncate">{optionsLabel}</p>
                        )}
                        <p className="text-xs text-gray-400">
                          R$ {unitPrice.toFixed(2).replace('.', ',')}
                        </p>
                        {discountedQty > 0 && (
                          <p className="text-[11px] font-semibold mt-0.5" style={{ color: tenant.primaryColor }}>
                            🏷 Cupom aplicado
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-full px-1 py-1">
                    <button
                      onClick={() => decreaseItem(item.lineKey)}
                      className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-4 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => increaseItem(item.lineKey)}
                      className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => setItemPendingRemoval(item.lineKey)}
                    className="text-gray-300"
                  >
                    <Trash2 size={16} />
                  </button>

                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-gray-100">
            {selectedPromotions.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {selectedPromotions.map((promo) => {
                  const result = multiEligibility.perPromo.get(promo.id);
                  return (
                    <div
                      key={promo.id}
                      className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Tag size={15} style={{ color: tenant.primaryColor }} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{promo.title}</p>
                          <p className="text-xs text-gray-400">
                            {result?.isEligible
                              ? `- R$ ${result.discountAmount.toFixed(2).replace('.', ',')}`
                              : result?.reason ?? 'Não elegível pra esse carrinho'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => togglePromotion(promo.id)}
                        className="text-gray-400 shrink-0 pl-2"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => {
                setShowCouponPicker((v) => !v);
                // Refresca sempre que abre — camada extra de segurança
                // pra nunca mostrar cupom já usado como disponível,
                // independente de qualquer outro caminho que possa ter
                // deixado o estado local desatualizado.
                if (tenant?.id) {
                  fetchActivePromotions(tenant.id, customerToken, activeLocation?.id)
                    .then(setPromotions)
                    .catch(() => {});
                }
              }}
              className="w-full flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2 text-gray-600 font-semibold">
                <Tag size={15} className="text-gray-400" />
                {selectedPromotions.length > 0 ? 'Adicionar outro cupom' : 'Usar um cupom'}
              </span>
              <span className="text-xs text-gray-400">
                {availablePromotionsCount > 0
                  ? `${availablePromotionsCount} disponível(is)`
                  : 'Nenhum disponível'}
              </span>
            </button>

            {showCouponPicker && promotions.some((p) => !p.alreadyUsedUp) && (
              <div className="mt-2.5 flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                {/* Cada cupom pode ser ligado/desligado independente dos
                    outros — o cliente escolhe quantos quiser (ver
                    requisito: "se ela quiser usar apenas 2 cupons pra
                    dois itens ela tem liberdade, se quiser usar os 4
                    também pode"). A elegibilidade de cada linha aqui já
                    considera o que os OUTROS cupons selecionados
                    reivindicaram — se selecionar dois cupons pro MESMO
                    item, o segundo aparece "nada sobrou" em vez de
                    mentir um valor que não vai ser cobrado.
                    Cupons já ESGOTADOS pra esse cliente nem aparecem
                    mais aqui — diferente de "ainda não elegível pra esse
                    carrinho" (que pode virar elegível se ele adicionar
                    mais itens), "já usei" é permanente pra essa
                    promoção, então mostrar cinza só ocupava espaço. */}
                {promotions
                  .filter((p) => !p.alreadyUsedUp)
                  .map((promo) => {
                  const isSelected = selectedPromotionIds.includes(promo.id);
                  const previewOrder = isSelected
                    ? selectedPromotions
                    : [...selectedPromotions, promo];
                  const preview = computeSelectedPromotionsEligibility(previewOrder, items, totalPrice);
                  const result = preview.perPromo.get(promo.id);
                  return (
                    <button
                      key={promo.id}
                      onClick={() => togglePromotion(promo.id)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border text-left"
                      style={
                        isSelected
                          ? { borderColor: tenant.primaryColor, backgroundColor: `${tenant.primaryColor}0D` }
                          : { borderColor: '#F3F4F6' }
                      }
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{promo.title}</p>
                        <p className="text-xs text-gray-400">
                          {result?.isEligible
                            ? `Economize R$ ${result.discountAmount.toFixed(2).replace('.', ',')}`
                            : (result?.reason ?? 'Não elegível pra esse carrinho')}
                        </p>
                      </div>
                      <div
                        className="w-5 h-5 rounded-full border-2 shrink-0 ml-2 flex items-center justify-center"
                        style={{
                          borderColor: isSelected ? tenant.primaryColor : '#D1D5DB',
                          backgroundColor: isSelected ? tenant.primaryColor : 'transparent',
                        }}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pt-2 pb-4 border-t border-gray-100 flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">
                Como você quer receber seu pedido?
              </label>
              <div className="flex gap-2 mt-1.5">
                {orderTypeOptions.map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize border"
                    style={
                      orderType === type
                        ? {
                            backgroundColor: tenant.primaryColor,
                            color: 'white',
                            borderColor: tenant.primaryColor,
                          }
                        : { borderColor: '#e5e5e5', color: '#666' }
                    }
                  >
                    {type === 'balcao' ? 'Balcão' : type === 'mesa' ? 'Mesa' : 'Entrega'}
                  </button>
                ))}
              </div>
            </div>

            {!hasSavedName && (
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={orderType === 'mesa' ? 'Seu nome (opcional)' : 'Seu nome'}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
            )}
            {orderType !== 'mesa' && !hasSavedPhone && (
              <PhoneInput
                value={customerPhone}
                onChange={setCustomerPhone}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none w-full"
              />
            )}
            {(hasSavedName || (orderType !== 'mesa' && hasSavedPhone)) && (
              <p className="text-xs text-gray-400">
                Usando os dados da sua conta{hasSavedName ? ` (${customer!.name}` : ''}
                {hasSavedName && orderType !== 'mesa' && hasSavedPhone ? ', ' : ''}
                {orderType !== 'mesa' && hasSavedPhone ? customer!.phone : ''}
                {hasSavedName ? ')' : ''}
              </p>
            )}

            {orderType === 'entrega' && (
              <div className="flex flex-col gap-2 border border-gray-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                  <MapPin size={13} />
                  Endereço de entrega
                </p>

                <div className="flex gap-2">
                  <input
                    value={deliveryStreet}
                    onChange={(e) => updateDeliveryField(setDeliveryStreet)(e.target.value)}
                    placeholder="Rua"
                    className="flex-[2] min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                  />
                  <input
                    value={deliveryAddressNumber}
                    onChange={(e) => updateDeliveryField(setDeliveryAddressNumber)(e.target.value)}
                    placeholder="Número"
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                  />
                </div>

                <input
                  value={deliveryNeighborhood}
                  onChange={(e) => updateDeliveryField(setDeliveryNeighborhood)(e.target.value)}
                  placeholder="Bairro"
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                />

                <div className="flex gap-2">
                  <input
                    value={deliveryCity}
                    onChange={(e) => updateDeliveryField(setDeliveryCity)(e.target.value)}
                    placeholder="Cidade"
                    className="flex-[2] min-w-0 border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                  />
                  <select
                    value={deliveryState}
                    onChange={(e) => updateDeliveryField(setDeliveryState)(e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2.5 text-sm outline-none"
                  >
                    <option value="">UF</option>
                    {BRAZIL_STATES.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  value={deliveryPostcode}
                  onChange={(e) => updateDeliveryField(setDeliveryPostcode)(e.target.value)}
                  placeholder="CEP (opcional, ajuda na precisão)"
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                />

                <input
                  value={deliveryReferencePoint}
                  onChange={(e) => setDeliveryReferencePoint(e.target.value)}
                  placeholder="Ponto de referência (opcional) — ex: portão azul, perto do mercado"
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                />

                {!quote && (
                  <button
                    onClick={handleQuoteDelivery}
                    disabled={!deliveryFieldsFilled || isQuoting}
                    className="py-2.5 rounded-lg text-sm font-semibold border disabled:opacity-50"
                    style={{ borderColor: tenant.primaryColor, color: tenant.primaryColor }}
                  >
                    {isQuoting ? 'Calculando...' : 'Calcular taxa de entrega'}
                  </button>
                )}

                {quoteError && <p className="text-xs text-red-500">{quoteError}</p>}

                {quote && (
                  <div className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1">
                    <p className="text-xs text-gray-500">Endereço confirmado:</p>
                    <p className="text-sm font-medium text-gray-800">{quote.formattedAddress}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Distância: {quote.distanceKm.toFixed(1)} km · Taxa de entrega: R${' '}
                      {quote.fee.toFixed(2).replace('.', ',')}
                    </p>
                    {!quote.precise && (
                      <p className="text-xs text-amber-600 flex items-start gap-1 mt-1">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        Não conseguimos confirmar o número exato — confira se o endereço acima está
                        certo antes de continuar.
                      </p>
                    )}
                    <button
                      onClick={() => setQuote(null)}
                      className="text-xs font-semibold text-gray-500 underline self-start mt-1"
                    >
                      Recalcular
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">
                Alguma observação? (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={280}
                rows={2}
                placeholder="Ex: sem cebola, ponto da carne, embrulhar pra presente..."
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              />
            </div>

            {orderType !== 'mesa' && (
              <div className="flex flex-col gap-2 border border-gray-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500">
                  Gorjeta {orderType === 'entrega' ? 'para o entregador' : '(opcional)'}
                </p>
                <div className="flex gap-2">
                  {TIP_PERCENT_OPTIONS.map((percent) => {
                    const isSelected = tipSelection === percent;
                    return (
                      <button
                        key={percent}
                        onClick={() => handleSelectTipPercent(percent as 0 | 10 | 15)}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                        style={
                          isSelected
                            ? {
                                backgroundColor: tenant.primaryColor,
                                color: 'white',
                                borderColor: tenant.primaryColor,
                              }
                            : { borderColor: '#e5e5e5', color: '#666' }
                        }
                      >
                        {percent === 0 ? 'Sem gorjeta' : `${percent}%`}
                      </button>
                    );
                  })}
                </div>
                <CurrencyInput
                  valueCents={tipSelection === 'custom' ? tipAmountCents : 0}
                  onChangeCents={(cents) => {
                    setTipSelection('custom');
                    setTipAmountCents(cents);
                  }}
                  placeholder="Outro valor (R$)"
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
                />
              </div>
            )}

            {errorMessage && (
              <p className="text-xs text-red-500">{errorMessage}</p>
            )}
          </div>
        </>
      )}

      {showPaymentStep && (
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Como você prefere pagar {orderType === 'entrega' ? 'na entrega' : 'na retirada'}? Ainda
            não processamos pagamento pelo app — isso só avisa o estabelecimento de como você vai
            pagar.
          </p>

          <div className="flex flex-col gap-2">
            {(['dinheiro', 'cartao', 'pix'] as const).map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className="text-left py-3 px-4 rounded-xl border text-sm font-semibold flex items-center justify-between"
                style={
                  paymentMethod === method
                    ? { borderColor: tenant.primaryColor, backgroundColor: `${tenant.primaryColor}10` }
                    : { borderColor: '#e5e5e5' }
                }
              >
                <span>{PAYMENT_METHOD_LABELS[method]}</span>
                {paymentMethod === method && (
                  <span
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: tenant.primaryColor }}
                  />
                )}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-400">
            {paymentMethod === 'dinheiro' &&
              'Tenha o troco combinado com quem entregar/atender, se precisar.'}
            {paymentMethod === 'cartao' && 'Maquininha na entrega/retirada.'}
            {paymentMethod === 'pix' &&
              'O QR code do Pix será gerado pelo estabelecimento na hora da entrega/retirada.'}
          </p>
        </div>
      )}

      {showReviewStep && (
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{tenant.name}</p>
              <p className="text-xs text-gray-400">
                {new Date().toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' · '}
                {orderType === 'entrega' ? 'Entrega' : 'Balcão'}
              </p>
            </div>
          </div>

          {customerName && (
            <div className="flex flex-col gap-1 -mt-1">
              <p className="text-xs font-semibold text-gray-500">Cliente</p>
              <p className="text-sm text-gray-700">{customerName}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500">Itens</p>
            {items.map((item) => {
              const unitPrice =
                Number(item.product.promoPrice ?? item.product.price) +
                item.selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
              const discountedQty = discountedQtyFor(item.lineKey);
              const regularQty = item.quantity - discountedQty;
              const isSplit = discountedQty > 0 && regularQty > 0;
              const optionsLabel =
                item.selectedOptions.length > 0
                  ? item.selectedOptions.map((o) => o.label).join(', ')
                  : null;
              // Mesma isolação visual da tela anterior — se o cupom
              // cobre só uma parte da quantidade, mostra como duas
              // linhas separadas no resumo também (nunca some com a
              // isolação entre uma etapa e outra do checkout).
              if (isSplit) {
                return (
                  <div key={item.lineKey} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span>
                        {discountedQty}x {item.product.name}
                        {optionsLabel && <span className="block text-xs text-gray-400">{optionsLabel}</span>}
                        <span className="block text-[11px] font-semibold" style={{ color: tenant.primaryColor }}>
                          🏷 Cupom aplicado
                        </span>
                      </span>
                      <span className="text-gray-500 shrink-0 ml-2">
                        R$ {(unitPrice * discountedQty).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>
                        {regularQty}x {item.product.name}
                        {optionsLabel && <span className="block text-xs text-gray-400">{optionsLabel}</span>}
                      </span>
                      <span className="text-gray-500 shrink-0 ml-2">
                        R$ {(unitPrice * regularQty).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={item.lineKey} className="flex justify-between text-sm">
                  <span>
                    {item.quantity}x {item.product.name}
                    {optionsLabel && (
                      <span className="block text-xs text-gray-400">{optionsLabel}</span>
                    )}
                    {discountedQty > 0 && (
                      <span className="block text-[11px] font-semibold" style={{ color: tenant.primaryColor }}>
                        🏷 Cupom aplicado
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500 shrink-0 ml-2">
                    R$ {(unitPrice * item.quantity).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              );
            })}
          </div>

          {orderType === 'entrega' && quote && (
            <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <MapPin size={13} />
                Endereço
              </p>
              <p className="text-sm text-gray-700">{quote.formattedAddress}</p>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500">Pagamento</p>
            <p className="text-sm text-gray-700">
              {PAYMENT_METHOD_LABELS[paymentMethod]} na {orderType === 'entrega' ? 'entrega' : 'retirada'}
            </p>
          </div>

          {customerToken && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
              <label
                htmlFor="use-cashback"
                className={`flex items-center gap-2 text-sm ${
                  cashbackBalance > 0 ? 'text-gray-700 cursor-pointer' : 'text-gray-400'
                }`}
              >
                <input
                  id="use-cashback"
                  type="checkbox"
                  checked={useCashback}
                  disabled={cashbackBalance <= 0}
                  onChange={(e) => setUseCashback(e.target.checked)}
                  className="w-4 h-4"
                />
                Usar meu saldo de cashback
              </label>
              <span className="text-xs font-semibold text-gray-500 shrink-0">
                {cashbackBalance > 0
                  ? `R$ ${cashbackBalance.toFixed(2).replace('.', ',')} disponível`
                  : 'R$ 0,00 disponível'}
              </span>
            </div>
          )}

          {customerToken && estimatedCashbackEarn > 0 && (
            <p className="text-xs text-green-600 -mt-1">
              🪙 Você vai ganhar ~R$ {estimatedCashbackEarn.toFixed(2).replace('.', ',')} de cashback
              nesse pedido.
            </p>
          )}

          <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500">Gorjeta</p>
            <p className="text-sm text-gray-700">
              {resolvedTip > 0 ? `R$ ${resolvedTip.toFixed(2).replace('.', ',')}` : 'Sem gorjeta'}
            </p>
          </div>

          {notes.trim() && (
            <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500">Observação</p>
              <p className="text-sm text-gray-700">{notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>R$ {totalPrice.toFixed(2).replace('.', ',')}</span>
            </div>
            {selectedPromotions.map((promo) => {
              const result = multiEligibility.perPromo.get(promo.id);
              if (!result?.isEligible) return null;
              return (
                <div key={promo.id} className="flex justify-between text-red-600">
                  <span>Cupom ({promo.title})</span>
                  <span>- R$ {result.discountAmount.toFixed(2).replace('.', ',')}</span>
                </div>
              );
            })}
            {orderType === 'entrega' && quote && (
              <div className="flex justify-between text-gray-500">
                <span>Taxa de entrega</span>
                <span>R$ {quote.fee.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            {cashbackToUseEstimate > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Cashback usado</span>
                <span>- R$ {cashbackToUseEstimate.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            {resolvedTip > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Gorjeta</span>
                <span>R$ {resolvedTip.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
              <span>Total</span>
              <span>R$ {displayTotal.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100">
        <button
          onClick={handlePrimaryAction}
          disabled={
            isSubmitting ||
            !activeLocation?.isOpenNow ||
            (checkoutStep === 'form' && orderType !== 'mesa' && !canProceedFromForm) ||
            (checkoutStep === 'review' && !canSubmit)
          }
          className="w-full py-3.5 rounded-xl text-white font-semibold flex justify-between items-center px-5 disabled:opacity-60"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          <span>
            {isSubmitting
              ? 'Enviando...'
              : !activeLocation?.isOpenNow
                ? 'Estabelecimento fechado'
                : orderType === 'mesa'
                  ? 'Confirmar pedido'
                  : checkoutStep === 'form'
                    ? orderType === 'entrega' && !quote
                      ? 'Calcule a taxa de entrega'
                      : 'Ir para pagamento'
                    : checkoutStep === 'payment'
                      ? 'Revisar pedido'
                      : 'Confirmar pedido'}
          </span>
          <span>R$ {displayTotal.toFixed(2).replace('.', ',')}</span>
        </button>
      </div>

      {itemPendingRemoval && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-30 max-w-md mx-auto">
          <div className="bg-white rounded-t-2xl w-full p-5 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-gray-900">Remover item?</p>
              <p className="text-sm text-gray-500 mt-1">
                {items.find((i) => i.product.id === itemPendingRemoval)?.product.name}{' '}
                será removido do seu carrinho.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setItemPendingRemoval(null)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  removeItem(itemPendingRemoval);
                  setItemPendingRemoval(null);
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
