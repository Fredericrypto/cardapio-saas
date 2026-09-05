import { useState } from 'react';
import { QrCode } from 'lucide-react';
import { QrScannerModal } from './QrScannerModal';

interface QrScanButtonProps {
  // 'fixed': badge flutuante de canto, posição absoluta (comportamento
  // antigo). 'inline': só o ícone, sem posicionamento — encaixa dentro
  // do header ao lado do nome do restaurante (uso atual).
  variant?: 'fixed' | 'inline';
}

// Deixa o cliente escanear o QR da mesa direto de dentro do app, sem
// precisar sair e abrir a câmera nativa do celular manualmente.
export function QrScanButton({ variant = 'inline' }: QrScanButtonProps) {
  const [showScanner, setShowScanner] = useState(false);

  const positionClass =
    variant === 'fixed'
      ? 'fixed top-3 left-3 z-40 w-9 h-9 shadow-sm'
      : 'w-8 h-8';

  return (
    <>
      <button
        onClick={() => setShowScanner(true)}
        aria-label="Escanear QR code da mesa"
        className={`rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0 ${positionClass}`}
      >
        <QrCode size={15} />
      </button>
      {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} />}
    </>
  );
}
