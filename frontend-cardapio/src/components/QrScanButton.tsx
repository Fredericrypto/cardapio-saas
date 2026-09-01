import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QrCode } from 'lucide-react';
import { QrScannerModal } from './QrScannerModal';

// Botão fixo, sempre visível, canto superior — deixa o cliente escanear
// o QR da mesa direto de dentro do app, sem precisar sair e abrir a
// câmera nativa do celular manualmente. Some só na tela de login (não
// faz sentido escanear mesa por cima do formulário de entrar/criar
// conta).
export function QrScanButton() {
  const location = useLocation();
  const [showScanner, setShowScanner] = useState(false);
  const isOnAuthPage = location.pathname.includes('/conta-cliente/entrar');

  if (isOnAuthPage) return null;

  return (
    <>
      <button
        onClick={() => setShowScanner(true)}
        aria-label="Escanear QR code da mesa"
        className="fixed top-3 left-3 z-40 w-9 h-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-gray-600"
      >
        <QrCode size={17} />
      </button>
      {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} />}
    </>
  );
}
