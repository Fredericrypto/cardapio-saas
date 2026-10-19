import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { PROMO_SERIF } from '../lib/promotionTheme';
import { FOOD_ICONS } from './foodIcons';
import type { Tenant } from '../types';
import './splash-screen.css';

interface SplashScreenProps {
  tenant: Tenant | null;
  onFinish: () => void;
}

// Tempo minimo para a coreografia de entrada terminar (~2,8s) antes do fade-out.
const MIN_VISIBLE_MS = 3000;
const FADE_DURATION_MS = 400;

const fx = (n: number) => n.toFixed(1);
const dly = (s: number): CSSProperties => ({ '--d': `${s.toFixed(2)}s` } as CSSProperties);

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface BranchLeaf {
  transform: string;
  o: string;
  m: string;
  v: string;
  delay: number;
}
interface BranchTwig {
  d: string;
  delay: number;
}
interface BranchData {
  stem: string;
  twigs: BranchTwig[];
  leaves: BranchLeaf[];
}

function buildLeaf(x: number, y: number, a: number, L: number, delay: number): BranchLeaf {
  const W = L * 0.34;
  const o = `M0 0Q${fx(L * 0.42)} ${fx(-W * 1.05)} ${fx(L)} 0Q${fx(L * 0.5)} ${fx(W * 0.9)} 0 0Z`;
  const m = `M0 0Q${fx(L * 0.5)} ${fx(W * 0.06)} ${fx(L)} 0`;
  let v = '';
  for (let k = 1; k <= 4; k += 1) {
    const px = L * (0.16 + 0.17 * k);
    const w = W * (0.64 - 0.09 * k);
    v += `M${fx(px)} 0L${fx(px + L * 0.14)} ${fx(-w)}M${fx(px)} 0L${fx(px + L * 0.14)} ${fx(w * 0.85)}`;
  }
  return { transform: `translate(${fx(x)} ${fx(y)}) rotate(${fx(a)})`, o, m, v, delay };
}

// Ramo em nanquim: caule curvo + folhas alternadas + galhinhos secundarios.
function buildBranch(seed: number): BranchData {
  const R = makeRng(seed);
  const P = [
    [0, 255],
    [70, 215],
    [140, 120],
    [262, 36],
  ];
  const B = (t: number): [number, number] => {
    const u = 1 - t;
    return [
      u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
      u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1],
    ];
  };
  const T = (t: number): number => {
    const u = 1 - t;
    const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
    const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const twigs: BranchTwig[] = [];
  const leaves: BranchLeaf[] = [];

  for (let i = 1; i <= 8; i += 1) {
    const t = 0.1 + 0.1 * i;
    const sd = i % 2 ? 1 : -1;
    const p = B(t);
    const ta = T(t);
    const la = ta + sd * (46 + R() * 20);
    const L = (54 - 20 * t) * (0.85 + R() * 0.3);
    const tl = 9 + R() * 8;
    const r = (la * Math.PI) / 180;
    const bx = p[0] + tl * Math.cos(r);
    const by = p[1] + tl * Math.sin(r);
    const delay = 0.5 + t * 1.3;
    twigs.push({ d: `M${fx(p[0])} ${fx(p[1])}L${fx(bx)} ${fx(by)}`, delay });
    leaves.push(buildLeaf(bx, by, la, L, delay + 0.05));

    if (i === 3 || i === 6) {
      const ta2 = ta - sd * (34 + R() * 8);
      const r2 = (ta2 * Math.PI) / 180;
      const ex = p[0] + 46 * Math.cos(r2);
      const ey = p[1] + 46 * Math.sin(r2);
      const mx = p[0] + 24 * Math.cos(r2);
      const my = p[1] + 24 * Math.sin(r2);
      twigs.push({
        d: `M${fx(p[0])} ${fx(p[1])}Q${fx(mx + 4)} ${fx(my - 4)} ${fx(ex)} ${fx(ey)}`,
        delay: delay + 0.08,
      });
      leaves.push(buildLeaf(mx + 3, my - 3, ta2 - sd * 50, 26, delay + 0.15));
      leaves.push(buildLeaf(ex, ey, ta2 + sd * 8, 30, delay + 0.2));
      leaves.push(buildLeaf(mx + 2, my - 2, ta2 + sd * 62, 22, delay + 0.18));
    }
  }

  const te = T(1);
  leaves.push(buildLeaf(262, 36, te - 4, 56, 1.9));
  leaves.push(buildLeaf(252, 42, te + 44, 32, 1.85));
  leaves.push(buildLeaf(250, 44, te - 48, 30, 1.85));

  return { stem: 'M0 255C70 215 140 120 262 36', twigs, leaves };
}

