import { useEffect, useState } from 'react';
import type { Tenant } from '../types';

interface SplashScreenProps {
  tenant: Tenant | null;
  onFinish: () => void;
}

// Fica visível por um tempo mínimo (pra não "piscar" em conexões rápidas),
// depois faz um fade-out suave antes de sumir de vez.
const MIN_VISIBLE_MS = 1200;
const FADE_DURATION_MS = 400;

export function SplashScreen({ tenant, onFinish }: SplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!tenant) return;

    const fadeTimer = setTimeout(() => setIsFadingOut(true), MIN_VISIBLE_MS);
    const finishTimer = setTimeout(onFinish, MIN_VISIBLE_MS + FADE_DURATION_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [tenant, onFinish]);

  const primaryColor = tenant?.primaryColor || '#E63946';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-400"
      style={{
        backgroundColor: primaryColor,
        opacity: isFadingOut ? 0 : 1,
        transitionDuration: `${FADE_DURATION_MS}ms`,
        pointerEvents: isFadingOut ? 'none' : 'auto',
      }}
    >
      <div className="flex flex-col items-center gap-4 animate-pulse">
        {tenant?.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="w-24 h-24 rounded-2xl object-cover shadow-lg"
          />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-white/20 flex items-center justify-center">
            <span className="text-white text-4xl font-display font-bold">
              {tenant?.name?.[0]?.toUpperCase() || '?'}
            </span>
          </div>
        )}
        <h1 className="font-display font-bold text-2xl text-white tracking-tight">
          {tenant?.name || 'Carregando...'}
        </h1>
      </div>
    </div>
  );
}
