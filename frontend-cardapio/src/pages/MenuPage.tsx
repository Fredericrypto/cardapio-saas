import { localizedField } from '../i18n/contentText';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { FloatingNotice } from '../components/FloatingNotice';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useSelectedLocation, readSelectedLocationId } from '../hooks/useSelectedLocation';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { SplashScreen } from '../components/SplashScreen';
import { MenuHeader } from '../components/MenuHeader';
import { TableMenuHeader } from '../components/TableMenuHeader';
import { PromoCards } from '../components/PromoCards';
import { FoodBackdrop } from '../components/FoodBackdrop';
import { MenuBotanical } from '../components/MenuBotanical';
import { StickyCategoryBar } from '../components/StickyCategoryBar';
import { SearchBar } from '../components/SearchBar';
import { CategoryChips } from '../components/CategoryChips';
import { getCategoryIcon, PromocoesIcon } from '../components/CategoryIcon';
import { ProductCard, PRODUCT_GRID_CLASS as CARD_GRID_CLASS } from '../components/ProductCard';
import { CartBar } from '../components/CartBar';
import { BottomNav, DesktopNav } from '../components/BottomNav';
import { buildShareUrl } from '../lib/shareLinks';
import { useItemPromotions } from '../hooks/useItemPromotions';
import { SectionHeading } from '../components/SectionHeading';
import { buildCategoryPath } from '../lib/categoryRoutes';
import {
  MENU_PAGE_BG,
  MENU_TEXT_BODY,
  MENU_TEXT_MUTED,
} from '../lib/menuTheme';

// Grade de produtos (definida no ProductCard): recuo lateral só no celular.
const PRODUCT_GRID_CLASS = `${CARD_GRID_CLASS} px-4 md:px-0`;

