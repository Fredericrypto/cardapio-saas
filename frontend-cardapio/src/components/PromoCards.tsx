import { useEffect, useState } from 'react';
import { Clock, ChevronRight } from 'lucide-react';
import type { Promotion } from '../types';

interface PromoCardsProps {
  promotions: Promotion[];
  primaryColor: string;
  onSelect: (promotionId: string) => void;
}

// "1h 20min" / "45min" / "2 dias" — countdown de verdade. Acima de 48h
// vira dias (evita mostrar algo tipo "600h restantes", que ninguém lê
// como tempo de verdade). Atualiza a cada minuto.
function useCountdownLabel(endsAt: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setLabel(null);
      return;
    }
    function tick() {
      const diffMs = new Date(endsAt!).getTime() - Date.now();
      if (diffMs <= 0) {
        setLabel('Encerrada');
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
      setLabel(hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`);
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
export function PromoCards({ promotions, primaryColor, onSelect }: PromoCardsProps) {
  if (promotions.length === 0) return null;

  return (
    <div className="flex gap-3 px-4 pb-1 overflow-x-auto no-scrollbar snap-x snap-mandatory">
      {promotions.map((promo) => (
        <PromoCard key={promo.id} promo={promo} primaryColor={primaryColor} onSelect={onSelect} />
      ))}
    </div>
  );
}

function PromoCard({
  promo,
  primaryColor,
  onSelect,
}: {
  promo: Promotion;
  primaryColor: string;
  onSelect: (id: string) => void;
}) {
  const countdownLabel = useCountdownLabel(promo.endsAt);

  return (
    <button
      onClick={() => onSelect(promo.id)}
      className="shrink-0 w-[270px] snap-start rounded-2xl overflow-hidden relative shadow-[0_4px_16px_rgba(0,0,0,0.12)] text-left active:scale-[0.98] transition-transform"
    >
      <div className="relative h-36 w-full">
        {promo.imageUrl ? (
          <img
            src={promo.imageUrl}
            alt={promo.title}
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

        {countdownLabel && !promo.alreadyUsedUp && (
          <span className="absolute top-2.5 right-2.5 bg-white text-orange-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
            <Clock size={10} />
            {countdownLabel}
          </span>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-extrabold text-white text-lg leading-tight drop-shadow-sm">
              {promo.title}
            </p>
            {promo.description && (
              <p className="text-white/90 text-[11px] mt-0.5 line-clamp-1 leading-snug">
                {promo.description}
              </p>
            )}
          </div>
          {!promo.alreadyUsedUp && (
            <span className="shrink-0 w-7 h-7 rounded-full bg-white/95 flex items-center justify-center">
              <ChevronRight size={16} className="text-gray-700" />
            </span>
          )}
        </div>

        {promo.alreadyUsedUp && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="bg-white text-gray-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
              Você já usou essa promoção
            </span>
          </div>
        )}
      </div>

      {promo.minOrderValue > 0 && !promo.alreadyUsedUp && (
        <div className="bg-white px-3.5 py-1.5 text-[11px] text-gray-400">
          Pedido mínimo R$ {Number(promo.minOrderValue).toFixed(2).replace('.', ',')}
        </div>
      )}
    </button>
  );
}
