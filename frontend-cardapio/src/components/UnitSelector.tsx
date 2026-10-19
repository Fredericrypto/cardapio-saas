import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MapPin, Navigation, Store } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { routeUrl, formatDistance } from '../lib/locationRoute';
import { getStoreStatus } from '../lib/storeStatus';
import { MENU_BORDER, MENU_TEXT, MENU_TEXT_MUTED, MENU_TEXT_SOFT } from '../lib/menuTheme';
import type { Location } from '../types';
import { Tooltip } from './Tooltip';

// Ícone de rota (Google Maps) de uma unidade; mostra a distância quando a unidade já a traz.
function RouteLink({ location, accent }: { location: Location; accent: string }) {
  const { t } = useI18n();
  const [glow, setGlow] = useState(false);
  const href = routeUrl(location);
  if (!href) return null;
  const label = t('location.route', { name: location.name });
  return (
    <Tooltip label={label} className="contents">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          setGlow(true);
          window.setTimeout(() => setGlow(false), 900);
        }}
        aria-label={label}
        style={{ '--glow': accent } as CSSProperties}
        className={`loc-dist ${glow ? 'is-glow' : ''} shrink-0 inline-flex items-center gap-1 rounded-full border bg-transparent px-2 py-1 text-[11px] font-semibold tabular-nums backdrop-blur-md active:scale-95 ${MENU_BORDER} ${MENU_TEXT}`}
      >
        <Navigation size={12} strokeWidth={1.5} aria-hidden="true" />
        {location.distanceKm != null ? formatDistance(location.distanceKm) : null}
      </a>
    </Tooltip>
  );
}

function UnitRow({
  unit,
  selected,
  accent,
  now,
  onPick,
}: {
  unit: Location;
  selected: boolean;
  accent: string;
  now: ReturnType<typeof useMinuteClock>;
  onPick: (unit: Location) => void;
}) {
  const { t } = useI18n();
  const status = getStoreStatus(unit, now);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2.5 py-2.5 ${
        selected ? 'bg-black/[0.04] dark:bg-white/[0.07]' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
      }`}
    >
      <button
        type="button"
        onClick={() => onPick(unit)}
        aria-current={selected ? 'true' : undefined}
        aria-label={t('location.select', { name: unit.name })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB]/60 bg-transparent dark:border-white/15">
          <Store size={16} strokeWidth={1.5} style={{ color: accent }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${MENU_TEXT}`}>{unit.name}</span>
          {unit.address && <span className={`block truncate text-xs ${MENU_TEXT_MUTED}`}>{unit.address}</span>}
          <span
            className={`text-[11px] font-semibold ${
              status.isOpen ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
            }`}
          >
            {status.isOpen ? t('store.openNow') : t('store.closed')}
          </span>
        </span>
        {selected && <Check size={16} strokeWidth={1.5} aria-hidden="true" className={`shrink-0 ${MENU_TEXT_SOFT}`} />}
      </button>
      <RouteLink location={unit} accent={accent} />
    </div>
  );
}

// Seletor de unidade do header do cardápio (substitui a antiga página de unidades).
// - Mais de uma unidade: botão com dropdown (em portal, nunca cortado pelo cartão do header)
//   listando as unidades; cada uma com status e ícone de rota. Escolher fecha e troca a unidade.
// - Uma unidade só: rótulo estático + ícone de rota funcionando (sem dropdown).
export function UnitSelector({
  current,
  locations,
  onSelect,
  primaryColor,
  className = '',
}: {
  current: Location;
  locations: Location[] | null;
  onSelect?: (location: Location) => void;
  primaryColor: string;
  className?: string;
}) {
  const { t } = useI18n();
  const now = useMinuteClock();
  const accent = useAccentColor(primaryColor);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const units = locations && locations.length > 1 ? locations : null;

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const a = trigger.getBoundingClientRect();
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const below = a.bottom + 8;
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, a.top - 8 - h);
    const left = Math.min(Math.max(a.left + a.width / 2 - w / 2, 8), Math.max(8, window.innerWidth - w - 8));
    setCoords({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    // Só a rolagem da PÁGINA fecha o menu: o slide automático das promoções (e qualquer outro
    // elemento que role sozinho) dispara 'scroll' em captura e fechava o dropdown sozinho.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target !== document && target !== document.documentElement && target !== document.body) return;
      close();
    };
    // Barra de endereço do celular redimensiona só a altura ao rolar: só fecha se a LARGURA mudar.
    const startWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== startWidth) close();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  if (!units) {
    return (
      <div className={`flex max-w-full items-center gap-2.5 ${className}`}>
        <Tooltip label={current.name} onlyIfTruncated className="flex min-w-0">
          <span className="flex min-w-0 items-center gap-2 py-1.5">
            <MapPin size={15} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
            <span data-truncate className={`min-w-0 truncate text-sm font-medium ${MENU_TEXT_SOFT}`}>
              {current.name}
            </span>
          </span>
        </Tooltip>
        <RouteLink location={current} accent={accent} />
      </div>
    );
  }

  return (
    <div className={`flex max-w-full items-center ${className}`}>
      <Tooltip label={`${t('tooltip.changeUnit')}: ${current.name}`} className="inline-flex min-w-0 max-w-full">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`${t('tooltip.changeUnit')}: ${current.name}`}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          <MapPin size={15} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_MUTED}`} />
          <span data-truncate className={`min-w-0 truncate text-sm font-medium ${MENU_TEXT_SOFT}`}>
            {current.name}
          </span>
          <ChevronDown
            size={15}
            strokeWidth={1.5}
            className={`shrink-0 transition-transform ${MENU_TEXT_MUTED} ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              width: 'min(22rem, calc(100vw - 1rem))',
              visibility: coords ? 'visible' : 'hidden',
            }}
            className={`z-[999] flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto rounded-2xl border bg-[#FFFFFF]/90 p-2 shadow-xl backdrop-blur-xl dark:bg-[#1E1E20]/90 ${MENU_BORDER}`}
          >
            {units.map((unit) => (
              <UnitRow
                key={unit.id}
                unit={unit}
                selected={unit.id === current.id}
                accent={accent}
                now={now}
                onPick={(picked) => {
                  close();
                  if (picked.id !== current.id) onSelect?.(picked);
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
