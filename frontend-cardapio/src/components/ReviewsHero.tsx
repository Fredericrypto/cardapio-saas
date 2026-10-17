import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useReviewEligibility } from '../hooks/useReviewEligibility';
import { MENU_TEXT, MENU_TEXT_SOFT } from '../lib/menuTheme';
import { GlowButton } from './GlowButton';
import { ReviewModal } from './ReviewModal';
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
    <section aria-labelledby="reviews-hero-title" className="flex flex-col gap-6">
      <h2
        id="reviews-hero-title"
        className={`font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl ${MENU_TEXT}`}
      >
        {t('reviewsHero.titleStart')} <span className="text-[#d97757]">{t('reviewsHero.titleAccent')}</span>
      </h2>
      <p className={`max-w-md text-base leading-relaxed sm:text-lg ${MENU_TEXT_SOFT}`}>{t('reviewsHero.subtitle')}</p>

      {eligibility.status === 'can_review' && (
        <div className="rv-fade-up mt-2 flex items-center gap-5 sm:gap-6">
          <Heart
            className="rv-heart shrink-0 text-red-500"
            size={84}
            strokeWidth={1.5}
            fill="currentColor"
            aria-hidden="true"
          />
          <div className="flex flex-col items-start gap-4">
            <p className={`max-w-xs font-serif text-base italic leading-relaxed sm:text-lg ${MENU_TEXT_SOFT}`}>
              {t('reviewsHero.warm')}
            </p>
            <GlowButton orbit onClick={() => setModalOpen(true)} ariaLabel={t('reviewsHero.ctaAria')}>
              {t('reviewsHero.cta')}
            </GlowButton>
          </div>
        </div>
      )}

      {eligibility.status === 'reviewed' && (
        <div className="rv-fade-up mt-2 flex items-start gap-3" role="status">
          <Heart className="mt-0.5 shrink-0 text-red-500" size={22} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
          <p className={`max-w-md font-serif text-base italic leading-relaxed sm:text-lg ${MENU_TEXT_SOFT}`}>
            {t('reviewsHero.thanks')}
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
