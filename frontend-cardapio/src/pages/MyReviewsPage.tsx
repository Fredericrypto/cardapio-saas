import { useI18n } from '../i18n/I18nContext';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchMyReviews } from '../lib/customer-api';
import type { PublicReview, MyItemReview } from '../lib/customer-api';
import { ReviewDisplay } from '../components/ReviewDisplay';
import { ItemReviewDisplay } from '../components/ItemReviewDisplay';
import { ProfileSubpageShell } from '../components/ProfileSubpageShell';
import { Tooltip } from '../components/Tooltip';
import { MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_BODY, MENU_TEXT_MUTED } from '../lib/menuTheme';

// Pedido explícito do Felipe: separado por categoria — Restaurante e
// Pedido (itens) — cada avaliação mostrando a data e os detalhes do que
// foi avaliado (já embutido nos dois componentes de exibição).
export function MyReviewsPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenant();
  const [restaurantReview, setRestaurantReview] = useState<PublicReview | null | undefined>(undefined);
  const [itemReviews, setItemReviews] = useState<MyItemReview[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const { customer, token, isLoading } = useCustomerAuth();

  useEffect(() => {
    if (!tenant || !token) return;
    setLoadError(false);
    fetchMyReviews(tenant.id, token)
      .then(({ restaurant, items }) => {
        setRestaurantReview(restaurant);
        setItemReviews(items);
      })
      .catch(() => setLoadError(true));
  }, [tenant, token]);

  if (!tenant || isLoading || !customer) {
    return (
      <div className={`flex items-center justify-center h-screen ${MENU_PAGE_BG}`}>
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    );
  }

  const isLoadingReviews = restaurantReview === undefined || itemReviews === null;
  const hasNothing = !isLoadingReviews && !restaurantReview && itemReviews!.length === 0;

  return (
    <ProfileSubpageShell tenant={tenant} title={t('profile.myReviews')} backTo={`/${slug}/conta-cliente/perfil`}>
      <div className="max-w-3xl flex flex-col gap-5">
        {loadError && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className={`text-sm ${MENU_TEXT_BODY}`}>{t('myReviewsPage.nao_foi_possivel_carregar')}</p>
            <Tooltip label={t('optionalCustomerAuth.tentar_de_novo')}>
              <button
                onClick={() => {
                  setRestaurantReview(undefined);
                  setItemReviews(null);
                  setLoadError(false);
                  if (tenant && token) {
                    fetchMyReviews(tenant.id, token)
                      .then(({ restaurant, items }) => {
                        setRestaurantReview(restaurant);
                        setItemReviews(items);
                      })
                      .catch(() => setLoadError(true));
                  }
                }}
                className={`text-sm font-semibold ${MENU_TEXT} underline`}
              >
                {t('optionalCustomerAuth.tentar_de_novo')}
              </button>
            </Tooltip>
          </div>
        )}

        {!loadError && isLoadingReviews && (
          <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-8`}>{t('common.loading')}</p>
        )}

        {!loadError && hasNothing && (
          <p className={`text-sm ${MENU_TEXT_MUTED} text-center py-12 px-4`}>
            {t('myReviewsPage.voce_ainda_nao_avaliou')}
          </p>
        )}

        {restaurantReview && (
          <div className="flex flex-col gap-2">
            <p className={`text-xs font-semibold ${MENU_TEXT_MUTED} uppercase tracking-wide px-1`}>
              {t('reviewsShared.restaurante')}
            </p>
            <ReviewDisplay
              tenantId={tenant.id}
              token={token!}
              restaurantName={tenant.name}
              review={{
                id: restaurantReview.id,
                orderId: '',
                rating: restaurantReview.rating,
                comment: restaurantReview.comment,
                isAnonymous: restaurantReview.isAnonymous,
                createdAt: restaurantReview.createdAt,
                response: restaurantReview.response,
              }}
              onDeleted={() => setRestaurantReview(null)}
            />
          </div>
        )}

        {itemReviews && itemReviews.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className={`text-xs font-semibold ${MENU_TEXT_MUTED} uppercase tracking-wide px-1`}>{t('myReviewsPage.pedido')}</p>
            <div className="flex flex-col gap-2.5">
              {itemReviews.map((review) => (
                <ItemReviewDisplay
                  key={review.id}
                  tenantId={tenant.id}
                  token={token!}
                  review={review}
                  onDeleted={() =>
                    setItemReviews((prev) => (prev ?? []).filter((r) => r.id !== review.id))
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ProfileSubpageShell>
  );
}
