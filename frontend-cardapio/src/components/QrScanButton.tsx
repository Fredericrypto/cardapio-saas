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
          className={`rounded-full border border-[#F3F4F6] dark:border-white/10 bg-[#F9FAFB] dark:bg-[#1E1E20] hover:bg-[#F3F4F6] dark:hover:bg-white/10 flex items-center justify-center text-[#6B7280] dark:text-[#C4C7C5] shrink-0 transition-colors ${positionClass}`}
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
