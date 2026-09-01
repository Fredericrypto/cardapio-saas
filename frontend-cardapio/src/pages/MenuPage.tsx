import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import {
  fetchCategories,
  fetchProducts,
  fetchLocationById,
  fetchActivePromotions,
  callWaiter,
  getWaiterCallStatus,
} from '../lib/menu-api';
import type { Location, Category, Product, Promotion } from '../types';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { SplashScreen } from '../components/SplashScreen';
import { MenuHeader } from '../components/MenuHeader';
import { TableMenuHeader } from '../components/TableMenuHeader';
import { PromoCards } from '../components/PromoCards';
import { SearchBar } from '../components/SearchBar';
import { CategoryChips } from '../components/CategoryChips';
import { ProductCard } from '../components/ProductCard';
import { CartBar } from '../components/CartBar';
import { BottomNav } from '../components/BottomNav';

// Cardápio único pro cliente — atende tanto quem escaneou o QR de uma
// mesa (`/:slug/mesa/:qrCodeToken`) quanto quem chegou por um link geral
// (`/:slug`, ex: WhatsApp/Instagram/bio). No fluxo de mesa, a LOJA já é
// resolvida sozinha pela mesa escaneada (ela pertence a uma loja física
// específica); no fluxo geral, o cliente escolhe a loja antes (ver
// LocationPickerPage — mesma lógica do McDonald's), e essa escolha fica
// guardada pra próxima visita.
export function MenuPage() {
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken?: string }>();
  const navigate = useNavigate();
  const isTableFlow = Boolean(qrCodeToken);

  const tableSessionCtx = useTableSessionContext();
  const session = tableSessionCtx?.session ?? null;

  const { tenant } = useTenant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showSplash, setShowSplash] = useState(true);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPromotions, setShowPromotions] = useState(true);

  const { token: customerToken } = useCustomerAuth();

  // Fluxo geral (balcão/entrega): usa a loja escolhida na tela anterior.
  const {
    location: selectedLocation,
    locations,
    isLoading: isLoadingLocations,
  } = useSelectedLocation(!isTableFlow ? tenant?.id : undefined);

  // Fluxo de mesa: a loja é a da própria mesa escaneada, sem escolha
  // nenhuma — só busca os dados dela (aberto/fechado, horário) pra
  // mostrar no header e bloquear pedido se a loja estiver fechada.
  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  useEffect(() => {
    if (!isTableFlow || !tenant || !session?.table?.locationId) return;
    fetchLocationById(tenant.id, session.table.locationId).then(setTableLocation);
  }, [isTableFlow, tenant, session?.table?.locationId]);

  const activeLocation = isTableFlow ? tableLocation : selectedLocation;

  // Passa o token do cliente logado (se houver) — pra promoção com
  // limite por cliente já voltar marcada como "já usada" — e a loja
  // ativa, já que uma promoção pode ser restrita a lojas específicas
  // (ver PromotionsService.findActiveForPublic).
  useEffect(() => {
    if (!tenant?.id) return;
    // Guarda contra race condition: essa busca roda de novo toda vez que
    // `activeLocation` muda (primeiro sem location, depois com) — sem
    // isso, se a busca sem location demorasse mais que a busca com
    // location, ela sobrescrevia o resultado certo com um incompleto.
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

  // Só usados no fluxo de mesa — chamar garçom não existe sem uma sessão.
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);
  const [isWaiterCallPending, setIsWaiterCallPending] = useState(false);
  const [callWaiterError, setCallWaiterError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;

    async function loadMenu() {
      try {
        setIsLoadingMenu(true);

        // Aplica a cor do tenant como variável CSS global,
        // pra qualquer componente que use var(--tenant-primary) reagir.
        document.documentElement.style.setProperty(
          '--tenant-primary',
          tenant!.primaryColor,
        );

        const [categoriesData, productsData] = await Promise.all([
          fetchCategories(tenant!.id),
          fetchProducts(tenant!.id),
        ]);
        setCategories(categoriesData);
        setProducts(productsData);
      } catch {
        setLoadError('Não foi possível carregar este cardápio. Verifique o link.');
      } finally {
        setIsLoadingMenu(false);
      }
    }

    loadMenu();
  }, [tenant]);

  // Sem loja escolhida ainda (fluxo geral, mais de uma loja) — manda pra
  // tela de escolha antes de mostrar qualquer cardápio.
  useEffect(() => {
    if (isTableFlow || isLoadingLocations || !locations) return;
    if (locations.length > 1 && !selectedLocation) {
      navigate(`/${slug}/escolher-loja`, { replace: true });
    }
  }, [isTableFlow, isLoadingLocations, locations, selectedLocation, slug, navigate]);

  // Atualização "em tempo real": refaz a busca de produtos a cada 15s,
  // silenciosamente (sem mostrar o spinner de novo) — assim, se o admin
  // marcar um adicional como indisponível ou mudar um preço enquanto o
  // cliente está navegando, a mudança aparece sozinha em pouco tempo,
  // sem precisar dar F5.
  useEffect(() => {
    if (!tenant?.id) return;
    const interval = setInterval(() => {
      fetchProducts(tenant.id).then(setProducts).catch(() => {
        // Falha pontual de rede — tenta de novo no próximo ciclo, sem
        // incomodar quem está navegando com um erro na tela.
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [tenant?.id]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        activeCategoryId === null || product.categoryId === activeCategoryId;
      const matchesSearch = product.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategoryId, searchTerm]);

  async function handleCallWaiter() {
    if (!tenant || !session) return;
    setIsCallingWaiter(true);
    setCallWaiterError(null);
    try {
      await callWaiter(tenant.id, session.id);
      setIsWaiterCallPending(true);
    } catch (err) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setCallWaiterError(backendMessage ?? 'Não foi possível chamar o garçom agora. Tente novamente.');
    } finally {
      setIsCallingWaiter(false);
    }
  }

  // Enquanto o aviso "garçom chamado" está visível, confere a cada 3s se
  // já foi marcado como atendido no painel do admin — some sozinho assim
  // que isso acontecer, em vez de um timer fixo desconectado da realidade.
  // Corta em 10min como rede de segurança.
  useEffect(() => {
    if (!isTableFlow || !isWaiterCallPending || !tenant || !session) return;

    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        setIsWaiterCallPending(false);
        return;
      }
      try {
        const result = await getWaiterCallStatus(tenant.id, session.id);
        if (result.status === 'atendido' || result.status === null) {
          setIsWaiterCallPending(false);
        }
      } catch {
        // Falha de rede pontual não deve travar o polling nem esconder o
        // aviso incorretamente — só tenta de novo no próximo ciclo.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isTableFlow, isWaiterCallPending, tenant, session]);

  const productHref = (productId: string) =>
    isTableFlow ? `/${slug}/mesa/${qrCodeToken}/produto/${productId}` : `/${slug}/produto/${productId}`;
  const promotionHref = (promotionId: string) =>
    isTableFlow ? `/${slug}/mesa/${qrCodeToken}/promocao/${promotionId}` : `/${slug}/promocao/${promotionId}`;
  const cartHref = isTableFlow ? `/${slug}/mesa/${qrCodeToken}/carrinho` : `/${slug}/carrinho`;

  // Segurança extra: a mesa escaneada (pelo token) precisa pertencer ao
  // MESMO tenant identificado pela URL (pelo slug). Isso nunca deveria
  // divergir na prática (o link do QR sempre tem os dois corretos), mas
  // se algum dia divergir — link montado errado, cache velho, etc — é
  // melhor travar aqui com um erro claro do que mostrar a marca de um
  // restaurante com a sessão de mesa de outro.
  if (isTableFlow && tenant && session && session.tenantId !== tenant.id) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
        <p className="text-gray-500">
          Este QR code não pertence a este restaurante. Escaneie novamente o código impresso
          na mesa.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
        <p className="text-gray-500">{loadError}</p>
      </div>
    );
  }

  if (showSplash) {
    return <SplashScreen tenant={tenant} onFinish={() => setShowSplash(false)} />;
  }

  const isWaitingForLocationChoice = !isTableFlow && !isLoadingLocations && locations && locations.length > 1 && !selectedLocation;

  if (
    isLoadingMenu ||
    !tenant ||
    (!isTableFlow && isLoadingLocations) ||
    isWaitingForLocationChoice
  ) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  const isOpenNow = activeLocation?.isOpenNow ?? true;

  return (
    <div className="min-h-screen bg-white pb-24 max-w-md mx-auto relative">
      {isTableFlow ? (
        <TableMenuHeader
          tenant={tenant}
          location={activeLocation}
          tableNumber={session?.table?.number}
          onCallWaiter={handleCallWaiter}
          onOpenAccount={() => navigate(`/${slug}/mesa/${qrCodeToken}/conta`)}
          isCallingWaiter={isCallingWaiter}
        />
      ) : (
        <MenuHeader
          tenant={tenant}
          location={activeLocation}
          onBack={
            locations && locations.length > 1
              ? () => navigate(`/${slug}/escolher-loja`)
              : undefined
          }
        />
      )}

      {isTableFlow && isWaiterCallPending && (
        <div
          className="mx-4 -mt-4 mb-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: tenant.secondaryColor }}
        >
          Garçom chamado! Alguém vai até sua mesa em instantes.
        </div>
      )}

      {isTableFlow && callWaiterError && (
        <div className="mx-4 -mt-4 mb-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-red-50 text-red-600 border border-red-200">
          {callWaiterError}
        </div>
      )}

      {!isOpenNow && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 text-center">
          <p className="text-xs font-semibold text-red-600">
            Esta loja está fechada no momento — não é possível fazer pedidos agora.
          </p>
        </div>
      )}

      <div className={!isOpenNow ? 'grayscale opacity-70 pointer-events-none select-none' : ''}>
        <div className="pt-3">
          <div className="flex items-center justify-between px-4 mb-1.5">
            <p className="text-xs font-bold text-gray-500 tracking-wide">PROMOÇÕES</p>
            <button
              onClick={() => setShowPromotions((v) => !v)}
              aria-label={showPromotions ? 'Ocultar promoções' : 'Mostrar promoções'}
              className="text-gray-300 active:text-gray-400 transition-colors p-1"
            >
              {showPromotions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {showPromotions &&
            (promotions.length > 0 ? (
              <PromoCards
                promotions={promotions}
                primaryColor={tenant.primaryColor}
                onSelect={(id) => navigate(promotionHref(id))}
              />
            ) : (
              <p className="text-xs text-gray-400 px-4 pb-1">Não há promoções disponíveis.</p>
            ))}
        </div>

        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        <CategoryChips
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelect={setActiveCategoryId}
          primaryColor={tenant.primaryColor}
        />

        {filteredProducts.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-12">
            Nenhum produto encontrado.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                primaryColor={tenant.primaryColor}
                onClick={() => navigate(productHref(product.id))}
              />
            ))}
          </div>
        )}
      </div>

      {isOpenNow && (
        <CartBar primaryColor={tenant.primaryColor} onClick={() => navigate(cartHref)} />
      )}

      <BottomNav slug={slug!} qrCodeToken={qrCodeToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
    </div>
  );
}
