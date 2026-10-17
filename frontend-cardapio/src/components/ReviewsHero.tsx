import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useReviewEligibility } from '../hooks/useReviewEligibility';
import { MENU_TEXT, MENU_TEXT_SOFT } from '../lib/menuTheme';
import { GlowButton } from './GlowButton';
import { ReviewModal } from './ReviewModal';
import { ReviewHeart } from './ReviewHeart';
import './review-extras.css';

// Coluna esquerda da página de avaliações.
//  - Mensagem principal: SEMPRE.
//  - CENÁRIO A (comprou e ainda não avaliou): mensagem acolhedora + coração + botão que abre o modal.
//  - CENÁRIO B (visitante / sem compra elegível): só a mensagem principal.
//  - CENÁRIO C (já avaliou / acabou de avaliar): mensagem de agradecimento permanente
//    (vem do servidor via fetchMyReviews, então continua lá em qualquer visita futura).
export function ReviewsHero({ onReviewPublished }: { onReviewPublished?: () => void }) {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { token } = useCustomerAuth();
  const { eligibility, markReviewed } = useReviewEligibility(tenant?.id, token);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section aria-labelledby="reviews-hero-title" className="flex flex-col gap-5">
      <h2
        id="reviews-hero-title"
        className={`rv-font-tangerine font-bold tracking-normal ${MENU_TEXT}`}
      >
        <span className="block text-7xl leading-[0.9] sm:text-8xl lg:text-9xl">{t('reviewsHero.titleTop')}</span>
        <span className="mt-1 block text-5xl leading-none sm:text-6xl lg:text-7xl">
          {t('reviewsHero.titleStart')} <span className="text-[#d97757]">{t('reviewsHero.titleAccent')}</span>
        </span>
      </h2>
      <p className={`rv-font-tangerine max-w-md text-3xl font-bold leading-tight sm:text-4xl ${MENU_TEXT_SOFT}`}>
        {t('reviewsHero.subtitle')}
      </p>

      {eligibility.status === 'can_review' && (
        <div className="rv-fade-up mt-2 flex flex-col items-start gap-5">
          <p className={`rv-font-ephesis max-w-lg text-2xl leading-snug sm:text-3xl ${MENU_TEXT_SOFT}`}>
            {t('reviewsHero.warm')}
            <ReviewHeart className="ml-1 inline-block h-20 w-20 align-middle sm:h-24 sm:w-24" />
          </p>
          <GlowButton orbit onClick={() => setModalOpen(true)} ariaLabel={t('reviewsHero.ctaAria')}>
            {t('reviewsHero.cta')}
          </GlowButton>
        </div>
      )}

      {eligibility.status === 'reviewed' && (
        <div className="rv-fade-up mt-2" role="status">
          <p className={`rv-font-ephesis max-w-lg text-2xl leading-snug sm:text-3xl ${MENU_TEXT_SOFT}`}>
            {t('reviewsHero.thanks')}
            <ReviewHeart className="ml-1 inline-block h-16 w-16 align-middle sm:h-20 sm:w-20" />
          </p>
        </div>
      )}

      {modalOpen && eligibility.status === 'can_review' && tenant && token && (
        <ReviewModal
          tenantId={tenant.id}
          token={token}
          orderId={eligibility.orderId}
          target={{ type: 'restaurant', orderLabel: t('reviewPromptProvider.avaliacao_do_restaurante') }}
          onClose={() => setModalOpen(false)}
          onSubmitted={() => {
            setModalOpen(false);
            markReviewed();
            onReviewPublished?.();
          }}
        />
      )}
    </section>
  );
}
