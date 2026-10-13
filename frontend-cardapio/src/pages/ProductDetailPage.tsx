import { localizedField } from '../i18n/contentText';
import { addonGroupHint } from '../i18n/labels';
import { useI18n } from '../i18n/I18nContext';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Ban, Check, ChevronRight, Minus, Plus, Star } from 'lucide-react';
import { fetchProducts } from '../lib/menu-api';
import { fetchItemReviewsSummary } from '../lib/customer-api';
import type { ReviewSummary } from '../lib/customer-api';
import type { Product, SelectedCartOption } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTenant } from '../contexts/TenantContext';
import { CartIcon } from '../components/MenuIcons';
import { useActiveLocation } from '../hooks/useActiveLocation';
import { ShareButton } from '../components/ShareButton';
import { Tooltip } from '../components/Tooltip';
import { buildShareUrl } from '../lib/shareLinks';
import { PROFILE_CARD } from '../lib/profileTheme';
import {
  MENU_PAGE_BG,
  MENU_SURFACE,
  MENU_BORDER,
  MENU_TEXT,
  MENU_TEXT_SOFT,
  MENU_TEXT_BODY,
  MENU_TEXT_MUTED,
} from '../lib/menuTheme';

function formatMoney(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

// Mesma forma que a nota do restaurante aparece no header do cardápio
// (ver MenuHeader.useReviewSummary) — pedido explícito do Felipe. A nota
// abre a página completa de avaliações do item (ItemReviewsPage); não há
// mais lista solta de avaliações no pé desta tela.
function useItemReviewSummary(tenantId: string, productId: string | undefined) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  useEffect(() => {
    if (!productId) return;
    fetchItemReviewsSummary(tenantId, productId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [tenantId, productId]);
  return summary;
}

export function ProductDetailPage() {
  const { t } = useI18n();
  const { slug, productId, qrCodeToken } = useParams<{
    slug: string;
    productId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { addItem } = useCart();

  const { tenant } = useTenant();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  // Loja fechada: a tela abre normalmente para ler o item, mas não deixa adicionar.
  const activeLocation = useActiveLocation(tenant?.id, Boolean(qrCodeToken));
  const storeStatus = useStoreStatus(activeLocation);
  const isStoreClosed = !storeStatus.isOpen && Boolean(activeLocation);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  // groupId -> array de valueIds escolhidos nesse grupo
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const itemReviewSummary = useItemReviewSummary(tenant?.id ?? '', productId);

  useEffect(() => {
    if (!tenant || !productId) return;

    async function load() {
      const products = await fetchProducts(tenant!.id);
      const found = products.find((p) => p.id === productId) ?? null;
      setProduct(found);
      setIsLoading(false);
    }

    load();
  }, [tenant, productId]);

  // Mesma lógica do cardápio: atualiza sozinho a cada 15s, silenciosamente
  // — se o admin desmarcar um adicional como indisponível enquanto o
  // cliente está decidindo aqui, some da lista sem precisar de F5.
  useEffect(() => {
    if (!tenant?.id || !productId) return;
    const interval = setInterval(() => {
      fetchProducts(tenant.id)
        .then((products) => {
          const found = products.find((p) => p.id === productId);
          if (found) setProduct(found);
        })
        .catch(() => {
          // Falha pontual — tenta de novo no próximo ciclo.
        });
    }, 15000);
    return () => clearInterval(interval);
  }, [tenant?.id, productId]);

  if (isLoading || !tenant) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-[#E5E7EB] dark:border-white/10 border-t-[#6B7280] dark:border-t-[#C4C7C5] rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen px-6 text-center ${MENU_PAGE_BG}`}>
        <p className={MENU_TEXT_BODY}>{t('productDetailPage.produto_nao_encontrado')}</p>
      </div>
    );
  }

  const brand = tenant.primaryColor;
  const backHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;

  // Grupo sem nenhuma opção cadastrada não aparece pro cliente — ficaria
  // um título "morto" sem nada clicável embaixo (bug visto em produção:
  // grupo criado no admin sem nenhuma opção preenchida).
  const optionGroups = (product.options ?? []).filter((g) => g.values.length > 0);

  function toggleValue(groupId: string, groupName: string, valueId: string, maxSelect: number) {
    setValidationError(null);
    setSelections((prev) => {
      const current = prev[groupId] ?? [];

      if (maxSelect === 1) {
        // Rádio: escolher de novo o mesmo desmarca (permitido mesmo em
        // grupo obrigatório — a validação de mínimo só barra no "Adicionar").
        const next = current[0] === valueId ? [] : [valueId];
        return { ...prev, [groupId]: next };
      }

      if (current.includes(valueId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== valueId) };
      }
      if (current.length >= maxSelect) {
        setValidationError(t('productDetailPage.maximo_de_maxselect_opcoes', { maxSelect: maxSelect, groupName: groupName }));
        return prev;
      }
      return { ...prev, [groupId]: [...current, valueId] };
    });
  }

  // Preço = base + soma dos adicionais escolhidos, em todos os grupos.
  const selectedOptionsList: SelectedCartOption[] = optionGroups.flatMap((group) =>
    (selections[group.id] ?? []).flatMap((valueId) => {
      const value = group.values.find((v) => v.id === valueId);
      if (!value) return [];
      return [{ valueId: value.id, groupName: group.name, label: value.label, priceDelta: Number(value.priceDelta) }];
    }),
  );
  const optionsDelta = selectedOptionsList.reduce((sum, o) => sum + o.priceDelta, 0);
  const displayPrice = Number(product.promoPrice ?? product.price) + optionsDelta;
  const subtotal = displayPrice * quantity;

  function handleAddToCart() {
    if (!product || product.isAvailable === false || isStoreClosed) return;

    // Confere grupos obrigatórios antes de deixar adicionar — mesma
    // regra que o backend também confere (defesa em profundidade: aqui
    // é só pra dar feedback rápido, quem garante de verdade é o server).
    for (const group of optionGroups) {
      const chosenCount = (selections[group.id] ?? []).length;
      if (chosenCount < group.minSelect) {
        setValidationError(
          group.minSelect === 1
            ? t('productDetailPage.escolha_uma_opcao_em', { name: group.name })
            : t('productDetailPage.escolha_pelo_menos_minselect', { minSelect: group.minSelect, name: group.name }),
        );
        return;
      }
    }

    addItem(product, selectedOptionsList, quantity);
    navigate(backHref);
  }

  const hasPromoPrice = product.promoPrice != null;
  const ratingStars =
    itemReviewSummary && itemReviewSummary.count > 0 ? Math.round(itemReviewSummary.average) : 0;

  const qtyBtn =
    'w-9 h-9 rounded-full bg-[#FFFFFF] dark:bg-[#3A3C3E] text-[#374151] dark:text-[#E3E2E6] ' +
    'flex items-center justify-center shadow-sm border border-[#E5E7EB] dark:border-white/10 ' +
    'hover:bg-[#F9FAFB] dark:hover:bg-[#46484A] disabled:opacity-40 disabled:cursor-not-allowed transition';

  const quantityControl = (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#F3F4F6] dark:bg-[#1E1E20] border border-[#E5E7EB] dark:border-white/10 p-1">
      <Tooltip label={t('tooltip.decrease')}>
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={quantity <= 1}
          aria-label={t('tooltip.decrease')}
          className={qtyBtn}
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <span className={`w-8 text-center font-semibold tabular-nums ${MENU_TEXT}`} aria-live="polite">
        {quantity}
      </span>
      <Tooltip label={t('tooltip.increase')}>
        <button
          type="button"
          onClick={() => setQuantity((q) => q + 1)}
          aria-label={t('tooltip.increase')}
          className={qtyBtn}
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  );

  // Botão principal: cor da marca no claro; no escuro vira sólido claro com
  // texto escuro (nunca a cor da marca apagada sobre o fundo escuro).
  const primaryBtn =
    'w-full py-3.5 rounded-xl text-sm font-semibold text-[#FFFFFF] bg-[var(--brand)] ring-1 ring-black/5 ' +
    'dark:bg-[#E3E2E6] dark:text-[#131314] dark:ring-white/20 shadow-sm hover:brightness-110 dark:hover:brightness-95 ' +
    'active:brightness-95 transition flex justify-between items-center px-5';

  const cta =
    isStoreClosed && product.isAvailable !== false ? (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-red-500 dark:text-red-400 text-center">{t('store.closedHint')}</p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full py-3.5 rounded-xl text-sm bg-red-50 text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20 font-semibold flex justify-center items-center gap-2 px-5 cursor-not-allowed"
        >
          <Ban size={16} strokeWidth={1.5} />
          {t('store.closedEstablishment')}
        </button>
      </div>
    ) : product.isAvailable === false ? (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full py-3.5 rounded-xl text-sm bg-[#E5E7EB] text-[#6B7280] dark:bg-white/10 dark:text-[#C4C7C5] font-semibold flex justify-center items-center gap-2 px-5 cursor-not-allowed"
      >
        <Ban size={16} strokeWidth={1.5} />
        {t('productCard.indisponivel')}
      </button>
    ) : (
      <button
        type="button"
        onClick={handleAddToCart}
        className={primaryBtn}
        style={{ '--brand': brand } as CSSProperties}
      >
        <span className="flex items-center gap-2">
          <CartIcon size={16} />
          {t('productDetailPage.adicionar')}
        </span>
        <span className="tabular-nums">{formatMoney(subtotal)}</span>
      </button>
    );

  return (
    <div className={`min-h-screen ${MENU_PAGE_BG} pb-28 lg:pb-12`}>
      <div className="w-full max-w-6xl mx-auto md:px-8 md:py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 items-start">
          {/* Coluna esquerda: imagem em destaque */}
          <div className="relative aspect-[4/3] md:aspect-[16/9] lg:aspect-square md:rounded-2xl overflow-hidden bg-[#F3F4F6] dark:bg-[#282A2C] lg:sticky lg:top-8 md:shadow-sm">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={localizedField(product, 'name')}
                draggable={false}
                className={`w-full h-full object-cover ${product.isAvailable === false ? 'grayscale opacity-60' : ''}`}
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${MENU_TEXT_MUTED}`}>
                {t('productCard.sem_foto')}
              </div>
            )}
            <Tooltip label={t('tooltip.back')} className="contents">
              <button
                type="button"
                // Link compartilhado abre direto aqui (sem histórico para voltar):
                // nesse caso "voltar" leva ao cardápio em vez de sair do app.
                onClick={() =>
                  routerLocation.key === 'default' ? navigate(backHref, { replace: true }) : navigate(-1)
                }
                aria-label={t('common.back')}
                className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 text-[#111827] dark:text-[#E3E2E6] flex items-center justify-center shadow-md hover:scale-105 transition"
              >
                <ArrowLeft size={18} strokeWidth={1.5} />
              </button>
            </Tooltip>
            {slug && (
              <ShareButton
                className="absolute top-4 right-4"
                url={buildShareUrl('produto', slug, product.id)}
                title={localizedField(product, 'name')}
                text={product.description ?? t('productDetailPage.olha_esse_item_de', { name: tenant.name })}
              />
            )}
          </div>

          {/* Coluna direita: título, nota, preço, descrição, opções e ação */}
          <div className="p-4 md:p-0 pt-5 lg:pt-1 flex flex-col gap-5">
            <div>
              <h1 className={`font-display text-2xl md:text-3xl font-extrabold leading-tight ${MENU_TEXT}`}>
                {localizedField(product, 'name')}
              </h1>

              {itemReviewSummary && (
                <button
                  type="button"
                  onClick={() => navigate(`/${slug}/produto/${productId}/avaliacoes`)}
                  aria-label={t('productDetailPage.ver_avaliacoes_desse_item')}
                  className="flex items-center gap-1.5 mt-2.5 rounded-md hover:opacity-80 transition"
                >
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={15}
                        strokeWidth={1.5}
                        fill={n <= ratingStars ? '#F59E0B' : 'transparent'}
                        className={n <= ratingStars ? 'text-amber-500' : 'text-[#D1D5DB] dark:text-white/25'}
                      />
                    ))}
                  </span>
                  {itemReviewSummary.count > 0 && (
                    <span className={`text-sm font-semibold tabular-nums ${MENU_TEXT_SOFT}`}>
                      {itemReviewSummary.average.toFixed(1)}
                    </span>
                  )}
                  <span className={`text-sm ${MENU_TEXT_MUTED}`}>
                    ({itemReviewSummary.count}{' '}
                    {itemReviewSummary.count === 1 ? t('reviewsShared.avaliacao') : t('reviewsShared.avaliacoes_2')})
                  </span>
                  {itemReviewSummary.count > 0 && (
                    <ChevronRight size={14} strokeWidth={1.5} className={MENU_TEXT_MUTED} />
                  )}
                </button>
              )}

              <div className="flex items-baseline gap-2.5 mt-4">
                <span className="text-3xl font-extrabold tabular-nums" style={{ color: accent }}>
                  {formatMoney(Number(product.promoPrice ?? product.price))}
                </span>
                {hasPromoPrice && (
                  <span className={`text-base line-through tabular-nums ${MENU_TEXT_MUTED}`}>
                    {formatMoney(Number(product.price))}
                  </span>
                )}
              </div>

              {product.description && (
                <p className={`text-sm md:text-base ${MENU_TEXT_BODY} leading-relaxed mt-4`}>
                  {localizedField(product, 'description')}
                </p>
              )}
            </div>

            {/* Quantidade (celular/tablet). No desktop fica junto da ação. */}
            <div className="lg:hidden">{quantityControl}</div>

            {optionGroups.length > 0 && (
              <div className="flex flex-col gap-4">
                {optionGroups.map((group) => {
                  const hint = addonGroupHint(group.minSelect, group.maxSelect, t);
                  const isMulti = group.maxSelect > 1;
                  return (
                    <div key={group.id} className={`${PROFILE_CARD} p-4 md:p-5`}>
                      <div className="flex items-baseline flex-wrap gap-x-1.5 mb-3">
                        <p className={`text-sm font-bold ${MENU_TEXT}`}>{group.name}</p>
                        {hint && <span className={`text-xs ${MENU_TEXT_MUTED}`}>· {hint}</span>}
                      </div>

                      <div
                        className="flex flex-col gap-2"
                        role={isMulti ? 'group' : 'radiogroup'}
                        aria-label={group.name}
                      >
                        {group.values.map((value) => {
                          const isSelected = (selections[group.id] ?? []).includes(value.id);
                          return (
                            <button
                              key={value.id}
                              type="button"
                              role={isMulti ? 'checkbox' : 'radio'}
                              aria-checked={isSelected}
                              onClick={() => toggleValue(group.id, group.name, value.id, group.maxSelect)}
                              style={{ '--brand': brand } as CSSProperties}
                              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                                isSelected
                                  ? 'border-[var(--brand)] dark:border-[#E3E2E6] bg-black/[0.03] dark:bg-white/[0.06]'
                                  : 'border-[#E5E7EB] dark:border-white/10 bg-[#F9FAFB] dark:bg-[#282A2C] hover:bg-black/[0.03] dark:hover:bg-white/[0.06]'
                              }`}
                            >
                              <span className={`text-sm min-w-0 break-words ${MENU_TEXT_SOFT}`}>{value.label}</span>
                              <span className="flex items-center gap-3 shrink-0">
                                {Number(value.priceDelta) > 0 && (
                                  <span
                                    className={`text-xs font-medium tabular-nums rounded-full px-2 py-0.5 bg-[#F3F4F6] dark:bg-white/10 ${MENU_TEXT_BODY}`}
                                  >
                                    + {formatMoney(Number(value.priceDelta))}
                                  </span>
                                )}
                                <span
                                  aria-hidden="true"
                                  className={`w-5 h-5 flex items-center justify-center border-2 shrink-0 transition ${
                                    isMulti ? 'rounded-md' : 'rounded-full'
                                  } ${
                                    isSelected
                                      ? 'border-[var(--brand)] bg-[var(--brand)] dark:border-[#E3E2E6] dark:bg-[#E3E2E6]'
                                      : 'border-[#D1D5DB] dark:border-white/25 bg-transparent'
                                  }`}
                                >
                                  {isSelected && (
                                    <Check
                                      size={12}
                                      strokeWidth={2}
                                      className="text-[#FFFFFF] dark:text-[#131314]"
                                    />
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {validationError && (
              <p role="alert" className="text-sm text-red-500 dark:text-red-400">
                {validationError}
              </p>
            )}

            {/* Ação principal inline no desktop; no celular fica fixa no rodapé. */}
            <div className={`hidden lg:flex flex-col gap-4 ${PROFILE_CARD} p-5`}>
              <div>{quantityControl}</div>
              {cta}
            </div>
          </div>
        </div>
      </div>

      {/* Barra fixa (celular/tablet).
          BUG CORRIGIDO (mantido): em alguns navegadores/WebViews Android, uma
          barra fixa cujo conteúdo muda de cor via `style` dinâmico às vezes só
          é pintada depois de QUALQUER interação na tela. `translateZ(0)` força
          esse bloco para a própria camada de composição. */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 p-4 ${MENU_SURFACE} border-t ${MENU_BORDER}`}
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="max-w-xl mx-auto">{cta}</div>
      </div>
    </div>
  );
}
