import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, MapPinOff, Navigation, Store, ChevronRight, Star } from 'lucide-react';
import { fetchLocations } from '../lib/menu-api';
import { fetchReviewsSummaryByLocation } from '../lib/customer-api';
import type { ReviewSummary } from '../lib/customer-api';
import { useSelectedLocation } from '../hooks/useSelectedLocation';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { useAccentColor } from '../hooks/useAccentColor';
import { useI18n } from '../i18n/I18nContext';
import { activeDateLocale } from '../i18n/languages';
import { getStoreStatus } from '../lib/storeStatus';
import { formatNextOpening } from '../lib/openingHours';
import { getActiveMesaToken } from '../lib/seat';
import { MENU_BORDER, MENU_PAGE_BG, MENU_TEXT, MENU_TEXT_FAINT, MENU_TEXT_MUTED } from '../lib/menuTheme';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { FoodBackdrop } from '../components/FoodBackdrop';
import { Tooltip } from '../components/Tooltip';
import type { Location } from '../types';

// Mesma distância "em linha reta" usada no backend (haversine) — só pra
// ORDENAR a lista da mais perto pra mais longe, nada crítico o
// suficiente pra exigir precisão de servidor aqui.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Link de rota do Google Maps até a unidade: abre o app do Maps no celular (ou o
// site no computador) já com o destino preenchido; a origem é a posição de quem abre.
// Usa as coordenadas quando existem; senão o endereço; sem nenhum dos dois, sem botão.
function routeUrl(location: Location): string | null {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=';
  if (location.latitude != null && location.longitude != null) {
    return `${base}${location.latitude},${location.longitude}`;
  }
  if (location.address) return `${base}${encodeURIComponent(location.address)}`;
  return null;
}

// "850 m" abaixo de 1 km; a partir daí "1,2 km" / "1.2 km" no formato do idioma ativo.
function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  const n = new Intl.NumberFormat(activeDateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km);
  return `${n} km`;
}

