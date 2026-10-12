import { localizedField } from '../i18n/contentText';
import { promotionReasonLabel } from '../i18n/labels';
import { activeDateLocale } from '../i18n/languages';
import { categoryLabel } from '../i18n/categoryLabel';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Ban, Percent, Clock, Users, Tag, CheckCircle2 } from 'lucide-react';
import { ShareButton } from '../components/ShareButton';
import { Tooltip } from '../components/Tooltip';
import { buildShareUrl } from '../lib/shareLinks';
import { fetchActivePromotions, fetchCategories, fetchProducts, fetchLocationById } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useCart } from '../contexts/CartContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { computePromotionEligibility } from '../lib/promotionEligibility';
import type { Promotion, Category, Product, Location } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(activeDateLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Tela de detalhe do cupom — foto grande, regras e um botão "Usar
// promoção", igual iFood: o cliente decide usar, nunca é forçado. Some
// mostra se dá pra usar AGORA com o carrinho atual (ou por que não).
export function PromotionDetailPage() {
  const { t } = useI18n();
  const { slug, promotionId, qrCodeToken } = useParams<{
    slug: string;
    promotionId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { items, totalPrice, selectedPromotionIds, togglePromotion } = useCart();
  const isTableFlow = Boolean(qrCodeToken);

  const { tenant } = useTenant();
  const accent = useAccentColor(tenant?.primaryColor ?? '#111827');
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const { token: customerToken } = useCustomerAuth();

  // Mesma resolução de loja do MenuPage: uma promoção pode ser restrita a
  // lojas específicas (ver PromotionsService.isValidAtLocation), então
  // sem mandar a locationId certa pro backend a promoção some da lista
  // e essa tela mostra "não está mais disponível" mesmo ela existindo.
  const tableSessionCtx = useTableSessionContext();
  const tableSession = tableSessionCtx?.session ?? null;
  const { location: selectedLocation, isLoading: isSelectedLocationLoading } = useSelectedLocation(
    !isTableFlow ? tenant?.id : undefined,
  );
  const [tableLocation, setTableLocation] = useState<Location | null>(null);
  useEffect(() => {
    if (!isTableFlow || !tenant || !tableSession?.table?.locationId) return;
    fetchLocationById(tenant.id, tableSession.table.locationId).then(setTableLocation);
  }, [isTableFlow, tenant, tableSession?.table?.locationId]);
  const activeLocation = isTableFlow ? tableLocation : selectedLocation;
  // Só busca as promoções depois que a loja estiver resolvida (ou já der
  // pra saber que não tem loja pra resolver) — senão o primeiro fetch sai
  // sem locationId, filtra promoções restritas a loja e pisca "não está
  // mais disponível" antes do segundo fetch (com a location certa) corrigir.
  // Compara pelo id (em vez de um flag de loading separado) pra não ter
  // uma renderização no meio do caminho em que o fetch da location já
  // devia ter começado mas o estado "loading" ainda não foi setado.
  const isLocationReady = isTableFlow
    ? !tableSession?.table?.locationId || tableLocation?.id === tableSession.table.locationId
    : Boolean(tenant) && !isSelectedLocationLoading;

  useEffect(() => {
    if (!slug || !promotionId || !tenant || !isLocationReady) return;
    async function load() {
      const [promos, cats, prods] = await Promise.all([
        fetchActivePromotions(tenant!.id, customerToken, activeLocation?.id),
        fetchCategories(tenant!.id),
        fetchProducts(tenant!.id),
      ]);
      const found = promos.find((p) => p.id === promotionId) ?? null;
      setPromotion(found);
      setNotFound(!found);
      setCategories(cats);
      setProducts(prods);
      setIsLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, promotionId, tenant, customerToken, isLocationReady, activeLocation?.id]);

  const backHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`;
  const cartHref = qrCodeToken ? `/${slug}/mesa/${qrCodeToken}/carrinho` : `/${slug}/carrinho`;

  if (isLoading || !tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !promotion) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center gap-3">
        <p className="text-gray-500">{t('promotionDetailPage.essa_promocao_nao_esta')}</p>
        <button
          onClick={() => navigate(backHref)}
          className="text-sm font-semibold"
          style={{ color: accent }}
        >
          {t('promotionDetailPage.voltar_pro_cardapio')}
        </button>
      </div>
    );
  }

  const scopeNames =
    promotion.scope === 'category'
      ? categories.filter((c) => promotion.categoryIds.includes(c.id)).map((c) => categoryLabel(c, t))
      : promotion.scope === 'product'
        ? products.filter((p) => promotion.productIds.includes(p.id)).map((p) => localizedField(p, 'name'))
        : [];

  // Loja fechada: dá para ler a promoção, mas não resgatar/aplicar.
  const isStoreClosed = activeLocation?.isOpenNow === false;
  const eligibility = computePromotionEligibility(promotion, items, totalPrice);
  const isApplied = selectedPromotionIds.includes(promotion.id);

  function handleApply() {
    if (isStoreClosed) return;
    togglePromotion(promotion!.id);
    navigate(items.length > 0 ? cartHref : backHref);
  }

  function handleRemove() {
    togglePromotion(promotion!.id);
  }

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto pb-32">
      <div className="relative h-56 bg-gray-100">
        {promotion.imageUrl ? (
          <img src={promotion.imageUrl} alt={localizedField(promotion, 'title')} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.primaryColor}99)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <Tooltip label={t('tooltip.back')} className="contents">
          <button
            // Link compartilhado abre direto aqui (sem histórico): voltar leva ao cardápio.
            onClick={() => (routerLocation.key === 'default' ? navigate(backHref, { replace: true }) : navigate(-1))}
            aria-label={t('common.back')}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 dark:bg-[#1E1E20]/90 flex items-center justify-center shadow-md"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
        </Tooltip>
        {slug && (
          <ShareButton
            className="absolute top-4 right-4"
            url={buildShareUrl('promocao', slug, promotion.id)}
            title={localizedField(promotion, 'title')}
            text={localizedField(promotion, 'description') || t('promotionDetailPage.promocao_de_name', { name: tenant.name })}
          />
        )}
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="font-display text-2xl font-extrabold text-white drop-shadow-sm">
            {localizedField(promotion, 'title')}
          </h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {promotion.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{localizedField(promotion, 'description')}</p>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">{t('promotionDetailPage.detalhes_e_condicoes')}</p>
          <div className="flex flex-col gap-2.5">
            <DetailRow
              icon={<Percent size={15} />}
              label={
                promotion.discountType === 'percentage'
                  ? t('promotionDetailPage.discountvalue_de_desconto', { discountValue: promotion.discountValue })
                  : t('promotionDetailPage.r_v0_de_desconto', { v0: Number(promotion.discountValue).toFixed(2).replace('.', ',') })
              }
            />
            {promotion.minOrderValue > 0 && (
              <DetailRow
                icon={<Tag size={15} />}
                label={t('promotionDetailPage.pedido_minimo_de_r', { v0: Number(promotion.minOrderValue).toFixed(2).replace('.', ',') })}
              />
            )}
            <DetailRow
              icon={<Tag size={15} />}
              label={
                promotion.scope === 'all'
                  ? t('promotionDetailPage.valida_para_todos_os')
                  : scopeNames.length > 0
                    ? t('promotionDetailPage.valida_so_para_v0', { v0: scopeNames.join(', ') })
                    : t('promotionDetailPage.valida_para_itens_selecionados')
              }
            />
            {promotion.usageLimitPerCustomer != null && (
              <DetailRow
                icon={<Users size={15} />}
                label={
                  promotion.usageLimitPerCustomer === 1
                    ? t('promotionDetailPage.limite_de_1_uso')
                    : t('promotionDetailPage.limite_de_usagelimitpercustomer_usos', { usageLimitPerCustomer: promotion.usageLimitPerCustomer })
                }
              />
            )}
            {promotion.endsAt && (
              <DetailRow icon={<Clock size={15} />} label={t('promotionDetailPage.valida_ate_v0', { v0: formatDateTime(promotion.endsAt) })} />
            )}
          </div>
        </div>

        {promotion.alreadyUsedUp ? (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 text-sm text-gray-500 text-center">
            {t('promotionDetailPage.voce_ja_usou_essa')}
          </div>
        ) : eligibility.isEligible ? (
          <div className="bg-green-50 border border-green-100 rounded-xl p-3.5 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700">
              {t('promotionDetailPage.voce_economiza')} <strong>R$ {eligibility.discountAmount.toFixed(2).replace('.', ',')}</strong> {t('promotionDetailPage.com_o_carrinho_atual')}
            </p>
          </div>
        ) : (
          eligibility.reason && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3.5 text-sm text-orange-700">
              {promotionReasonLabel(eligibility, t)}
            </div>
          )
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100">
        {promotion.alreadyUsedUp ? (
          <button disabled className="w-full py-3.5 rounded-xl bg-gray-200 text-gray-400 font-semibold">
            {t('promotionDetailPage.promocao_ja_utilizada')}
          </button>
        ) : isStoreClosed && !isApplied ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-red-500 text-center">{t('store.closedHint')}</p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="w-full py-3.5 rounded-xl bg-red-50 text-red-600 border border-red-100 font-semibold flex justify-center items-center gap-2 cursor-not-allowed"
            >
              <Ban size={16} strokeWidth={1.5} />
              {t('store.closedEstablishment')}
            </button>
          </div>
        ) : isApplied ? (
          <button
            onClick={handleRemove}
            className="w-full py-3.5 rounded-xl font-semibold border-2"
            style={{ borderColor: accent, color: accent }}
          >
            {t('promotionDetailPage.remover_promocao')}
          </button>
        ) : (
          <button
            onClick={handleApply}
            className="w-full py-3.5 rounded-xl text-white font-semibold"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {t('promotionDetailPage.usar_promocao')}
          </button>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-gray-600">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
