import { useI18n } from '../i18n/I18nContext';
import { useState } from 'react';
import { QrCode } from 'lucide-react';
import { QrScannerModal } from './QrScannerModal';
import { FloatingNotice } from './FloatingNotice';
import { Tooltip } from './Tooltip';

interface QrScanButtonProps {
  // 'fixed': badge flutuante de canto, posição absoluta (comportamento
  // antigo). 'inline': só o ícone, sem posicionamento — encaixa dentro
  // do header ao lado do nome do restaurante (uso atual).
  variant?: 'fixed' | 'inline';
}

// Deixa o cliente escanear o QR da mesa direto de dentro do app, sem
// precisar sair e abrir a câmera nativa do celular manualmente.
export function QrScanButton({ variant = 'inline' }: QrScanButtonProps) {
  const { t } = useI18n();
  const [showScanner, setShowScanner] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const positionClass =
    variant === 'fixed'
      ? 'fixed top-3 left-3 z-40 w-9 h-9 shadow-sm'
      : 'w-8 h-8';
  const label = t('qrScanButton.escanear_qr_code_da');

  return (
    <>
      <Tooltip label={label} className="inline-flex shrink-0">
        <button
          onClick={() => setShowScanner(true)}
          aria-label={label}
          className={`rounded-full bg-white/90 dark:bg-black/55 backdrop-blur-sm shadow-sm text-[#374151] dark:text-white flex items-center justify-center shrink-0 active:scale-90 transition-transform ${positionClass}`}
        >
          <QrCode size={15} strokeWidth={1.5} />
        </button>
      </Tooltip>
      {showScanner && (
        <QrScannerModal onClose={() => setShowScanner(false)} onCameraError={setNotice} />
      )}
      {notice && <FloatingNotice message={notice} onDone={() => setNotice(null)} />}
    </>
  );
}
