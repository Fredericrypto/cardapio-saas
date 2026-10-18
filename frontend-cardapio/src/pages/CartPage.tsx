import { localizedField } from '../i18n/contentText';
import { paymentMethodLabel, promotionReasonLabel } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { activeDateLocale } from '../i18n/languages';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { useScrollLock } from '../hooks/useScrollLock';
import { useAccentColor } from '../hooks/useAccentColor';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, Coins, CreditCard, MapPin, AlertTriangle, Tag, X, ShoppingBag, BookOpen, QrCode } from 'lucide-react';
import { createOrder, quoteDeliveryFee, callWaiter, cancelWaiterCall, getWaiterCallStatus, cancelOrder, flagOrderForAttention, fetchLocationById, fetchActivePromotions } from '../lib/menu-api';
import { computePromotionEligibility, computeSelectedPromotionsEligibility } from '../lib/promotionEligibility';
import type { Location, DeliveryQuote, CreatedOrder, Promotion } from '../types';
import { PixWaitingPanel } from '../components/PixWaitingPanel';
import { useCart } from '../contexts/CartContext';
import { useTenant } from '../contexts/TenantContext';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { fetchMyCashbackBalance, fetchActiveCashbackSettings } from '../lib/customer-api';
import { CashbackLoginNotice } from '../components/CashbackLoginNotice';
import { GUEST_NAME_MAX, validateGuestName } from '../lib/guestName';
import type { ActiveCashbackSettings } from '../lib/customer-api';
import { CurrencyInput } from '../components/CurrencyInput';
import { PhoneInput } from '../components/PhoneInput';
import { isValidBrazilPhone } from '../lib/phone';
import { Tooltip } from '../components/Tooltip';
import { AnimatedGradientButton } from '../components/AnimatedGradientButton';
import { formatBRL } from '../lib/cartFormat';
import { MENU_BORDER, MENU_DIVIDER, MENU_PAGE_BG, MENU_SURFACE_SUBTLE } from '../lib/menuTheme';
import {
  CART_CARD,
  CART_DIVIDE,
  CART_FIELD_INPUT,
  CART_ICON_BUTTON,
  CART_INNER_BLOCK,
  CART_NOTICE_WARN,
  CART_RULE,
  CART_SECTION_LABEL,
  CART_TEXT,
  CART_TEXT_BODY,
  CART_TEXT_ERROR,
  CART_TEXT_MUTED,
  CART_TEXT_SOFT,
    CART_TEXT_SUCCESS,
} from '../lib/cartTheme';
import { CartShell } from '../components/cart/CartShell';
import { PROMO_SUCCESS_TEXT, PROMO_SERIF, PROMO_INK, PROMO_SAGE } from '../lib/promotionTheme';
import { CartItemRow, type CartLinePromotionTag } from '../components/cart/CartItemRow';
import { CartReviewItems } from '../components/cart/CartReviewItems';
import { CartOrderSummary } from '../components/cart/CartOrderSummary';
import { CartSummaryPanel } from '../components/cart/CartSummaryPanel';
import { CartField, CartSelectField, CartTextArea, CartTextField } from '../components/cart/CartField';
import { CartSegmented } from '../components/cart/CartSegmented';
import { PaymentMethodCard } from '../components/cart/PaymentMethodCard';
import { CardPaymentPanel } from '../components/cart/CardPaymentPanel';
import { RemoveItemModal } from '../components/cart/RemoveItemModal';
import { OrderCancelledScreen, OrderSuccessScreen, PixFailedScreen } from '../components/cart/OrderResultScreens';
import type { OrderSnapshot } from '../components/cart/orderSnapshot';

const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const TIP_PERCENT_OPTIONS = [0, 10, 15] as const;

// Só balcão/entrega passam por "pagamento" + "revisão" antes de enviar —
// mesa não tem essas etapas porque o pagamento de verdade acontece depois,
// com o admin, ao fechar a conta. Pix pode ser só informativo (o padrão,
// se o restaurante não configurou nada em Configurações) ou "de verdade"
// (QR com valor já preenchido, pedido só entra na cozinha depois que o
// admin confirma o recebimento) — ver PixWaitingPanel, decidido pelo
// backend a partir de tenant.pixEnabled, nunca pelo frontend.
type CheckoutStep = 'form' | 'payment' | 'review';

