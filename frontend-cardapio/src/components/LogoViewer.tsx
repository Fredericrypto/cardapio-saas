import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import type { Tenant } from '../types';

// Logo do restaurante em tela cheia (toque no logo do header): o cardápio
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver logo do restaurante"
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

function LogoOverlay({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  useScrollLock(true);

  useEffect(() => {
    let closedByBack = false;
    window.history.pushState({ logoViewer: true }, '');
    function onPop() {
      closedByBack = true;
      onClose();
    }
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Fechou por toque fora: desfaz a entrada de histórico que criamos.
      if (!closedByBack && window.history.state?.logoViewer) window.history.back();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-8 bg-black/50 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-label={tenant.name}
    >
      <div
        className="w-[78vw] max-w-sm aspect-square rounded-3xl overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <LogoImage tenant={tenant} textSize="text-7xl" />
      </div>
    </div>,
    document.body,
  );
}
