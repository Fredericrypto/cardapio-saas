import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Percent, Clock, Users, Tag, CheckCircle2 } from 'lucide-react';
import { fetchActivePromotions, fetchCategories, fetchProducts, fetchLocationById } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useCart } from '../contexts/CartContext';
import { useTableSessionContext } from '../contexts/TableSessionContext';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { computePromotionEligibility } from '../lib/promotionEligibility';
import type { Promotion, Category, Product, Location } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
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
  const { slug, promotionId, qrCodeToken } = useParams<{
    slug: string;
    promotionId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const { items, totalPrice, selectedPromotionIds, togglePromotion } = useCart();
  const isTableFlow = Boolean(qrCodeToken);

  const { tenant } = useTenant();
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
        <p className="text-gray-500">Essa promoção não está mais disponível.</p>
        <button
          onClick={() => navigate(backHref)}
          className="text-sm font-semibold"
          style={{ color: tenant.primaryColor }}
        >
          Voltar pro cardápio
        </button>
      </div>
    );
  }

  const scopeNames =
    promotion.scope === 'category'
      ? categories.filter((c) => promotion.categoryIds.includes(c.id)).map((c) => c.name)
      : promotion.scope === 'product'
        ? products.filter((p) => promotion.productIds.includes(p.id)).map((p) => p.name)
        : [];

  const eligibility = computePromotionEligibility(promotion, items, totalPrice);
  const isApplied = selectedPromotionIds.includes(promotion.id);

  function handleApply() {
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
          <img src={promotion.imageUrl} alt={promotion.title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${tenant.primaryColor}, ${tenant.primaryColor}99)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-md"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="font-display text-2xl font-extrabold text-white drop-shadow-sm">
            {promotion.title}
          </h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {promotion.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{promotion.description}</p>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">DETALHES E CONDIÇÕES</p>
          <div className="flex flex-col gap-2.5">
            <DetailRow
              icon={<Percent size={15} />}
              label={
                promotion.discountType === 'percentage'
                  ? `${promotion.discountValue}% de desconto`
                  : `R$ ${Number(promotion.discountValue).toFixed(2).replace('.', ',')} de desconto`
              }
            />
            {promotion.minOrderValue > 0 && (
              <DetailRow
                icon={<Tag size={15} />}
                label={`Pedido mínimo de R$ ${Number(promotion.minOrderValue).toFixed(2).replace('.', ',')}`}
              />
            )}
            <DetailRow
              icon={<Tag size={15} />}
              label={
                promotion.scope === 'all'
                  ? 'Válida para todos os itens do cardápio'
                  : scopeNames.length > 0
                    ? `Válida só para: ${scopeNames.join(', ')}`
                    : 'Válida para itens selecionados'
              }
            />
            {promotion.usageLimitPerCustomer != null && (
              <DetailRow
                icon={<Users size={15} />}
                label={
                  promotion.usageLimitPerCustomer === 1
                    ? 'Limite de 1 uso por cliente'
                    : `Limite de ${promotion.usageLimitPerCustomer} usos por cliente`
                }
              />
            )}
            {promotion.endsAt && (
              <DetailRow icon={<Clock size={15} />} label={`Válida até ${formatDateTime(promotion.endsAt)}`} />
            )}
          </div>
        </div>

        {promotion.alreadyUsedUp ? (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 text-sm text-gray-500 text-center">
            Você já usou essa promoção.
          </div>
        ) : eligibility.isEligible ? (
          <div className="bg-green-50 border border-green-100 rounded-xl p-3.5 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700">
              Você economiza <strong>R$ {eligibility.discountAmount.toFixed(2).replace('.', ',')}</strong> com
              o carrinho atual.
            </p>
          </div>
        ) : (
          eligibility.reason && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3.5 text-sm text-orange-700">
              {eligibility.reason}
            </div>
          )
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100">
        {promotion.alreadyUsedUp ? (
          <button disabled className="w-full py-3.5 rounded-xl bg-gray-200 text-gray-400 font-semibold">
            Promoção já utilizada
          </button>
        ) : isApplied ? (
          <button
            onClick={handleRemove}
            className="w-full py-3.5 rounded-xl font-semibold border-2"
            style={{ borderColor: tenant.primaryColor, color: tenant.primaryColor }}
          >
            Remover promoção
          </button>
        ) : (
          <button
            onClick={handleApply}
            className="w-full py-3.5 rounded-xl text-white font-semibold"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            Usar promoção
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
