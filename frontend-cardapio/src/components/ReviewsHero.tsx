import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useReviewEligibility } from '../hooks/useReviewEligibility';
import { MENU_TEXT, MENU_TEXT_SOFT } from '../lib/menuTheme';
import { GlowButton } from './GlowButton';
import { ReviewModal } from './ReviewModal';
import { ReviewHeart } from './ReviewHeart';
import { CalligraphyArt } from './CalligraphyArt';
import { activeDateLocale } from '../i18n/languages';
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

  const isPt = activeDateLocale().toLowerCase().startsWith('pt');
  const showAsk = eligibility.status === 'guest' || eligibility.status === 'none' || eligibility.status === 'can_review';

  return (
    <section
      aria-labelledby="reviews-hero-title"
      style={{ containerType: 'inline-size' }}
      className="rv-font-callig flex flex-col items-center gap-0 text-center"
    >
      {/* Mensagem 1. Português: caligrafia em imagem (máscara colorida pelo tema). Outros idiomas:
          o mesmo texto em fonte caligráfica, já que a imagem só existe em português. */}
      <h2 id="reviews-hero-title" className={`w-full ${MENU_TEXT}`}>
        {isPt ? (
          <CalligraphyArt
            src="/reviews/title-base.png"
            accentSrc="/reviews/title-sabor.png"
            width={1200}
            height={420}
            alt={`${t('reviewsHero.titleTop')} ${t('reviewsHero.titleStart')} ${t('reviewsHero.titleAccent')}`}
            className="mx-auto max-w-[600px]"
          />
        ) : (
          <>
            <span className="block whitespace-nowrap font-medium leading-[0.95]" style={{ fontSize: '16.5cqw' }}>
              {t('reviewsHero.titleTop')}
            </span>
            <span className="mt-1 block whitespace-nowrap font-medium leading-tight" style={{ fontSize: '9.4cqw' }}>
              {t('reviewsHero.titleStart')} <span className="text-[#d97757]">{t('reviewsHero.titleAccent')}</span>
            </span>
          </>
        )}
      </h2>

      {showAsk && (
        <p className={`mt-10 max-w-md text-3xl leading-snug sm:text-4xl ${MENU_TEXT_SOFT}`}>
          {t('reviewsHero.subtitle')}
        </p>
      )}

      {eligibility.status === 'can_review' && (
        <div className="rv-fade-up mt-12 flex flex-col items-center gap-6">
          <p className={`max-w-lg text-3xl leading-snug sm:text-4xl ${MENU_TEXT_SOFT}`}>
            {t('reviewsHero.warm')}
            <ReviewHeart className="ml-1 inline-block h-20 w-20 align-middle sm:h-24 sm:w-24" />
          </p>
          <GlowButton orbit onClick={() => setModalOpen(true)} ariaLabel={t('reviewsHero.ctaAria')}>
            {t('reviewsHero.cta')}
          </GlowButton>
        </div>
      )}

      {eligibility.status === 'reviewed' && (
        <div className={`rv-fade-up mt-14 w-full lg:mt-20 ${MENU_TEXT_SOFT}`} role="status">
          {isPt ? (
            <CalligraphyArt
              src="/reviews/thanks.png"
              width={1000}
              height={1268}
              alt={t('reviewsHero.thanks')}
              className="mx-auto max-w-[400px] lg:max-w-[clamp(220px,40dvh,400px)]"
            >
              {/* Coração ao fim da frase, FORA do texto: à direita de "publicada." e abaixo de "está". */}
              <ReviewHeart className="absolute left-[81%] top-[74%] h-auto w-[19%]" />
            </CalligraphyArt>
          ) : (
            <p className="max-w-lg text-3xl leading-snug sm:text-4xl">
              {t('reviewsHero.thanks')}
              <ReviewHeart className="ml-1 inline-block h-16 w-16 align-middle sm:h-20 sm:w-20" />
            </p>
          )}
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
