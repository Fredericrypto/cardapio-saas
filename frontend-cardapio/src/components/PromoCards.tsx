import { localizedField } from '../i18n/contentText';
import { useI18n } from '../i18n/I18nContext';
import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import type { Promotion } from '../types';
import { CLOSED_MUTED_CLASS } from '../lib/storeStatus';
import { ShareButton } from './ShareButton';
import { useWheelHorizontalScroll } from '../hooks/useWheelHorizontalScroll';
import { Tooltip } from './Tooltip';

interface PromoCardsProps {
  promotions: Promotion[];
  primaryColor: string;
  onSelect: (promotionId: string) => void;
  // Loja fechada: visual atenuado, mas o carrossel rola e os cards abrem normalmente.
  muted?: boolean;
  // Monta o link público de cada promoção; sem ele não há botão de compartilhar.
  buildShareUrl?: (promotionId: string) => string;
}

// "1h 20min" / "45min" / "2 dias" — countdown de verdade. Acima de 48h
// vira dias (evita mostrar algo tipo "600h restantes", que ninguém lê
// como tempo de verdade). Atualiza a cada minuto.
function useCountdownLabel(endsAt: string | null): string | null {
  const { t } = useI18n();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setLabel(null);
      return;
    }
    function tick() {
      const diffMs = new Date(endsAt!).getTime() - Date.now();
      if (diffMs <= 0) {
        setLabel(t('promoCards.encerrada'));
        return;
      }
      const totalHours = diffMs / 3600000;
      if (totalHours >= 48) {
        const days = Math.floor(totalHours / 24);
        setLabel(`${days} dias`);
        return;
      }
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      setLabel(hours > 0 ? t('promoCards.hours_h_minutes_min', { hours: hours, minutes: minutes }) : `${minutes}min`);
    }
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return label;
}

// Cards grandes e tocáveis — tocar abre a tela de detalhe da promoção
// (foto grande, regras, botão "Usar promoção"), igual iFood. Foto
// própria ou herdada do produto vinculado (ver
// PromotionsService.attachDisplayImage). Só mostra promoções cadastradas
// de verdade, nunca inventa desconto.
export function PromoCards({ promotions, primaryColor, onSelect, muted = false, buildShareUrl }: PromoCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Roda do mouse sobre o carrossel rola na horizontal (celular/janela estreita;
  // no desktop o container vira grade e o hook não faz nada).
  useWheelHorizontalScroll(scrollRef, promotions.length > 0);

  if (promotions.length === 0) return null;

  // pb-4 + -mb-3: o container rola na horizontal, o que corta a sombra no
  // fundo; o respiro embaixo (compensado pela margem negativa, pra o
  // layout não mudar) deixa a sombra inteira aparecer.
  // Desktop (md+): carrossel vira grade (sem rolagem lateral, que não é
  // natural com mouse) com 2/3/4 colunas.
  return (
    <div ref={scrollRef} className="flex gap-3 px-4 pt-1 pb-4 -mb-3 overflow-x-auto no-scrollbar snap-x snap-mandatory md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:items-start md:gap-4 md:px-0 md:overflow-visible md:snap-none">
      {promotions.map((promo) => (
        <PromoCard key={promo.id} promo={promo} primaryColor={primaryColor} onSelect={onSelect} muted={muted} shareUrl={buildShareUrl?.(promo.id)} />
      ))}
    </div>
  );
}

function PromoCard({
  promo,
  primaryColor,
  onSelect,
  muted,
  shareUrl,
}: {
  promo: Promotion;
  primaryColor: string;
  onSelect: (id: string) => void;
  muted: boolean;
  shareUrl?: string;
}) {
  const { t } = useI18n();
  const countdownLabel = useCountdownLabel(promo.endsAt);

  return (
    <button
      onClick={() => onSelect(promo.id)}
      className={`shrink-0 w-[270px] md:w-auto h-36 md:h-40 snap-start rounded-2xl md:hover:shadow-[0_8px_22px_rgba(0,0,0,0.12)] transition-[transform,box-shadow] overflow-hidden relative shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-left active:scale-[0.98] dark:ring-1 dark:ring-white/10 ${muted ? CLOSED_MUTED_CLASS : ''}`}
    >
      <div className="relative h-full w-full">
        {promo.imageUrl ? (
          <img
            src={promo.imageUrl}
            alt={localizedField(promo, 'title')}
            className={`w-full h-full object-cover ${promo.alreadyUsedUp ? 'grayscale' : ''}`}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}99)`,
            }}
          />
        )}

        {/* Gradiente pra legibilidade do texto sobre a foto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

        {shareUrl && (
          <ShareButton
            variant="chip"
            className="absolute top-2.5 left-2.5"
            url={shareUrl}
            title={localizedField(promo, 'title')}
            text={promo.description ?? undefined}
          />
        )}

        {countdownLabel && !promo.alreadyUsedUp && (
          <span className="absolute top-2.5 right-2.5 bg-white text-orange-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
            <Clock size={10} />
            {countdownLabel}
          </span>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3.5">
          <div className="min-w-0">
            <p className="font-display font-extrabold text-white text-lg leading-tight drop-shadow-sm">
              {localizedField(promo, 'title')}
            </p>
            {promo.description && (
              // Descrição de uma linha: o balão com o texto completo só abre
              // quando ela está de fato cortada (reticências).
              <Tooltip label={localizedField(promo, 'description')} onlyIfTruncated className="block min-w-0">
                <p data-truncate className="text-white/90 text-[11px] mt-0.5 truncate leading-snug">
                  {localizedField(promo, 'description')}
                </p>
              </Tooltip>
            )}
          </div>
        </div>

        {promo.alreadyUsedUp && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="bg-white text-gray-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
              {t('promoCards.voce_ja_usou_essa')}
            </span>
          </div>
        )}
      </div>

    </button>
  );
}
