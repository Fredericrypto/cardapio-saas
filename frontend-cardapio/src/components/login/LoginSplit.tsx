import { useState, type CSSProperties, type ReactNode } from 'react';
import { FoodBackdrop } from '../FoodBackdrop';
import { MenuBotanical } from '../MenuBotanical';
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
          <h1 className="lp-title">{title}</h1>
          <p className="lp-sub">{subtitle}</p>
        </div>
      </section>

      <main className="lp-panel-wrap">
        <div className="lp-panel">
          <MenuBotanical className="lp-botanical lp-botanical--tr" />
          <MenuBotanical className="lp-botanical lp-botanical--bl" />
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