// Tela de escolha de loja — mesma lógica do app do McDonald's: tenta
// pegar a localização do celular e já sugere a mais perto, mas sempre
// deixa escolher manualmente na lista (o GPS pode estar desligado, ou o
// cliente pode simplesmente preferir outra unidade).
//
// Visual: o mesmo do cardápio — wallpaper de ícones (FoodBackdrop) atrás de
// tudo, superfícies de vidro (transparentes com desfoque) e borda fina, cores
// pelo tema claro/escuro de lib/menuTheme.ts. A barra de navegação (DesktopNav
// no topo, BottomNav no celular) vem do NavLayout que envolve esta rota.
// Só apresentação: toda a lógica de dados/seleção abaixo é a de antes.
export function LocationPickerPage() {
  const { t } = useI18n();
  const now = useMinuteClock();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token: customerToken } = useCustomerAuth();
  const { tenant } = useTenant();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'done' | 'denied' | 'unavailable'>('idle');
  const { selectLocation } = useSelectedLocation(tenant?.id);
  const [reviewSummaries, setReviewSummaries] = useState<Record<string, ReviewSummary>>({});
  // Cor do restaurante legível sobre o fundo escuro (mesmo hook do ProductCard).
  const accent = useAccentColor(tenant?.primaryColor ?? '#3d3846');
  // Card cujo botão de distância acabou de ser tocado: dispara o brilho (ver .loc-dist no index.css).
  const [glowId, setGlowId] = useState<string | null>(null);
  function flashGlow(id: string) {
    setGlowId(id);
    window.setTimeout(() => setGlowId((current) => (current === id ? null : current)), 900);
  }

  // BUG GRAVE CORRIGIDO: antes, dava pra escolher uma unidade DIFERENTE
  // aqui mesmo estando com uma mesa ativa em OUTRA unidade — e a
  // escolha valia, deixando "pedir" numa loja em que o cliente não está
  // fisicamente. Uma mesa é physicamente amarrada a UMA unidade (o QR
  // está colado numa mesa real, num lugar real) — não faz sentido nunca
  // trocar de unidade enquanto se está numa mesa. Em vez de só corrigir
  // depois da escolha, a tela inteira nem deixa chegar aqui: manda de
  // volta pra mesa direto, ANTES de qualquer seleção ser possível.
  useEffect(() => {
    if (!slug) return;
    const activeMesaToken = getActiveMesaToken(customerToken, slug);
    if (activeMesaToken) {
      navigate(`/${slug}/mesa/${activeMesaToken}`, { replace: true });
    }
  }, [slug, navigate, customerToken]);

  useEffect(() => {
    if (!tenant) return;
    fetchLocations(tenant.id).then((locs) => {
      setLocations(locs);
      fetchReviewsSummaryByLocation(tenant.id)
        .then(setReviewSummaries)
        .catch(() => setReviewSummaries({}));
    });
  }, [tenant]);

  useEffect(() => {
    if (!locations || locations.length <= 1) return; // uma loja só não precisa de GPS
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocations((prev) =>
          prev
            ? [...prev]
                .map((l) =>
                  l.latitude != null && l.longitude != null
                    ? { ...l, distanceKm: haversineKm(latitude, longitude, l.latitude, l.longitude) }
                    : l,
                )
                .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
            : prev,
        );
        setGpsStatus('done');
      },
      (error) => setGpsStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      // 20 s: no computador a localização por Wi-Fi/IP demora mais que o GPS do celular.
      { timeout: 20000, maximumAge: 300000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations === null]);

  function handleSelect(location: Location) {
    selectLocation(location);
    // Se o cliente tem uma mesa com sessão ainda ativa nesse restaurante
    // (ex: acabou caindo aqui sem querer, saindo do fluxo de mesa —
    // "cardápio geral"/erro/expirado oferecem esse caminho), escolher
    // uma unidade aqui não deveria jogar ele pro modo entrega/retirada
    // "como se estivesse em casa" — a loja da mesa já está fixa pela
    // própria mesa. Volta pra ela, timer e tudo, em vez do cardápio
    // geral.
    const activeMesaToken = slug ? getActiveMesaToken(customerToken, slug) : null;
    navigate(activeMesaToken ? `/${slug}/mesa/${activeMesaToken}` : `/${slug}`);
  }

  if (!tenant || !locations) {
    return (
      <div className={`min-h-[calc(100dvh_-_var(--bottom-nav-h,0px))] ${MENU_PAGE_BG} relative isolate flex items-center justify-center`}>
        <FoodBackdrop />
        <div className="w-8 h-8 border-2 border-[#E5E7EB] dark:border-white/15 border-t-[#6B7280] dark:border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  // `isolate`: contexto de empilhamento próprio, para o wallpaper (z-index
  // negativo) ficar atrás do conteúdo sem sumir atrás do fundo da página.
  return (
    <div className={`min-h-[calc(100dvh_-_var(--bottom-nav-h,0px))] ${MENU_PAGE_BG} relative isolate`}>
      <FoodBackdrop />
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-8 md:pt-10">
        <header className={`rounded-3xl border bg-transparent backdrop-blur-md ${MENU_BORDER} px-5 pt-6 pb-5 text-center`}>
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border-4 border-white shadow-md bg-white"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-3 border-4 border-white shadow-md"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className={`font-display text-lg font-bold ${MENU_TEXT}`}>{tenant.name}</h1>
          <p className={`text-sm mt-1 ${MENU_TEXT_MUTED}`}>{t('location.title')}</p>
          {gpsStatus === 'locating' && (
            <p className={`mt-3 text-xs flex items-center justify-center gap-1.5 ${MENU_TEXT_MUTED}`}>
              <Navigation size={13} strokeWidth={1.5} className="animate-pulse" />
              {t('location.searching')}
            </p>
          )}
        </header>

        {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
          <p className={`mt-3 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap ${MENU_TEXT_MUTED}`}>
            <MapPinOff size={13} strokeWidth={1.5} className="shrink-0" />
            {t('location.gpsUnavailable')}
          </p>
        )}

        <div className="mt-4 grid gap-2.5 md:grid-cols-2 md:gap-3">
          {locations.map((location) => {
            const status = getStoreStatus(location, now);
            const nextOpeningLabel = status.isOpen ? null : formatNextOpening(status.nextOpening, t);
            const summary = reviewSummaries[location.id];
            const reviewCount = summary?.count ?? 0;
            const href = routeUrl(location);
            return (
              // Cartão = div; o botão de escolher é uma camada esticada por baixo
              // (inset-0) e o link de rota fica por cima, irmão dele — nada de
              // botão dentro de botão, e cada um com o seu balão.
              <div
                key={location.id}
                className={`loc-card relative h-full rounded-2xl border bg-transparent backdrop-blur-md ${MENU_BORDER} p-4 flex items-center transition-[transform,box-shadow] duration-200 active:scale-[0.985] ${
                  !status.isOpen ? 'grayscale opacity-60' : ''
                }`}
                style={{ '--glow': accent } as CSSProperties}
              >
                <Tooltip label={t('location.select', { name: location.name })} className="absolute inset-0 block">
                  <button
                    type="button"
                    onClick={() => handleSelect(location)}
                    aria-label={t('location.select', { name: location.name })}
                    className="block h-full w-full rounded-2xl outline-none"
                  />
                </Tooltip>
                <div className="relative z-10 flex w-full items-center gap-3 pointer-events-none">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/40 dark:bg-white/10 backdrop-blur-md border border-[#E5E7EB]/60 dark:border-white/15 shadow-sm">
                    <Store size={18} strokeWidth={1.5} style={{ color: accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-display font-bold text-sm ${MENU_TEXT}`}>{location.name}</p>
                    {location.address && (
                      <p className={`text-xs flex items-start gap-1 mt-0.5 ${MENU_TEXT_MUTED}`}>
                        <MapPin size={11} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{location.address}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={`text-[11px] font-semibold ${
                          status.isOpen ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {status.isOpen ? t('store.openNow') : t('store.closed')}
                      </span>
                      {nextOpeningLabel && <span className={`text-[11px] ${MENU_TEXT_MUTED}`}>· {nextOpeningLabel}</span>}
                      <span className={`text-[11px] flex items-center gap-0.5 ${MENU_TEXT_MUTED}`}>
                        ·{' '}
                        <Star
                          size={10}
                          strokeWidth={1.5}
                          fill={reviewCount > 0 ? '#F59E0B' : 'transparent'}
                          className={reviewCount > 0 ? 'text-amber-500' : MENU_TEXT_FAINT}
                        />
                        {reviewCount > 0 && summary ? summary.average.toFixed(1) : '—'} ({reviewCount})
                      </span>
                    </div>
                  </div>
                  {location.distanceKm != null ? (
                    <Tooltip label={t('location.route', { name: location.name })} className="contents">
                      <a
                        href={href ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => flashGlow(location.id)}
                        aria-label={`${t('location.distanceAway', { distance: formatDistance(location.distanceKm) })} · ${t('location.route', { name: location.name })}`}
                        className={`loc-dist ${glowId === location.id ? 'is-glow' : ''} pointer-events-auto shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums bg-white/40 dark:bg-white/10 backdrop-blur-md border border-[#E5E7EB]/60 dark:border-white/15 active:scale-95 ${MENU_TEXT}`}
                      >
                        <Navigation size={12} strokeWidth={1.5} aria-hidden="true" />
                        {formatDistance(location.distanceKm)}
                      </a>
                    </Tooltip>
                  ) : gpsStatus === 'locating' ? (
                    <span
                      aria-hidden="true"
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold bg-white/40 dark:bg-white/10 backdrop-blur-md border border-[#E5E7EB]/60 dark:border-white/15 ${MENU_TEXT_MUTED}`}
                    >
                      <Navigation size={12} strokeWidth={1.5} className="animate-pulse" />…
                    </span>
                  ) : null}
                  <ChevronRight size={16} strokeWidth={1.5} className={`shrink-0 ${MENU_TEXT_FAINT}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
