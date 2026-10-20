import { useState, type CSSProperties, type ReactNode } from 'react';
import { FoodBackdrop } from '../FoodBackdrop';
import type { Tenant } from '../../types';
import './login-premium.css';

// Moldura da tela de login do CLIENTE (redesign premium): composição dividida.
//  - Esquerda: apresentação editorial (foto do próprio restaurante + marca + título serifado).
//  - Direita: painel de vidro fumê com o formulário (children).
// A foto é `tenant.coverImageUrl` (multi-tenant: cada restaurante mostra a SUA imagem). Sem foto, ou se ela
// falhar ao carregar, cai num fundo escuro com brilho quente discreto + o wallpaper de ícones do app.
// Sempre escuro (classe `dark` local), independente do tema do app. Estilos em login-premium.css (.lp-*).

interface LoginSplitProps {
  tenant: Tenant;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

// Ramo botânico (public/login/botanical-branch.webp). A orientação de cada canto é feita em CSS
// (.lp-botanical--tr gira 180°; .lp-botanical--bl usa o desenho original).
const BRANCH_SRC = '/login/botanical-branch.webp';

function Branch({ className }: { className: string }) {
  return <img src={BRANCH_SRC} alt="" aria-hidden="true" draggable={false} decoding="async" className={className} />;
}

// Primeira palavra em destaque normal; o restante vai em itálico na linha de baixo.
function splitTitle(title: string): [string, string] {
  const i = title.indexOf(' ');
  return i < 0 ? [title, ''] : [title.slice(0, i), title.slice(i + 1)];
}

function TenantLogo({ tenant, className }: { tenant: Tenant; className: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(tenant.logoUrl) && !failed;
  return (
    <span className={className}>
      {showImage ? (
        <img src={tenant.logoUrl ?? undefined} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="lp-logo__letter" aria-hidden="true">
          {tenant.name.charAt(0)}
        </span>
      )}
    </span>
  );
}

export function LoginSplit({ tenant, eyebrow, title, subtitle, children }: LoginSplitProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(tenant.coverImageUrl) && !coverFailed;
  const [titleMain, titleRest] = splitTitle(title);

  return (
    <div className="lp-root dark" style={{ '--lp-brand': tenant.primaryColor } as CSSProperties}>
      <FoodBackdrop />
      <div className="lp-glow" aria-hidden="true" />
      {showCover && (
        <div className="lp-photo" aria-hidden="true">
          <img
            className="lp-photo__img"
            src={tenant.coverImageUrl ?? undefined}
            alt=""
            decoding="async"
            onError={() => setCoverFailed(true)}
          />
        </div>
      )}

      <section className="lp-hero">
        <header className="lp-brand">
          <TenantLogo tenant={tenant} className="lp-logo" />
          <span className="lp-brand__name">{tenant.name}</span>
        </header>
        <div className="lp-editorial">
          <p className="lp-eyebrow">
            <span className="lp-eyebrow__rule" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 className="lp-title" aria-label={title}>
            <span className="lp-title__a" aria-hidden="true">
              {titleMain}
            </span>
            {titleRest && (
              <em className="lp-title__b" aria-hidden="true">
                {titleRest}
              </em>
            )}
          </h1>
          <span className="lp-ornament" aria-hidden="true">
            <i />
          </span>
          <p className="lp-sub">{subtitle}</p>
        </div>
      </section>

      <main className="lp-panel-wrap">
        <div className="lp-panel">
          <Branch className="lp-botanical lp-botanical--tr" />
          <Branch className="lp-botanical lp-botanical--bl" />
          <div className="lp-panel__inner">
            <div className="lp-panel-brand">
              <TenantLogo tenant={tenant} className="lp-logo lp-logo--lg" />
              <span className="lp-panel-brand__name">{tenant.name}</span>
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

// Estados sem restaurante ainda (carregando / erro): mesmo fundo escuro, sem painel.
export function LoginStateScreen({ children }: { children: ReactNode }) {
  return (
    <div className="lp-root lp-root--state dark">
      <FoodBackdrop />
      <div className="lp-state">{children}</div>
    </div>
  );
}
