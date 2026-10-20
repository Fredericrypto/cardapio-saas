import { useEffect, useRef, useState } from 'react';
import { Utensils } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { MENU_PAGE_BG } from '../lib/menuTheme';

// Mensagens que se revezam sob o spinner (~5s cada, com fade). 24 x 5s = 120s sem repetir;
// se a espera passar disso, volta a partir da segunda (a primeira é só a abertura).
const MESSAGE_KEYS = [
  'brandLoader.msg01', 'brandLoader.msg02', 'brandLoader.msg03', 'brandLoader.msg04',
  'brandLoader.msg05', 'brandLoader.msg06', 'brandLoader.msg07', 'brandLoader.msg08',
  'brandLoader.msg09', 'brandLoader.msg10', 'brandLoader.msg11', 'brandLoader.msg12',
  'brandLoader.msg13', 'brandLoader.msg14', 'brandLoader.msg15', 'brandLoader.msg16',
  'brandLoader.msg17', 'brandLoader.msg18', 'brandLoader.msg19', 'brandLoader.msg20',
  'brandLoader.msg21', 'brandLoader.msg22', 'brandLoader.msg23', 'brandLoader.msg24',
] as const;
const MESSAGE_MS = 5000;
const FADE_MS = 600;

interface BrandLoaderProps {
  /** Padrão: cobre a tela inteira e centraliza (fixed inset-0). false = centraliza no espaço do pai. */
  fullScreen?: boolean;
  /** Fundo escuro fixo (#131314), igual ao primeiro quadro da splash. */
  forceDark?: boolean;
  /** Só desenha spinner e texto depois desse tempo (servidor acordado = sem piscar). */
  delayMs?: number;
  /**
   * Passe o `retry` da tela quando ela estiver em estado de erro passageiro: o próprio loader
   * dispara a nova tentativa sozinho (espera 6s, 12s, 24s, até 30s); o cliente nunca vê erro nem botão.
   */
  onAutoRetry?: () => void;
  /** Erro definitivo (ex.: restaurante inexistente): sem giro, sem mensagens rotativas, sem botão. */
  unavailable?: boolean;
}

// Loader do cardápio: anel fino girando + garfo e faca ao centro + mensagens rotativas.
// Cor via --accent (useAccentColor), com fallback. Textos via t(). Antes do delay mostra só o fundo.
// Entre "carregando" e "erro passageiro" a tela é a mesma e o componente não remonta, então
// as mensagens seguem de onde estavam.
export function BrandLoader({
  fullScreen = true,
  forceDark = false,
  delayMs = 0,
  onAutoRetry,
  unavailable = false,
}: BrandLoaderProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(delayMs <= 0);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(true);
  const [round, setRound] = useState(0);
  const retryRef = useRef(onAutoRetry);
  const armed = !!onAutoRetry && !unavailable;

  useEffect(() => {
    retryRef.current = onAutoRetry;
  }, [onAutoRetry]);

  useEffect(() => {
    if (delayMs <= 0) return;
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  useEffect(() => {
    if (!visible || unavailable) return;
    const hide = window.setTimeout(() => setShown(false), MESSAGE_MS - FADE_MS);
    const next = window.setTimeout(() => {
      setIdx((i) => (i + 1 >= MESSAGE_KEYS.length ? 1 : i + 1));
      setShown(true);
    }, MESSAGE_MS);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(next);
    };
  }, [visible, unavailable, idx]);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => {
      retryRef.current?.();
      setRound((r) => r + 1);
    }, Math.min(6000 * 2 ** round, 30000));
    return () => window.clearTimeout(id);
  }, [armed, round]);

  const show = visible || unavailable;
  const shell = fullScreen ? 'fixed inset-0 z-[100]' : 'relative min-h-[60vh] w-full';
  const bg = forceDark ? 'bg-[#131314]' : MENU_PAGE_BG;
  const strong = forceDark ? 'text-[#ECECEC]' : 'text-[#1c1c1c] dark:text-[#ECECEC]';
  const soft = forceDark ? 'text-white/55' : 'text-black/55 dark:text-white/55';
  const title = unavailable ? t('brandLoader.notFoundTitle') : t('brandLoader.title');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={title}
      className={`${shell} ${bg} flex items-center justify-center`}
    >
      {show && (
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          <div className="relative h-[88px] w-[88px]" style={{ color: 'var(--accent, #D9B46A)' }}>
            <svg
              viewBox="0 0 88 88"
              fill="none"
              aria-hidden="true"
              className={`absolute inset-0 h-full w-full ${unavailable ? '' : 'animate-spin motion-reduce:animate-none'}`}
              style={unavailable ? undefined : { animationDuration: '1.15s' }}
            >
              <circle cx="44" cy="44" r="40" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
              {!unavailable && (
                <circle
                  cx="44"
                  cy="44"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="64 188"
                />
              )}
            </svg>
            <Utensils
              strokeWidth={1.5}
              aria-hidden="true"
              className={`absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 ${
                unavailable ? 'opacity-60' : 'animate-pulse motion-reduce:animate-none'
              }`}
            />
          </div>
          <div className="w-[20rem] max-w-full">
            <p className={`text-[17px] font-medium tracking-[0.01em] ${strong}`}>{title}</p>
            {unavailable ? (
              <p className={`mt-1.5 text-[13px] ${soft}`}>{t('brandLoader.notFoundHint')}</p>
            ) : (
              <p
                aria-hidden="true"
                className={`mt-1.5 min-h-[1.25rem] text-[13px] transition-all ease-out motion-reduce:transition-none ${soft} ${
                  shown ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
                }`}
                style={{ transitionDuration: `${FADE_MS}ms` }}
              >
                {t(MESSAGE_KEYS[idx])}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