function Branch({ data, className }: { data: BranchData; className: string }) {
  return (
    <svg className={`ss-branch ${className}`} viewBox="-10 -10 330 290" aria-hidden="true" focusable="false">
      <path className="ss-draw ss-stem" pathLength={1} d={data.stem} />
      {data.twigs.map((tw, i) => (
        <path key={`t${i}`} className="ss-lf" style={dly(tw.delay)} strokeWidth={0.8} d={tw.d} />
      ))}
      {data.leaves.map((lf, i) => (
        <g key={`l${i}`} className="ss-lf" style={dly(lf.delay)} transform={lf.transform}>
          <path className="ss-draw" pathLength={1} d={lf.o} />
          <path d={lf.m} strokeWidth={0.6} />
          <path d={lf.v} strokeWidth={0.42} strokeOpacity={0.75} />
        </g>
      ))}
    </svg>
  );
}

export function SplashScreen({ tenant, onFinish }: SplashScreenProps) {
  const { t } = useI18n();
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (!tenant) return;

    const fadeTimer = setTimeout(() => setIsFadingOut(true), MIN_VISIBLE_MS);
    const finishTimer = setTimeout(onFinish, MIN_VISIBLE_MS + FADE_DURATION_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [tenant, onFinish]);

  const branchA = useMemo(() => buildBranch(23), []);
  const branchB = useMemo(() => buildBranch(71), []);

  // Wallpaper: os mesmos icones de comida do cardapio (FOOD_ICONS), espalhados e girados.
  const wall = useMemo(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cell = w < 768 ? 64 : 112;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / (cell * 0.92)) + 1;
    const R = makeRng(7);
    const items: Array<{ id: string; Icon: (typeof FOOD_ICONS)[number]; left: number; top: number; size: number; rot: number }> = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (items.length >= 180) break;
        items.push({
          id: `${r}-${c}`,
          Icon: FOOD_ICONS[(r * 7 + c) % FOOD_ICONS.length],
          left: ((c + 0.2 + R() * 0.6) / cols) * 100,
          top: ((r + 0.2 + R() * 0.6) / rows) * 100,
          size: Math.round(cell * (0.26 + R() * 0.1)),
          rot: Math.round(R() * 50 - 25),
        });
      }
    }
    return items;
  }, []);

  const name = tenant?.name ?? '';
  const initial = name.trim().charAt(0).toUpperCase();
  const showLogo = Boolean(tenant?.logoUrl) && !logoFailed;

  return (
    <div
      role="status"
      aria-label={name || t('common.loading')}
      className="ss-root"
      style={{
        opacity: isFadingOut ? 0 : 1,
        transitionDuration: `${FADE_DURATION_MS}ms`,
        pointerEvents: isFadingOut ? 'none' : 'auto',
      }}
    >
      <div className="ss-wall" aria-hidden="true">
        {wall.map(({ id, Icon, left, top, size, rot }) => (
          <span
            key={id}
            className="ss-ico"
            style={{ left: `${left}%`, top: `${top}%`, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
          >
            <Icon size={size} strokeWidth={1.25} />
          </span>
        ))}
      </div>
      <div className="ss-bloom" aria-hidden="true" />
      <div className="ss-vignette" aria-hidden="true" />

      <Branch data={branchA} className="ss-b1" />
      <Branch data={branchB} className="ss-b2" />

      <div className="ss-center">
        {tenant && (
          <>
            {showLogo ? (
              <img src={tenant.logoUrl ?? undefined} alt="" className="ss-logo" onError={() => setLogoFailed(true)} />
            ) : (
              <div className="ss-mono" style={{ fontFamily: PROMO_SERIF }} aria-hidden="true">
                <span>{initial}</span>
              </div>
            )}
            <p
              className="ss-name"
              style={{
                fontFamily: PROMO_SERIF,
                fontWeight: 400,
                fontSize: 'clamp(30px, 4.4vw, 76px)',
                lineHeight: 1.08,
                letterSpacing: '0.01em',
              }}
            >
              {name}
            </p>
            <div className="ss-rule" aria-hidden="true" />
          </>
        )}
      </div>

      <div className="ss-bottom" aria-hidden="true">
        <span className="ss-label">{t('common.loading')}</span>
        <div className="ss-track">
          <div className="ss-bar" />
        </div>
      </div>
    </div>
  );
}
