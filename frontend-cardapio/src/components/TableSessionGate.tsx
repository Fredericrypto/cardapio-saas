import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTableSession } from '../hooks/useTableSession';
import { TableSessionProvider } from '../contexts/TableSessionContext';
import { QrScannerModal } from './QrScannerModal';
import { TableSessionTimer } from './TableSessionTimer';
import { QrCode } from 'lucide-react';

// Porta de entrada de TODAS as rotas `/mesa/:qrCodeToken/*`. Decide entre
// três telas antes de mostrar qualquer coisa do cardápio:
//
// 1. Sessão já ativa (comum: cliente navegando dentro da própria visita)
//    → mostra os filhos direto, sem fricção nenhuma.
// 2. Nenhuma sessão ativa encontrada → pede confirmação explícita
//    ("Você está nessa mesa agora?") antes de criar uma. Sem essa
//    barreira, só CARREGAR a página (aba esquecida, refresh, histórico
//    do navegador) reabria a mesa sozinha depois da conta já paga — bug
//    real, já reportado.
// 3. Sessão expirou (prazo configurado estourou sem nenhum pedido) →
//    avisa e oferece escanear de novo.
export function TableSessionGate({ children }: { children: ReactNode }) {
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken: string }>();
  const navigate = useNavigate();
  const { session, isLoading, error, needsConfirmation, expired, confirmJoin, recheckExpiry } =
    useTableSession(qrCodeToken);
  const [showScanner, setShowScanner] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center bg-gray-50">
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={() => navigate(`/${slug}`)}
          className="text-sm font-semibold text-gray-900 underline"
        >
          Ir pro cardápio geral
        </button>
      </div>
    );
  }

  if (expired) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center bg-gray-50">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <QrCode size={26} className="text-amber-600" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">Sua sessão expirou</p>
            <p className="text-sm text-gray-500 mt-1">
              Você não fez nenhum pedido dentro do prazo. Escaneie o QR code da mesa de novo
              pra continuar.
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button
              onClick={() => setShowScanner(true)}
              className="py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
            >
              Escanear QR code de novo
            </button>
            <button
              onClick={() => navigate(`/${slug}`)}
              className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </div>
        {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} />}
      </>
    );
  }

  if (needsConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center bg-gray-50">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <QrCode size={26} className="text-gray-500" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">Você está nessa mesa agora?</p>
          <p className="text-sm text-gray-500 mt-1">
            Confirme pra abrir a conta dessa mesa e começar a pedir.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            onClick={confirmJoin}
            className="py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            Sim, estou nessa mesa
          </button>
          <button
            onClick={() => navigate(`/${slug}`)}
            className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Não, ver cardápio geral
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <TableSessionProvider value={{ session, recheckExpiry }}>
      <TableSessionTimer session={session} onExpiryTick={recheckExpiry} />
      {children}
    </TableSessionProvider>
  );
}