export function CartPage() {
  const { t } = useI18n();
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  const tableSessionCtx = useTableSessionContext();
  const session = tableSessionCtx?.session ?? null;
  const isTableFlow = Boolean(qrCodeToken);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showCouponPicker, setShowCouponPicker] = useState(false);
  const { tenant } = useTenant();
  // Cor da marca pronta para texto/contorno (clareada no escuro). Hooks ficam
  // ANTES de qualquer return antecipado.
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  // Painel lateral só existe a partir de lg: o card do método de pagamento é
  // montado num lugar só (painel no desktop; coluna principal no resto).
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { location: selectedLocation } = useSelectedLocation(!isTableFlow ? tenant?.id : undefined);
  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  useEffect(() => {
    if (!isTableFlow || !tenant || !session?.table?.locationId) return;
    fetchLocationById(tenant.id, session.table.locationId).then(setTableLocation);
  }, [isTableFlow, tenant, session?.table?.locationId]);
  const activeLocation = isTableFlow ? tableLocation : selectedLocation;
  // Aberto/fechado no momento exato (virada de minuto, fuso de Brasília).
  const storeIsOpen = useStoreStatus(activeLocation).isOpen;

  const { token: customerToken, customer } = useCustomerAuth();
  const [customerName, setCustomerName] = useState('');
  // Feedback mínimo de "nome obrigatório" no fluxo de mesa sem conta —
  // só liga depois de uma tentativa real de continuar sem nome (nunca
  // de cara, isso seria irritante); soma sozinho assim que o cliente
  // digita alguma coisa.
  const [showNameRequired, setShowNameRequired] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
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
  // Visitante (sem conta): o nome segue a regra de 01/10 (4–16, começa com
  // letra, sem especiais, 4 = só letras). Logado usa o nome da conta.
  const guestNameError = !customerToken && !hasSavedName ? validateGuestName(customerName) : null;
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
  // Modal "Remover item?" aberto: a página atrás não rola.
  useScrollLock(itemPendingRemoval !== null);

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
        setQuoteError(t('cartPage.nao_conseguimos_recalcular_a')),
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
          t('cartPage.nao_conseguimos_calcular_a'),
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
    if (!activeLocation || !storeIsOpen) return; // botão já deveria estar desabilitado, defesa extra
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
      // Pedido do Felipe (16/09): nunca mostrar texto cru de um erro
      // inesperado (5xx) pro cliente — só confia na mensagem do backend
      // quando é um erro 4xx de propósito (as que eu mesmo escrevo em
      // português simples, tipo "você tem Mesa 1 em aberto...").
      const response =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number; data?: { message?: string } } }).response
          : undefined;
      const status = response?.status;
      const backendMessage =
        status && status >= 400 && status < 500 ? response?.data?.message : undefined;
      // BUG CORRIGIDO: quando o pedido falha porque a mesa já foi
      // fechada (garçom fechou a conta, ou expirou) pelo lado de lá
      // enquanto o cliente ainda estava com a página aberta, o header
      // continuava mostrando "Mesa X" normalmente até a próxima
      // varredura de fundo (até 20s depois) ou até o cliente navegar de
      // novo — dava a impressão de "a mesa não fechou direito". Rechecar
      // na hora, a cada falha de pedido de mesa (qualquer motivo — mais
      // simples e mais confiável que tentar reconhecer a mensagem exata
      // do backend), atualiza a tela pro estado real imediatamente.
      if (orderType === 'mesa') {
        tableSessionCtx?.recheckExpiry();
      }
      setErrorMessage(
        backendMessage ?? t('cartPage.nao_foi_possivel_enviar'),
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
      await callWaiter(tenant.id, session.id, customerToken);
      setIsWaiterCallPending(true);
    } catch {
      setCallWaiterError(t('cartPage.nao_foi_possivel_chamar'));
    } finally {
      setIsCallingWaiter(false);
    }
  }

  // "Cancelar chamar garçom" — pro caso de ter clicado sem querer.
  async function handleCancelWaiterCall() {
    if (!tenant || !session) return;
    try {
      await cancelWaiterCall(tenant.id, session.id, customerToken);
    } finally {
      setIsWaiterCallPending(false);
    }
  }

  async function handleCancelOrder() {
    if (!tenant || !successOrder) return;
    if (!confirm(t('cartPage.cancelar_esse_pedido_essa'))) return;
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
        backendMessage ?? t('cartPage.nao_foi_possivel_cancelar'),
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
      setFlagAttentionError(backendMessage ?? t('cartPage.nao_foi_possivel_chamar_2'));
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
    Boolean(activeLocation) &&
    storeIsOpen &&
    customerName.trim().length > 0 &&
    !guestNameError &&
    isValidBrazilPhone(customerPhone) &&
    (orderType !== 'entrega' || Boolean(quote));

  // Pedido do Felipe: fluxo de convidado (sem conta) na mesa continua
  // sem exigir NADA além disso — mas o nome passa a ser obrigatório
  // (facilita o garçom chamar quem pediu, já que várias pessoas podem
  // estar na mesma mesa sem conta nenhuma). Telefone continua não
  // pedido na mesa — só faz sentido pra balcão/entrega, onde pode ser
  // usado pra contato.
  const canProceedMesa = hasSavedName || (customerName.trim().length > 0 && !guestNameError);

  // Mesa não tem etapa de pagamento/revisão — vai direto pro envio, igual
  // sempre foi (o pagamento acontece depois, em pessoa, com o admin).
  function handlePrimaryAction() {
    if (orderType === 'mesa') {
      if (!canProceedMesa) {
        setShowNameRequired(true);
        setErrorMessage(null);
        return;
      }
      setShowNameRequired(false);
      setErrorMessage(null);
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
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#6B7280] dark:border-white/10 dark:border-t-[#C4C7C5] rounded-full animate-spin" />
      </div>
    );
  }

  const shellProps = {
    tenant,
    slug: slug!,
    qrCodeToken,
    contextLabel: activeLocation?.name,
  };
  const goToMenu = () => navigate(isTableFlow ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`);

  // Área de informações do pedido, depois de enviado — mostra o que foi
  // decidido na etapa de pagamento também, pra confirmar tudo de uma vez.
  // Se o restaurante tem Pix "de verdade" habilitado, primeiro mostra o
  // QR + contador de 6min (PixWaitingPanel) até o admin confirmar — só
  // depois disso (ou se nunca foi Pix real) mostra a tela de "Pedido
  // enviado!" de sempre.
  if (successOrder && orderSnapshot) {
    if (orderCancelledByCustomer) {
      return (
        <CartShell {...shellProps}>
          <OrderCancelledScreen />
        </CartShell>
      );
    }

    if (
      successOrder.status === 'aguardando_pagamento' &&
      pixState === 'waiting' &&
      successOrder.paymentMethod === 'cartao'
    ) {
      // Cartão online (Mercado Pago): o pagamento acontece agora, nos campos
      // seguros do SDK. O valor aqui é só para exibir; o backend cobra o total
      // gravado no pedido (em centavos, sem confiar neste número).
      const displayAmount =
        (Math.round(Number(successOrder.total ?? 0) * 100) + Math.round(orderSnapshot.tipAmount * 100)) / 100;
      return (
        <CartShell {...shellProps}>
          <CardPaymentPanel
            tenant={tenant}
            order={successOrder}
            displayAmount={displayAmount}
            onConfirmed={() => setPixState('confirmed')}
            onExpired={() => setPixState('expired')}
            onBackToMenu={() => {
              setSuccessOrder(null);
              goToMenu();
            }}
          />
        </CartShell>
      );
    }

    if (successOrder.status === 'aguardando_pagamento' && pixState === 'waiting') {
      return (
        <CartShell {...shellProps}>
          <div className="min-h-[60vh] flex flex-col items-center justify-center max-w-md mx-auto py-6">
            <PixWaitingPanel
              tenant={tenant}
              order={successOrder}
              onConfirmed={() => setPixState('confirmed')}
              onExpired={() => setPixState('expired')}
              onCancelledByRestaurant={() => setPixState('cancelled')}
            />
          </div>
        </CartShell>
      );
    }

    if (pixState === 'expired' || pixState === 'cancelled') {
      return (
        <CartShell {...shellProps}>
          <PixFailedScreen
            cancelledByRestaurant={pixState === 'cancelled'}
            tenantName={tenant.name}
            primaryColor={tenant.primaryColor}
            onBackToMenu={() => {
              setSuccessOrder(null);
              goToMenu();
            }}
          />
        </CartShell>
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

    return (
      <CartShell {...shellProps}>
        <OrderSuccessScreen
          tenant={tenant}
          successOrder={successOrder}
          orderSnapshot={orderSnapshot}
          pixState={pixState}
          isTableFlow={isTableFlow}
          isWaiterCallPending={isWaiterCallPending}
          isCallingWaiter={isCallingWaiter}
          callWaiterError={callWaiterError}
          onCallWaiter={handleCallWaiter}
          onCancelWaiterCall={handleCancelWaiterCall}
          canFlagAttention={canFlagAttention}
          attentionFlagged={attentionFlagged}
          isFlaggingAttention={isFlaggingAttention}
          flagAttentionError={flagAttentionError}
          onFlagAttention={handleFlagAttention}
          canStillCancelOrder={canStillCancelOrder}
          isCancellingOrder={isCancellingOrder}
          cancelOrderError={cancelOrderError}
          onCancelOrder={handleCancelOrder}
          onBackToMenu={goToMenu}
        />
      </CartShell>
    );
  }

  if (items.length === 0) {
    return (
      <CartShell {...shellProps}>
        <div className="min-h-[55vh] flex flex-col items-center justify-center px-4 text-center">
          <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center ${MENU_SURFACE_SUBTLE} ${MENU_BORDER}`}>
            <ShoppingBag size={26} strokeWidth={1.5} className={CART_TEXT_MUTED} aria-hidden="true" />
          </div>
          <p className={`mt-5 text-base font-semibold ${CART_TEXT}`}>{t('cartPage.seu_carrinho_esta_vazio')}</p>
          <p className={`mt-1 text-sm ${CART_TEXT_BODY}`}>{t('cartPage.adicione_itens_do_cardapio')}</p>
          {/* Mesmo visual do botão "Chamar garçom". */}
          <button
            type="button"
            onClick={goToMenu}
            className="mt-6 w-full max-w-[220px] rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white ring-1 ring-black/5 dark:ring-white/15"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            <BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('cartPage.ver_cardapio')}
          </button>
        </div>
      </CartShell>
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

  // Quais promoções (com nome e economia da linha) estão aplicadas a uma linha
  // — a etiqueta "Promoção X aplicada" do item. Mesma fonte do desconto cobrado.
  function promotionTagsFor(lineKey: string): CartLinePromotionTag[] {
    return (multiEligibility.applicationsByLine.get(lineKey) ?? []).flatMap((application) => {
      const promo = selectedPromotions.find((p) => p.id === application.promotionId);
      return promo
        ? [
            {
              promotionId: promo.id,
              title: localizedField(promo, 'title'),
              units: application.units,
              discountAmount: application.discountAmount,
            },
          ]
        : [];
    });
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
      ? Boolean(activeLocation) && storeIsOpen
      : checkoutStep === 'review' && Boolean(activeLocation) && storeIsOpen && (orderType !== 'entrega' || Boolean(quote));
  const deliveryAvailable = activeLocation?.latitude != null && activeLocation?.longitude != null;
  const orderTypeOptions = (['mesa', 'balcao', 'entrega'] as const).filter(
    (type) =>
      (type !== 'mesa' || isTableFlow) &&
      // Pedido do Felipe: quem já escaneou o QR da mesa não precisa (e
      // não deve) ver "Balcão" como opção — é redundante, ele já está
      // fisicamente identificado numa mesa. Só "Entrega" continua
      // fazendo sentido como alternativa (ex: pedir pra alguém em casa
      // enquanto está no restaurante).
      (type !== 'balcao' || !isTableFlow) &&
      (type !== 'entrega' || deliveryAvailable),
  );

  const showFormStep = orderType === 'mesa' || checkoutStep === 'form';
  const showPaymentStep = orderType !== 'mesa' && checkoutStep === 'payment';
  const showReviewStep = orderType !== 'mesa' && checkoutStep === 'review';

  const summaryCoupons = selectedPromotions.flatMap((promo) => {
    const result = multiEligibility.perPromo.get(promo.id);
    return result?.isEligible
      ? [{ id: promo.id, title: localizedField(promo, 'title'), discount: result.discountAmount }]
      : [];
  });

  const orderSummary = (
    <CartOrderSummary
      totalPrice={totalPrice}
      coupons={summaryCoupons}
      deliveryFee={orderType === 'entrega' && quote ? quote.fee : null}
      cashbackUsed={cashbackToUseEstimate}
      tip={resolvedTip}
      total={displayTotal}
    />
  );

  // Rótulo do botão grande de baixo. Enquanto a loja ainda carrega
  // (`activeLocation` nulo) NÃO mostra "fechado" — é neutro.
  const primaryButtonLabel = isSubmitting
    ? t('cartUi.sending')
    : !activeLocation
      ? t('common.loading')
      : !storeIsOpen
        ? t('cartPage.estabelecimento_fechado')
        : orderType === 'mesa'
          ? t('cartPage.confirmar_pedido')
          : checkoutStep === 'form'
            ? orderType === 'entrega' && !quote
              ? t('cartPage.calcule_a_taxa_de')
              : t('cartPage.ir_para_pagamento')
            : checkoutStep === 'payment'
              ? t('cartPage.revisar_pedido')
              : t('cartPage.confirmar_pedido');

  const primaryButton = (
    <AnimatedGradientButton
      onClick={handlePrimaryAction}
      disabled={
        isSubmitting ||
        !activeLocation || !storeIsOpen ||
        (checkoutStep === 'form' && orderType !== 'mesa' && !canProceedFromForm) ||
        (checkoutStep === 'review' && !canSubmit)
      }
      // No carrinho o preenchimento segue a cor da marca nos dois temas (como antes).
      fillClassName="bg-[var(--brand)] text-white"
      contentClassName="py-3.5 font-semibold flex justify-between items-center gap-3 px-5"
    >
      {/* `key` = o texto/total viram nós NOVOS do DOM quando mudam (a
          loja carrega depois de montar e o rótulo troca): pintura
          garantida, em vez de depender de o navegador repintar um
          nó antigo (ver o bug do texto que só aparecia ao tocar). */}
      <span key={primaryButtonLabel} className="min-w-0 text-left leading-tight">{primaryButtonLabel}</span>
      <span key={displayTotal.toFixed(2)} className="shrink-0 whitespace-nowrap">{formatBRL(displayTotal)}</span>
    </AnimatedGradientButton>
  );

  const stepTitle = showPaymentStep
    ? t('receiptContent.pagamento')
    : showReviewStep
      ? t('cartPage.revisar_pedido')
      : t('cartPage.seu_pedido');

  const paymentMethodCard = showPaymentStep ? (
    <PaymentMethodCard
      method={paymentMethod}
      total={displayTotal}
      orderType={orderType === 'entrega' ? 'entrega' : 'balcao'}
      cardOnline={Boolean(tenant.cardCheckoutOnline)}
      pixVariant={
        tenant.pixCheckoutOnline ? 'online' : tenant.pixEnabled && tenant.pixKey ? 'qr' : 'info'
      }
    />
  ) : null;

  const orderTypeLabel = (type: 'balcao' | 'mesa' | 'entrega') =>
    type === 'balcao'
      ? t('receiptContentStandalone.balcao')
      : type === 'mesa'
        ? t('receiptContent.mesa')
        : t('receiptContentStandalone.entrega');

  const nameInvalid = (showNameRequired || nameTouched) && Boolean(guestNameError);
  const phoneInvalid = customerPhone.length > 0 && !isValidBrazilPhone(customerPhone);
  const paymentOptions = [
    { method: 'dinheiro', Icon: Banknote },
    { method: 'cartao', Icon: CreditCard },
    { method: 'pix', Icon: QrCode },
  ] as const;

  return (
    <CartShell {...shellProps} actionBar={primaryButton}>
      {/* Desktop (lg+): 2 colunas — título e itens à esquerda, painel de
          resumo/pagamento à direita. Celular e tablet: coluna única. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] lg:gap-8 xl:gap-12 lg:items-start">
        <div className="min-w-0 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Tooltip label={t('tooltip.back')}>
              <button
                type="button"
                onClick={handleBack}
                aria-label={t('tooltip.back')}
                className={`${CART_ICON_BUTTON} border ${MENU_DIVIDER}`}
              >
                <ArrowLeft size={18} strokeWidth={1.5} />
              </button>
            </Tooltip>
            <h1 className={`text-3xl md:text-4xl font-light italic leading-tight ${PROMO_INK}`} style={{ fontFamily: PROMO_SERIF }}>{stepTitle}</h1>
          </div>

          {showFormStep && (
            <>
              <section aria-label={t('cartPage.itens')}>
                <div className={CART_DIVIDE}>
                  {items.map((item) => (
                    <CartItemRow
                      key={item.lineKey}
                      item={item}
                      primaryColor={tenant.primaryColor}
                      discountedQty={discountedQtyFor(item.lineKey)}
                      promotionTags={promotionTagsFor(item.lineKey)}
                      onIncrease={increaseItem}
                      onDecrease={decreaseItem}
                      onRequestRemoval={setItemPendingRemoval}
                    />
                  ))}
                </div>
                {/* Subtotal grande no rodapé da lista: rótulo pequeno + valor leve. */}
                <div className={`flex items-baseline justify-end gap-4 pt-5 ${CART_RULE}`}>
                  <span className={`text-sm ${CART_TEXT_BODY}`}>{t('closingPaymentSheet.subtotal')}</span>
                  <span className={`text-4xl md:text-5xl font-light tabular-nums ${PROMO_SAGE}`} style={{ fontFamily: PROMO_SERIF }}>{formatBRL(totalPrice)}</span>
                </div>
                {appliedDiscountAmount > 0 && (
                  <p className={`flex items-center justify-end gap-1.5 pt-2 text-sm font-semibold ${PROMO_SUCCESS_TEXT}`}>
                    <Tag size={14} strokeWidth={1.5} aria-hidden="true" />
                    {t('cartPage.promoTotalSaving', { value: appliedDiscountAmount.toFixed(2).replace('.', ',') })}
                  </p>
                )}
              </section>

              <div className={CART_CARD}>
                {selectedPromotions.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {selectedPromotions.map((promo) => {
                      const result = multiEligibility.perPromo.get(promo.id);
                      return (
                        <div
                          key={promo.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${MENU_SURFACE_SUBTLE} ${MENU_BORDER}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Tag size={15} strokeWidth={1.5} style={{ color: accent }} className="shrink-0" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${CART_TEXT_SOFT}`}>{localizedField(promo, 'title')}</p>
                              <p className={`text-xs ${CART_TEXT_MUTED}`}>
                                {result?.isEligible
                                  ? `- ${formatBRL(result.discountAmount)}`
                                  : promotionReasonLabel(result, t) ?? t('cartPage.nao_elegivel_pra_esse')}
                              </p>
                            </div>
                          </div>
                          <Tooltip label={t('tooltip.removeCoupon')}>
                            <button
                              type="button"
                              onClick={() => togglePromotion(promo.id)}
                              aria-label={t('tooltip.removeCoupon')}
                              className={CART_ICON_BUTTON}
                            >
                              <X size={16} strokeWidth={1.5} />
                            </button>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  aria-expanded={showCouponPicker}
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
                  className="w-full flex items-center justify-between gap-3 text-sm"
                >
                  <span className={`flex items-center gap-2 font-semibold ${CART_TEXT_SOFT}`}>
                    <Tag size={15} strokeWidth={1.5} className={CART_TEXT_MUTED} aria-hidden="true" />
                    {selectedPromotions.length > 0 ? t('cartPage.adicionar_outro_cupom') : t('cartPage.usar_um_cupom')}
                  </span>
                  <span className={`text-xs ${CART_TEXT_MUTED}`}>
                    {availablePromotionsCount > 0
                      ? t('cartPage.availablepromotionscount_disponivel_is', { availablePromotionsCount: availablePromotionsCount })
                      : t('cartPage.nenhum_disponivel')}
                  </span>
                </button>

                {showCouponPicker && promotions.some((p) => !p.alreadyUsedUp) && (
                  <div className="mt-3 flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                    {/* Cada cupom pode ser ligado/desligado independente dos
                        outros — o cliente escolhe quantos quiser. A
                        elegibilidade de cada linha já considera o que os
                        OUTROS cupons selecionados reivindicaram. Cupons já
                        ESGOTADOS pra esse cliente nem aparecem (é
                        permanente, diferente de "ainda não elegível"). */}
                    {promotions
                      .filter((p) => !p.alreadyUsedUp)
                      .map((promo) => {
                        const isSelected = selectedPromotionIds.includes(promo.id);
                        const previewOrder = isSelected ? selectedPromotions : [...selectedPromotions, promo];
                        const preview = computeSelectedPromotionsEligibility(previewOrder, items, totalPrice);
                        const result = preview.perPromo.get(promo.id);
                        // Só pode SELECIONAR um cupom não elegível pra esse
                        // carrinho — desmarcar continua sempre liberado,
                        // senão um cupom que deixasse de ser elegível
                        // DEPOIS de selecionado ficaria preso.
                        const canToggle = isSelected || Boolean(result?.isEligible);
                        return (
                          <button
                            type="button"
                            key={promo.id}
                            onClick={() => canToggle && togglePromotion(promo.id)}
                            disabled={!canToggle}
                            aria-pressed={isSelected}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                              isSelected ? '' : 'border-[#E5E7EB] dark:border-white/10'
                            }`}
                            style={
                              isSelected
                                ? { borderColor: accent, backgroundColor: `${tenant.primaryColor}0D` }
                                : undefined
                            }
                          >
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${CART_TEXT_SOFT}`}>{localizedField(promo, 'title')}</p>
                              <p className={`text-xs ${CART_TEXT_MUTED}`}>
                                {result?.isEligible
                                  ? t('cartPage.economize_r_v0', { v0: result.discountAmount.toFixed(2).replace('.', ',') })
                                  : (promotionReasonLabel(result, t) ?? t('cartPage.nao_elegivel_pra_esse'))}
                              </p>
                            </div>
                            {/* Vários cupons podem ficar marcados: caixa de seleção (quadrada). */}
                            <span
                              className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center text-white ${
                                isSelected ? '' : 'border-[#D1D5DB] dark:border-white/25'
                              }`}
                              style={isSelected ? { borderColor: accent, backgroundColor: tenant.primaryColor } : undefined}
                              aria-hidden="true"
                            >
                              {isSelected && <Check size={13} strokeWidth={2} />}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className={`${CART_CARD} flex flex-col gap-4`}>
                <div>
                  <p className={CART_SECTION_LABEL}>{t('cartPage.como_voce_quer_receber')}</p>
                  <div className="mt-1.5">
                    <CartSegmented<'balcao' | 'mesa' | 'entrega'>
                      ariaLabel={t('cartPage.como_voce_quer_receber')}
                      primaryColor={tenant.primaryColor}
                      value={orderType}
                      onChange={setOrderType}
                      options={orderTypeOptions.map((type) => ({ value: type, label: orderTypeLabel(type) }))}
                    />
                  </div>
                  {/* Aviso — quem está na mesa e ainda assim escolhe Entrega
                      precisa entender que isso NÃO fecha/afeta a conta da
                      mesa, são coisas separadas. O aviso simétrico pro admin
                      vem do campo `placedWhileAtTable` setado no backend. */}
                  {isTableFlow && orderType === 'entrega' && (
                    <p className={`text-[11px] rounded-lg px-2.5 py-2 mt-2 ${CART_NOTICE_WARN}`}>
                      {t('cartPage.voce_esta_na_mesa')} {session?.table?.number} {t('cartPage.agora_pedir_entrega_e')}
                    </p>
                  )}
                </div>

                {!hasSavedName && (
                  <div className="flex flex-col gap-1">
                    <CartTextField
                      label={t('auth.namePlaceholder')}
                      type="text"
                      value={customerName}
                      invalid={nameInvalid}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (e.target.value.trim()) setShowNameRequired(false);
                      }}
                      onBlur={() => setNameTouched(true)}
                      maxLength={GUEST_NAME_MAX}
                      autoComplete="off"
                    />
                    {nameInvalid && <p className={`text-xs px-0.5 ${CART_TEXT_ERROR}`}>{guestNameError}</p>}
                  </div>
                )}
                {orderType !== 'mesa' && !hasSavedPhone && (
                  <CartField label={t('cartUi.phone')} invalid={phoneInvalid}>
                    <PhoneInput value={customerPhone} onChange={setCustomerPhone} className={CART_FIELD_INPUT} />
                  </CartField>
                )}
                {(hasSavedName || (orderType !== 'mesa' && hasSavedPhone)) && (
                  <p className={`text-xs ${CART_TEXT_MUTED}`}>
                    {t('cartPage.usando_os_dados_da')}{hasSavedName ? ` (${customer!.name}` : ''}
                    {hasSavedName && orderType !== 'mesa' && hasSavedPhone ? ', ' : ''}
                    {orderType !== 'mesa' && hasSavedPhone ? customer!.phone : ''}
                    {hasSavedName ? ')' : ''}
                  </p>
                )}

                {orderType === 'entrega' && (
                  <div className={`flex flex-col gap-3 rounded-xl border p-3 md:p-4 ${MENU_DIVIDER}`}>
                    <p className={`${CART_SECTION_LABEL} flex items-center gap-1.5`}>
                      <MapPin size={13} strokeWidth={1.5} aria-hidden="true" />
                      {t('cartPage.endereco_de_entrega')}
                    </p>

                    <div className="flex gap-2">
                      <CartTextField
                        className="flex-[2] min-w-0"
                        label={t('address.street')}
                        value={deliveryStreet}
                        onChange={(e) => updateDeliveryField(setDeliveryStreet)(e.target.value)}
                      />
                      <CartTextField
                        className="flex-1 min-w-0"
                        label={t('cartPage.numero')}
                        value={deliveryAddressNumber}
                        onChange={(e) => updateDeliveryField(setDeliveryAddressNumber)(e.target.value)}
                      />
                    </div>

                    <CartTextField
                      label={t('cartPage.bairro')}
                      value={deliveryNeighborhood}
                      onChange={(e) => updateDeliveryField(setDeliveryNeighborhood)(e.target.value)}
                    />

                    <div className="flex gap-2">
                      <CartTextField
                        className="flex-[2] min-w-0"
                        label={t('cartPage.cidade')}
                        value={deliveryCity}
                        onChange={(e) => updateDeliveryField(setDeliveryCity)(e.target.value)}
                      />
                      <CartSelectField
                        className="flex-1 min-w-0"
                        label={t('cartPage.uf')}
                        value={deliveryState}
                        onChange={(e) => updateDeliveryField(setDeliveryState)(e.target.value)}
                      >
                        <option value=""></option>
                        {BRAZIL_STATES.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </CartSelectField>
                    </div>

                    <CartTextField
                      label={t('cartPage.cep_opcional_ajuda_na')}
                      value={deliveryPostcode}
                      onChange={(e) => updateDeliveryField(setDeliveryPostcode)(e.target.value)}
                    />

                    <CartTextField
                      label={t('cartPage.ponto_de_referencia_opcional')}
                      value={deliveryReferencePoint}
                      onChange={(e) => setDeliveryReferencePoint(e.target.value)}
                    />

                    {!quote && (
                      <button
                        type="button"
                        onClick={handleQuoteDelivery}
                        disabled={!deliveryFieldsFilled || isQuoting}
                        className="py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50"
                        style={{ borderColor: accent, color: accent }}
                      >
                        {isQuoting ? t('cartUi.calculating') : t('cartPage.calcular_taxa_de_entrega')}
                      </button>
                    )}

                    {quoteError && <p className={`text-xs ${CART_TEXT_ERROR}`}>{quoteError}</p>}

                    {quote && (
                      <div className={`${CART_INNER_BLOCK} p-3 flex flex-col gap-1`}>
                        <p className={`text-xs ${CART_TEXT_BODY}`}>{t('cartPage.endereco_confirmado')}</p>
                        <p className={`text-sm font-medium ${CART_TEXT_SOFT}`}>{quote.formattedAddress}</p>
                        <p className={`text-xs mt-1 ${CART_TEXT_BODY}`}>
                          {t('cart.distanceAndFee', { km: quote.distanceKm.toFixed(1), fee: quote.fee.toFixed(2).replace('.', ',') })}
                        </p>
                        {!quote.precise && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1 mt-1">
                            <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" aria-hidden="true" />
                            {t('cartPage.nao_conseguimos_confirmar_o')}
                          </p>
                        )}
                        <Tooltip label={t('cartPage.recalcular')} className="self-start">
                          <button
                            type="button"
                            onClick={() => setQuote(null)}
                            aria-label={t('cartPage.recalcular')}
                            className={`text-xs font-semibold underline mt-1 ${CART_TEXT_BODY}`}
                          >
                            {t('cartPage.recalcular')}
                          </button>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                )}

                <CartTextArea
                  label={t('cartPage.alguma_observacao_opcional')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={280}
                  rows={2}
                  placeholder={t('cartPage.ex_sem_cebola_ponto')}
                />
              </div>

              {orderType !== 'mesa' && (
                <div className={`${CART_CARD} flex flex-col gap-3`}>
                  <p className={CART_SECTION_LABEL}>
                    {t('closingPaymentSheet.gorjeta')} {orderType === 'entrega' ? t('cartPage.para_o_entregador') : t('cartUi.optional')}
                  </p>
                  <CartSegmented<0 | 10 | 15 | 'custom'>
                    ariaLabel={t('closingPaymentSheet.gorjeta')}
                    primaryColor={tenant.primaryColor}
                    value={tipSelection}
                    onChange={(value) => {
                      if (value !== 'custom') handleSelectTipPercent(value);
                    }}
                    options={TIP_PERCENT_OPTIONS.map((percent) => ({
                      value: percent,
                      label: percent === 0 ? t('cartPage.sem_gorjeta') : `${percent}%`,
                      tooltip:
                        percent === 0
                          ? t('cartPage.sem_gorjeta')
                          : `${t('closingPaymentSheet.gorjeta')} ${percent}%`,
                    }))}
                  />
                  <CartField label={t('cartPage.outro_valor_r')}>
                    <CurrencyInput
                      valueCents={tipSelection === 'custom' ? tipAmountCents : 0}
                      onChangeCents={(cents) => {
                        setTipSelection('custom');
                        setTipAmountCents(cents);
                      }}
                      className={CART_FIELD_INPUT}
                    />
                  </CartField>
                </div>
              )}

              {errorMessage && (
                <p role="alert" className={`text-xs lg:hidden ${CART_TEXT_ERROR}`}>
                  {errorMessage}
                </p>
              )}
            </>
          )}

          {showPaymentStep && (
            <div className={`${CART_CARD} flex flex-col gap-4`}>
              <p className={`text-xs ${CART_TEXT_BODY}`}>
                {/* Com pagamento online ativo, a frase antiga ("ainda não processamos
                    pagamento") seria falsa: cada método explica o seu fluxo no card. */}
                {tenant.cardCheckoutOnline || tenant.pixCheckoutOnline
                  ? t('cartPayment.chooseMethod')
                  : `${t('cartPage.como_voce_prefere_pagar')} ${orderType === 'entrega' ? t('cartPage.na_entrega') : t('cartPage.na_retirada')}${t('cartPage.ainda_nao_processamos_pagamento')}`}
              </p>

              <div role="radiogroup" aria-label={t('receiptContent.pagamento')} className="grid grid-cols-3 gap-2">
                {paymentOptions.map(({ method, Icon }) => {
                  const isSelected = paymentMethod === method;
                  return (
                    <Tooltip key={method} label={paymentMethodLabel(method, t)} className="flex">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={paymentMethodLabel(method, t)}
                        onClick={() => setPaymentMethod(method)}
                        className={`relative w-full flex flex-col items-center gap-2 py-3.5 px-2 rounded-xl border text-xs font-semibold transition-colors ${CART_TEXT_SOFT} ${
                          isSelected ? '' : 'border-[#E5E7EB] hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10'
                        }`}
                        style={
                          isSelected
                            ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}`, backgroundColor: `${tenant.primaryColor}1F` }
                            : undefined
                        }
                      >
                        {isSelected && (
                          <span
                            className="absolute top-1.5 right-1.5 w-4 h-4 rounded-md flex items-center justify-center text-white"
                            style={{ backgroundColor: tenant.primaryColor }}
                            aria-hidden="true"
                          >
                            <Check size={11} strokeWidth={2} />
                          </span>
                        )}
                        <Icon size={22} strokeWidth={1.5} aria-hidden="true" style={isSelected ? { color: accent } : undefined} />
                        {paymentMethodLabel(method, t)}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Celular/tablet: o card do método fica aqui; no desktop vive no painel. */}
              {!isDesktop && paymentMethodCard}
            </div>
          )}

          {showReviewStep && (
            <div className={`${CART_CARD} flex flex-col gap-4`}>
              <div className={`flex items-center gap-2.5 rounded-xl p-3 ${MENU_SURFACE_SUBTLE}`}>
                {tenant.logoUrl ? (
                  <img
                    src={tenant.logoUrl}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-9 h-9 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: tenant.primaryColor }}
                  >
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold truncate ${CART_TEXT}`}>{tenant.name}</p>
                  <p className={`text-xs ${CART_TEXT_MUTED}`}>
                    {new Date().toLocaleString(activeDateLocale(), {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {orderType === 'entrega' ? t('receiptContentStandalone.entrega') : t('receiptContentStandalone.balcao')}
                  </p>
                </div>
              </div>

              {customerName && (
                <div className="flex flex-col gap-1">
                  <p className={CART_SECTION_LABEL}>{t('receiptContent.cliente')}</p>
                  <p className={`text-sm ${CART_TEXT_SOFT}`}>{customerName}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <p className={CART_SECTION_LABEL}>{t('cartPage.itens')}</p>
                <CartReviewItems items={items} discountedQtyFor={discountedQtyFor} primaryColor={tenant.primaryColor} />
              </div>

              {orderType === 'entrega' && quote && (
                <div className={`flex flex-col gap-1 pt-3 ${CART_RULE}`}>
                  <p className={`${CART_SECTION_LABEL} flex items-center gap-1.5`}>
                    <MapPin size={13} strokeWidth={1.5} aria-hidden="true" />
                    {t('receiptContentStandalone.endereco')}
                  </p>
                  <p className={`text-sm ${CART_TEXT_SOFT}`}>{quote.formattedAddress}</p>
                </div>
              )}

              <div className={`flex flex-col gap-1 pt-3 ${CART_RULE}`}>
                <p className={CART_SECTION_LABEL}>{t('receiptContent.pagamento')}</p>
                <p className={`text-sm ${CART_TEXT_SOFT}`}>
                  {t(orderType === 'entrega' ? 'cart.payOnDelivery' : 'cart.payOnPickup', { method: paymentMethodLabel(paymentMethod, t) })}
                </p>
              </div>

              {/* Convidado: nenhum acesso ao cashback — só o aviso + botão pro
                  login, que volta pra ESTE carrinho (decisão de 30/09). */}
              {!customerToken && (
                <div className={`pt-3 ${CART_RULE}`}>
                  <CashbackLoginNotice
                    returnTo={`${location.pathname}${location.search}`}
                    primaryColor={tenant.primaryColor}
                  />
                </div>
              )}

              {customerToken && (
                <div className={`flex items-center justify-between gap-3 pt-3 ${CART_RULE}`}>
                  <label
                    htmlFor="use-cashback"
                    className={`flex items-center gap-2 text-sm ${cashbackBalance > 0 ? `${CART_TEXT_SOFT} cursor-pointer` : CART_TEXT_MUTED}`}
                  >
                    <input
                      id="use-cashback"
                      type="checkbox"
                      checked={useCashback}
                      disabled={cashbackBalance <= 0}
                      onChange={(e) => setUseCashback(e.target.checked)}
                      className="w-4 h-4"
                      style={{ accentColor: tenant.primaryColor }}
                    />
                    {t('cartPage.usar_meu_saldo_de')}
                  </label>
                  <span className={`text-xs font-semibold shrink-0 ${CART_TEXT_BODY}`}>
                    {cashbackBalance > 0
                      ? t('cartPage.r_v0_disponivel', { v0: cashbackBalance.toFixed(2).replace('.', ',') })
                      : t('cartPage.r_0_00_disponivel')}
                  </span>
                </div>
              )}

              {customerToken && estimatedCashbackEarn > 0 && (
                <p className={`text-xs -mt-1 flex items-center gap-1 ${CART_TEXT_SUCCESS}`}>
                  <Coins size={12} strokeWidth={1.5} aria-hidden="true" />
                  {t('cartPage.voce_vai_ganhar_r')} {estimatedCashbackEarn.toFixed(2).replace('.', ',')} {t('cartPage.de_cashback_nesse_pedido')}
                </p>
              )}

              <div className={`flex flex-col gap-1 pt-3 ${CART_RULE}`}>
                <p className={CART_SECTION_LABEL}>{t('closingPaymentSheet.gorjeta')}</p>
                <p className={`text-sm ${CART_TEXT_SOFT}`}>
                  {resolvedTip > 0 ? formatBRL(resolvedTip) : t('cartPage.sem_gorjeta')}
                </p>
              </div>

              {notes.trim() && (
                <div className={`flex flex-col gap-1 pt-3 ${CART_RULE}`}>
                  <p className={CART_SECTION_LABEL}>{t('cartPage.observacao_2')}</p>
                  <p className={`text-sm ${CART_TEXT_SOFT}`}>{notes}</p>
                </div>
              )}

              {/* Celular/tablet: o resumo fica no fim da revisão. Desktop: vive no painel lateral. */}
              <div className={`pt-3 lg:hidden ${CART_RULE}`}>{orderSummary}</div>

              {errorMessage && (
                <p role="alert" className={`text-xs lg:hidden ${CART_TEXT_ERROR}`}>
                  {errorMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Desktop: painel com título, card do método, resumo, erro e botão principal. */}
        <CartSummaryPanel
          title={showPaymentStep ? paymentMethodLabel(paymentMethod, t) : t('cartUi.summary')}
          paymentSlot={isDesktop ? paymentMethodCard : null}
          summary={orderSummary}
          errorMessage={errorMessage}
          primaryButton={primaryButton}
        />
      </div>

      {itemPendingRemoval && (
        <RemoveItemModal
          productName={items.find((i) => i.lineKey === itemPendingRemoval)?.product.name}
          primaryColor={tenant.primaryColor}
          onCancel={() => setItemPendingRemoval(null)}
          onConfirm={() => {
            removeItem(itemPendingRemoval);
            setItemPendingRemoval(null);
          }}
        />
      )}
    </CartShell>
  );
}
