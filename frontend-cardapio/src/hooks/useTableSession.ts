import { useCallback, useEffect, useState } from 'react';
import { getCurrentTableSession, scanTableQrCode } from '../lib/menu-api';
import type { TableSession } from '../types';

// Bug real que essa reescrita corrige: antes, `useTableSession` chamava
// scanTableQrCode (que CRIA sessão nova quando não encontra uma aberta)
// toda vez que a página de mesa MONTAVA — o que acontece em qualquer
// carregamento/recarregamento de URL, não só num scan de verdade. Uma
// aba esquecida, um refresh, o histórico do navegador: qualquer coisa
// que revisitasse a URL depois da conta já paga reabria a mesa sozinha,
// sem ninguém escanear nada fisicamente.
//
// Agora: primeiro só CONSULTA (getCurrentTableSession, nunca cria nada).
// Se já existe sessão ativa, segue direto pro cardápio, sem fricção
// nenhuma — é o caso comum (cliente navegando dentro da própria sessão
// que já escaneou). Se NÃO existe, expõe `needsConfirmation: true` — o
// componente que usa esse hook mostra uma tela pedindo confirmação
// explícita ("Você está nessa mesa agora?"), e só quando o cliente
// confirma é que `confirmJoin()` chama o scan de verdade.
export function useTableSession(qrCodeToken: string | undefined) {
  const [session, setSession] = useState<TableSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [expired, setExpired] = useState(false);

  const checkCurrent = useCallback(async () => {
    if (!qrCodeToken) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const current = await getCurrentTableSession(qrCodeToken);
      if (current) {
        setSession(current);
        setNeedsConfirmation(false);
        setExpired(false);
      } else {
        setSession(null);
        setNeedsConfirmation(true);
      }
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? 'Não foi possível abrir esta mesa. Peça ajuda a um garçom.');
    } finally {
      setIsLoading(false);
    }
  }, [qrCodeToken]);

  useEffect(() => {
    checkCurrent();
  }, [checkCurrent]);

  // AÇÃO EXPLÍCITA — só deve ser chamada a partir de um gesto real do
  // cliente (botão "Sim, estou nessa mesa" / scan de verdade dentro do
  // app), nunca automaticamente.
  const confirmJoin = useCallback(async () => {
    if (!qrCodeToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const freshSession = await scanTableQrCode(qrCodeToken);
      setSession(freshSession);
      setNeedsConfirmation(false);
      setExpired(false);
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? 'Não foi possível abrir esta mesa. Peça ajuda a um garçom.');
    } finally {
      setIsLoading(false);
    }
  }, [qrCodeToken]);

  // Chamado pelo componente do timer quando o prazo estoura no relógio
  // do CLIENTE — ainda assim reconsulta o backend (fonte da verdade,
  // pode já ter expirado por lá via a varredura periódica, ou o backend
  // pode discordar por alguns segundos de diferença de relógio) antes de
  // decidir mostrar a tela de expirado.
  const recheckExpiry = useCallback(async () => {
    if (!qrCodeToken) return;
    const current = await getCurrentTableSession(qrCodeToken).catch(() => null);
    if (!current) {
      setSession(null);
      setExpired(true);
    } else {
      setSession(current);
    }
  }, [qrCodeToken]);

  return { session, isLoading, error, needsConfirmation, expired, confirmJoin, recheckExpiry };
}

function extractBackendMessage(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
    : undefined;
}