// Cardápio único pro cliente — atende tanto quem escaneou o QR de uma
// mesa (`/:slug/mesa/:qrCodeToken`) quanto quem chegou por um link geral
// (`/:slug`, ex: WhatsApp/Instagram/bio). No fluxo de mesa, a LOJA já é
// resolvida sozinha pela mesa escaneada (ela pertence a uma loja física
// específica); no fluxo geral, o cliente escolhe a loja antes (ver
// tela de unidades — mesma lógica do McDonald's), e essa escolha fica
// guardada pra próxima visita.
export function MenuPage() {
  const { t } = useI18n();
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken?: string }>();
  const navigate = useNavigate();
  const isTableFlow = Boolean(qrCodeToken);

  const tableSessionCtx = useTableSessionContext();
  const session = tableSessionCtx?.session ?? null;

  const { tenant, isLoading: isTenantLoading } = useTenant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showSplash, setShowSplash] = useState(true);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // Seções recolhidas dentro da aba "Todos" (só vale nessa aba).
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showPromotions, setShowPromotions] = useState(true);

  const { token: customerToken } = useCustomerAuth();

  // Fluxo geral (balcão/entrega): usa a loja escolhida na tela anterior.
  const {
    location: selectedLocation,
    locations,
    isLoading: isLoadingLocations,
    selectLocation,
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

  // Preço promocional também FORA do Modo Promoção (fonte única compartilhada com a
  // subpágina de categoria): só promoções ativadas pelo cliente, ordem da seleção.
  const itemPromotions = useItemPromotions(promotions, products);

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
        setLoadError(t('menuPage.nao_foi_possivel_carregar'));
      } finally {
        setIsLoadingMenu(false);
      }
    }

    loadMenu();
  }, [tenant]);

  // Mais de uma unidade e nenhuma escolhida ainda (fluxo geral): seleciona a primeira.
  // A troca depois é feita pelo dropdown de unidades do header.
  useEffect(() => {
    if (isTableFlow || isLoadingLocations || !locations) return;
    if (locations.length > 1 && !selectedLocation) {
      selectLocation(locations[0]);
    }
  }, [isTableFlow, isLoadingLocations, locations, selectedLocation, selectLocation]);

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
    // Só aparecem produtos de categorias ativas (a API pública já manda
    // só as ativas), na ordem das abas quando está em "Todos".
    const order = new Map(categories.map((c, i) => [c.id, i]));
    return products
      .filter((product) => order.has(product.categoryId))
      .sort((a, b) => order.get(a.categoryId)! - order.get(b.categoryId)!)
      .filter((product) => {
      const matchesCategory =
        activeCategoryId === null || product.categoryId === activeCategoryId;
      const needle = searchTerm.toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(needle) ||
        localizedField(product, 'name').toLowerCase().includes(needle);
      return matchesCategory && matchesSearch;
    });
  }, [products, categories, activeCategoryId, searchTerm]);

  async function handleCallWaiter() {
    if (!tenant || !session) return;
    setIsCallingWaiter(true);
    setCallWaiterError(null);
    try {
      await callWaiter(tenant.id, session.id, customerToken);
      setIsWaiterCallPending(true);
    } catch (err) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setCallWaiterError(backendMessage ?? t('cartPage.nao_foi_possivel_chamar'));
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

  // Troca de unidade pelo dropdown do header: grava a unidade (mesma chave que carrinho, item,
  // promoção e pedido leem ao montar), CONFERE a gravação, limpa o que era da unidade anterior
  // (promoções restritas, categoria, busca) e roda a splash antes de entrar na nova unidade.
  function handleSelectLocation(next: Location) {
    if (!tenant || next.id === activeLocation?.id) return;
    selectLocation(next);
    if (readSelectedLocationId(tenant.id) !== next.id) {
      console.error('Troca de unidade: a escolha não foi gravada no aparelho', next.id);
    }
    setPromotions([]);
    setActiveCategoryId(null);
    setSearchTerm('');
    setCollapsedCategoryIds(new Set());
    window.scrollTo(0, 0);
    setShowSplash(true);
  }

  const productHref = (productId: string) =>
    isTableFlow ? `/${slug}/mesa/${qrCodeToken}/produto/${productId}` : `/${slug}/produto/${productId}`;
  const promotionHref = (promotionId: string) =>
    isTableFlow ? `/${slug}/mesa/${qrCodeToken}/promocao/${promotionId}` : `/${slug}/promocao/${promotionId}`;
  const cartHref = isTableFlow ? `/${slug}/mesa/${qrCodeToken}/carrinho` : `/${slug}/carrinho`;
  const categoryHref = (categoryId: string) => buildCategoryPath(slug!, categoryId, qrCodeToken);

  // Segurança extra: a mesa escaneada (pelo token) precisa pertencer ao
  // MESMO tenant identificado pela URL (pelo slug). Isso nunca deveria
  // divergir na prática (o link do QR sempre tem os dois corretos), mas
  // se algum dia divergir — link montado errado, cache velho, etc — é
  // melhor travar aqui com um erro claro do que mostrar a marca de um
  // restaurante com a sessão de mesa de outro.
  //
  // BUG REAL CORRIGIDO: essa checagem disparava mesmo enquanto o
  // `TenantProvider` ainda estava buscando um tenant NOVO (troca de
  // slug) e `tenant` no contexto ainda apontava pro tenant ANTERIOR —
  // ou seja, um falso positivo passageiro sempre que o app trocava de
  // restaurante sem dar reload de página inteira. Agora só considera
  // divergência de verdade depois que o tenant termina de carregar.
  if (isTableFlow && !isTenantLoading && tenant && session && session.tenantId !== tenant.id) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen px-6 text-center ${MENU_PAGE_BG}`}>
        <p className={MENU_TEXT_BODY}>
          {t('menuPage.este_qr_code_nao')}
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen px-6 text-center ${MENU_PAGE_BG}`}>
        <p className={MENU_TEXT_BODY}>{loadError}</p>
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
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#6B7280] dark:border-white/10 dark:border-t-[#C4C7C5] rounded-full animate-spin" />
      </div>
    );
  }

  const isOpenNow = activeLocation?.isOpenNow ?? true;

  return (
    // `isolate`: a página vira um contexto de empilhamento próprio. É o que deixa
    // as luzes ambiente (z-index negativo: cabeçalho e cards de promoção) ficarem
    // ATRÁS de todo o conteúdo sem sumirem atrás do fundo da página. Tudo que é
    // sobreposição (CartBar, BottomNav, DesktopNav) está dentro desta div; modais
    // usam portal.
    <div className={`min-h-screen ${MENU_PAGE_BG} pb-24 md:pb-28 relative isolate`}>
      <FoodBackdrop />
      <DesktopNav
        slug={slug!}
        qrCodeToken={qrCodeToken}
        tenantId={tenant.id}
        primaryColor={tenant.primaryColor}
        tenant={tenant}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        contextLabel={activeLocation?.name}
      />

      <div className="w-full max-w-7xl mx-auto md:px-8 md:pt-4">
        <div className="relative">
        {isTableFlow ? (
          <TableMenuHeader
            tenant={tenant}
            location={activeLocation}
            tableNumber={session?.table?.number}
            tableKind={session?.table?.kind}
            onCallWaiter={handleCallWaiter}
            onOpenAccount={() => navigate(`/${slug}/mesa/${qrCodeToken}/conta`)}
            isCallingWaiter={isCallingWaiter}
            session={session}
            onExpiryTick={tableSessionCtx?.recheckExpiry}
          />
        ) : (
          <MenuHeader
            tenant={tenant}
            location={activeLocation}
            locations={locations}
            onSelectLocation={handleSelectLocation}
          />
        )}
        </div>

        {/* Avisos do garçom: FloatingNotice (portal no body, fixo no topo) em
            vez de um bloco inline com margem negativa — esse era cortado pela
            aba "Informações" e se mexia quando ela abria. */}
        {/* "Garçom chamado": mesmo visual do aviso do QR, mas FIXO — só some
            quando o admin dispensa o chamado no painel (o polling abaixo
            zera isWaiterCallPending). */}
        {isTableFlow && isWaiterCallPending && (
          <FloatingNotice
            persistent
            message={t('menuPage.garcom_chamado_alguem_vai')}
          />
        )}
        {isTableFlow && callWaiterError && (
          <FloatingNotice message={callWaiterError} onDone={() => setCallWaiterError(null)} />
        )}

        {!isOpenNow && (
          <div className="bg-red-50 border-b border-red-100 dark:bg-red-500/10 dark:border-red-500/20 md:mt-4 md:rounded-2xl md:border px-4 py-2.5 text-center">
            <p className="text-xs font-bold text-red-600 dark:text-red-300">{t('store.closedEstablishment')}</p>
            <p className="text-[11px] text-red-500 dark:text-red-300/80 mt-0.5">{t('store.closedHint')}</p>
          </div>
        )}

        {/* Loja fechada: tudo continua navegável (setas, carrossel, busca, abrir
            item/promoção para ler). Só o VISUAL dos cards fica atenuado e os
            botões de adicionar/pedir ficam travados (ver ProductCard e telas de
            detalhe). */}
        <div className="relative">
          {/* Ramo botânico decorativo ao lado da grade (só em telas largas; não intercepta toque e fica atrás dos cards). */}
          <MenuBotanical className="pointer-events-none absolute right-0 top-[44rem] z-0 hidden w-44 text-[#111827]/20 xl:-right-10 xl:block 2xl:w-52 dark:text-[#C2C0B6]/25" />
          <div className="pt-1 pb-5">
            {/* Mesmo cabeçalho das categorias da aba "Todos": ícone à
                esquerda + nome + seta de recolher (decisão do Felipe, 30/09). */}
            <SectionHeading
              icon={<PromocoesIcon size={16} />}
              title={t('notifications.type.promotion.label')}
              expanded={showPromotions}
              onToggle={() => setShowPromotions((v) => !v)}
              toggleLabel={showPromotions ? t('menuPage.ocultar_promocoes') : t('menuPage.mostrar_promocoes')}
            />

            {showPromotions &&
              (promotions.length > 0 ? (
                <PromoCards
                  promotions={promotions}
                  primaryColor={tenant.primaryColor}
                  muted={!isOpenNow}
                  buildShareUrl={(id) => buildShareUrl('promocao', slug!, id)}
                  onSelect={(id) => navigate(promotionHref(id))}
                />
              ) : (
                <p className={`text-xs px-4 md:px-0 pt-1 pb-1 ${MENU_TEXT_MUTED}`}>{t('menuPage.nenhuma_promocao_no_momento')}</p>
              ))}
          </div>

          <div className="md:hidden">
            <SearchBar value={searchTerm} onChange={setSearchTerm} />
          </div>
          {/* Desktop: categorias fixas logo abaixo da barra superior (h-16). Sem cor
              de fundo em repouso (a luz dos cards passa por trás); com o fundo da
              tela só enquanto está presa no topo. Ver StickyCategoryBar. */}
          <StickyCategoryBar>
            <CategoryChips
              categories={categories}
              activeCategoryId={activeCategoryId}
              onSelect={setActiveCategoryId}
              primaryColor={tenant.primaryColor}
            />
          </StickyCategoryBar>

          {filteredProducts.length === 0 ? (
            <p className={`text-center text-sm py-12 ${MENU_TEXT_MUTED}`}>
              {t('menuPage.nenhum_produto_encontrado')}
            </p>
          ) : activeCategoryId !== null ? (
            <div className={`${PRODUCT_GRID_CLASS} pt-3 pb-4`}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  primaryColor={tenant.primaryColor}
                  storeClosed={!isOpenNow}
                  shareUrl={buildShareUrl('produto', slug!, product.id)}
                  itemPromotion={itemPromotions.get(product.id) ?? null}
                  onClick={() => navigate(productHref(product.id))}
                />
              ))}
            </div>
          ) : (
            // Aba "Todos": itens separados por categoria (só as que o admin
            // ativou), cada seção com ícone + nome e seta pra recolher.
            // Durante uma busca as seções ficam sempre abertas.
            <div className="pt-1 pb-4">
              {categories.map((category) => {
                const items = filteredProducts.filter((p) => p.categoryId === category.id);
                if (items.length === 0) return null;
                const Icon = getCategoryIcon(category.key, category.name);
                const isCollapsed =
                  searchTerm.trim() === '' && collapsedCategoryIds.has(category.id);
                return (
                  <section key={category.id}>
                    <SectionHeading
                      icon={Icon ? <Icon size={16} /> : null}
                      title={categoryLabel(category, t)}
                      expanded={!isCollapsed}
                      onToggle={() =>
                        setCollapsedCategoryIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(category.id)) next.delete(category.id);
                          else next.add(category.id);
                          return next;
                        })
                      }
                      action={{
                        to: categoryHref(category.id),
                        label: t('categoryPage.viewAll'),
                        aria: t('categoryPage.viewAllAria', { name: categoryLabel(category, t) }),
                      }}
                    />
                    {!isCollapsed && (
                      <div className={`${PRODUCT_GRID_CLASS} pt-1.5`}>
                        {items.map((product) => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            primaryColor={tenant.primaryColor}
                            storeClosed={!isOpenNow}
                            shareUrl={buildShareUrl('produto', slug!, product.id)}
                            itemPromotion={itemPromotions.get(product.id) ?? null}
                            onClick={() => navigate(productHref(product.id))}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isOpenNow && (
        <CartBar primaryColor={tenant.primaryColor} onClick={() => navigate(cartHref)} />
      )}

      <BottomNav slug={slug!} qrCodeToken={qrCodeToken} tenantId={tenant.id} primaryColor={tenant.primaryColor} />
    </div>
  );
}
