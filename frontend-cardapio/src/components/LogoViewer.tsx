import { useI18n } from '../i18n/I18nContext';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import type { Tenant } from '../types';

// Logo e banner do restaurante em tela cheia (toque no logo/banner do header): o cardápio
// atrás fica com blur; fecha ao tocar fora ou no botão voltar do aparelho.
// O "voltar" funciona empurrando uma entrada no histórico ao abrir e
// consumindo-a ao fechar — assim voltar fecha o logo em vez de sair da
// página.
export function LogoViewer({
  tenant,
  size,
  className = '',
}: {
  tenant: Tenant;
  size: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('logo.viewLogo')}
        className={`${size} -mt-10 rounded-2xl border-4 border-white shadow-md bg-white overflow-hidden shrink-0 ${className}`}
      >
        <LogoImage tenant={tenant} textSize="text-lg" />
      </button>
      {open && <LogoOverlay tenant={tenant} onClose={() => setOpen(false)} />}
    </>
  );
}

function LogoImage({ tenant, textSize }: { tenant: Tenant; textSize: string }) {
  return tenant.logoUrl ? (
    <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
  ) : (
    <div
      className={`w-full h-full flex items-center justify-center text-white font-bold ${textSize}`}
      style={{ backgroundColor: tenant.primaryColor }}
    >
      {tenant.name[0]?.toUpperCase()}
    </div>
  );
}

// Casca compartilhada por logo e banner: fundo escurecido com blur, fecha
// ao tocar fora ou no botão voltar do aparelho. `onClose` vai por ref para
// um re-render do pai não refazer o efeito (o que desfaria e recriaria a
// entrada de histórico e fecharia o viewer sozinho).
function FullscreenOverlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useScrollLock(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let closedByBack = false;
    window.history.pushState({ logoViewer: true }, '');
    function onPop() {
      closedByBack = true;
      closeRef.current();
    }
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Fechou por toque fora: desfaz a entrada de histórico que criamos.
      if (!closedByBack && window.history.state?.logoViewer) window.history.back();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/50 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>,
    document.body,
  );
}

function LogoOverlay({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  return (
    <FullscreenOverlay label={tenant.name} onClose={onClose}>
      <div
        className="w-[78vw] max-w-sm aspect-square rounded-3xl overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <LogoImage tenant={tenant} textSize="text-7xl" />
      </div>
    </FullscreenOverlay>
  );
}

// Banner (capa) do restaurante: preenche o espaço do header e, ao tocar,
// abre em tela cheia com o mesmo comportamento do logo. Sem foto de capa
// (só o degradê) não há o que ampliar, então nada é clicável.
export function BannerViewer({ tenant }: { tenant: Tenant }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!tenant.coverImageUrl) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('logo.viewBanner')}
        className="absolute inset-0 w-full h-full block"
      >
        <img src={tenant.coverImageUrl} alt={tenant.name} className="w-full h-full object-cover" />
      </button>
      {open && (
        <FullscreenOverlay label={tenant.name} onClose={() => setOpen(false)}>
          <img
            src={tenant.coverImageUrl}
            alt={tenant.name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl bg-white"
          />
        </FullscreenOverlay>
      )}
    </>
  );
}
