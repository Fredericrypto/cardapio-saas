import { useEffect, useRef, useState } from 'react';
import { scanTableQrCode } from '../lib/menu-api';
import type { TableSession } from '../types';

// Cada mesa (qrCodeToken) tem sua própria chave no localStorage, pra não
// misturar sessões se o mesmo celular escanear mesas diferentes num dia.
function storageKey(qrCodeToken: string) {
  return `table-session:${qrCodeToken}`;
}

export function useTableSession(qrCodeToken: string | undefined) {
  const [session, setSession] = useState<TableSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Evita chamada duplicada quando o React StrictMode dispara o efeito 2x
  // em dev (monta → desmonta → monta). O backend já é seguro contra scans
  // concorrentes de verdade (índice único + retry-select em TablesService),
  // isso aqui é só pra não gerar tráfego redundante.
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!qrCodeToken) {
      setIsLoading(false);
      return;
    }
    if (requestedTokenRef.current === qrCodeToken) {
      return;
    }
    requestedTokenRef.current = qrCodeToken;

    async function load() {
      try {
        setIsLoading(true);
        // Sempre confirma com o backend (idempotente) em vez de só confiar
        // no cache local — garante que a sessão ainda está "aberta" de fato.
        const freshSession = await scanTableQrCode(qrCodeToken!);
        setSession(freshSession);
        localStorage.setItem(storageKey(qrCodeToken!), JSON.stringify(freshSession));
      } catch (err) {
        // Repassa a mensagem específica do backend quando existir (ex:
        // "estabelecimento fechado") em vez de sempre mostrar o genérico
        // de QR code inválido — são causas bem diferentes pro cliente.
        const backendMessage =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        setError(backendMessage ?? 'Não foi possível abrir esta mesa. Peça ajuda a um garçom.');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [qrCodeToken]);

  return { session, isLoading, error };
}
