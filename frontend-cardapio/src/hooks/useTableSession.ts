import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentTableSession, scanTableQrCode } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import type { TableSession } from '../types';

// `mesa_ativa_{slug}`: usado SÓ como conveniência pra montar o link do
// menu de baixo (BottomNav) quando o cliente navega pra uma página que
// não tem o token na própria URL (ex: "Minha conta", histórico de
// pedidos). NÃO participa de nenhuma decisão sobre abrir/criar/reabrir
// sessão — só decide pra onde um link aponta.
function activeMesaKey(slug: string) {
  return `mesa_ativa_${slug}`;
}
export function getActiveMesaToken(slug: string): string | null {
  return localStorage.getItem(activeMesaKey(slug));
}
function setActiveMesaToken(slug: string, qrCodeToken: string) {
  localStorage.setItem(activeMesaKey(slug), qrCodeToken);
}
export function clearActiveMesaTokenForSlug(slug: string) {
  localStorage.removeItem(activeMesaKey(slug));
}

// REESCRITA 2026-09-14 (sessão H). Duas exigências do Felipe que batem
// no MESMO carregamento de página (um refresh e um scan novo do QR são
// tecnicamente idênticos pro navegador — a URL é igual):
//   1. Fechar a conta e dar refresh no MESMO instante não pode reabrir
//      nada, nem perguntar nada — só "sessão encerrada" com um botão de
//      voltar pro cardápio geral, sem nenhum jeito de recomeçar ali.
//   2. Escanear/abrir uma mesa que genuinamente não tem ninguém há um
//      tempo não pode mostrar NENHUMA tela a mais — direto pro pedido,
//      sem perguntar nada, sem tela de "mesa livre, toque aqui".
// A única forma honesta de diferenciar isso, sem depender de nada
// guardado no navegador, é por TEMPO no servidor (ver
// `TablesService.getCurrentSession` — campo `recentlyEnded`, poucos
// minutos de janela): fechou agorinha = tela final sem saída; fechou faz
// tempo (ou nunca existiu) = mesa genuinamente livre, entra direto.
export function useTableSession(slug: string | undefined, qrCodeToken: string | undefined) {
  const { token: customerToken, isLoading: isAuthLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<TableSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // true = essa sessão específica acabou de encerrar — tela final, sem
  // nenhum botão de recomeçar aqui, só "voltar pro cardápio geral".
  const [sessionEnded, setSessionEnded] = useState(false);
  // token != null = essa mesa tem sessão ativa que ainda não é "minha"
  // nessa aba — pede confirmação antes de entrar.
  const [pendingJoinToken, setPendingJoinToken] = useState<string | null>(null);

  const doJoin = useCallback(
    async (token: string) => {
      const freshSession = await scanTableQrCode(token, customerToken);
      if (slug) setActiveMesaToken(slug, token);
      setSession(freshSession);
      setSessionEnded(false);
      setPendingJoinToken(null);
    },
    [customerToken, slug],
  );

  const checkCurrent = useCallback(async () => {
    if (!qrCodeToken) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setPendingJoinToken(null);
    setSessionEnded(false);
    try {
      const { session: current, recentlyEnded } = await getCurrentTableSession(qrCodeToken);
      if (current) {
        // Pedido do Felipe (17/09): "reconhecer com ABSOLUTA SEGURANÇA
        // que o cliente já tem mesa aberta" — `mesa_ativa_{slug}` só é
        // gravado dentro de `doJoin`, ou seja, só depois de uma entrada
        // de verdade (scan genuíno ou confirmação explícita) nessa
        // MESMA mesa. Se o token da URL bate com esse ponteiro, é
        // seguro pular a pergunta — não é um redirecionamento pra outra
        // mesa (isso já foi removido faz tempo), é só reconhecer "essa
        // sessão já é minha" sem perguntar de novo toda vez que o
        // React Router remonta esse componente (ex: ida e volta na
        // página de perfil). Qualquer token DIFERENTE do ponteiro
        // continua perguntando sempre, sem exceção.
        if (slug && getActiveMesaToken(slug) === qrCodeToken) {
          setSession(current);
          setPendingJoinToken(null);
        } else {
          setSession(null);
          setPendingJoinToken(qrCodeToken);
        }
      } else if (recentlyEnded) {
        // Acabou de encerrar — tela final, sem nenhuma saída pra
        // recomeçar aqui mesmo. Só escaneando o QR físico de novo, mais
        // tarde, quando já não contar mais como "recém-encerrada".
        setSession(null);
        if (slug) clearActiveMesaTokenForSlug(slug);
        setSessionEnded(true);
      } else {
        // Mesa genuinamente livre (nunca usada, ou encerrada há tempo
        // suficiente) — ninguém pra atrapalhar, entra direto.
        await doJoin(qrCodeToken);
      }
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? FRIENDLY_FALLBACK_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [qrCodeToken, doJoin, slug]);

  useEffect(() => {
    // Espera `useCustomerAuth` resolver antes do primeiro join — se não
    // esperar, uma mesa pode ser criada como convidado (customerId nulo)
    // com o login ainda carregando, e nunca mais vincula o cliente
    // depois (ver TablesService.openOrJoinSession no backend, que só
    // preenche o dono numa sessão que ainda não tem um).
    if (isAuthLoading) return;
    checkCurrent();
  }, [checkCurrent, isAuthLoading]);

  // AÇÕES EXPLÍCITAS — só chamadas a partir de um toque real do cliente
  // num botão, nunca automaticamente.
  const confirmJoinExisting = useCallback(async () => {
    if (!pendingJoinToken) return;
    setIsLoading(true);
    setError(null);
    try {
      await doJoin(pendingJoinToken);
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? FRIENDLY_FALLBACK_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [pendingJoinToken, doJoin]);

  const declineJoinExisting = useCallback(() => {
    setPendingJoinToken(null);
    if (slug) navigate(`/${slug}`);
  }, [slug, navigate]);

  // Reconfere no backend (fonte da verdade) se a sessão ainda está
  // ativa — usado pelo timer quando o prazo estoura, e pela varredura
  // de fundo abaixo. Um erro de rede/timeout (comum no Render grátis) é
  // ignorado — mantém o estado atual, tenta de novo depois — só um 200
  // de verdade sem sessão conta como "encerrada".
  const recheckExpiry = useCallback(async () => {
    if (!qrCodeToken) return;
    try {
      const { session: current } = await getCurrentTableSession(qrCodeToken);
      if (current) {
        setSession(current);
      } else {
        setSession(null);
        if (slug) clearActiveMesaTokenForSlug(slug);
        setSessionEnded(true);
      }
    } catch {
      // falha de rede/timeout — não mexe em nada, tenta de novo depois.
    }
  }, [qrCodeToken, slug]);

  // Varredura de fundo: detecta fechamento feito em OUTRO dispositivo ou
  // pelo admin, mesmo sem nenhuma interação nessa aba. A cada 20s
  // enquanto existir uma sessão ativa mostrada aqui, pausando quando a
  // aba sai de foco (bateria/dados) e reconferindo na hora que ela volta
  // a ficar visível.
  useEffect(() => {
    if (!session) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (interval) return;
      interval = setInterval(recheckExpiry, 20_000);
    }
    function stop() {
      if (interval) clearInterval(interval);
      interval = null;
    }
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        recheckExpiry();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session, recheckExpiry]);

  return {
    session,
    isLoading,
    error,
    sessionEnded,
    pendingJoinToken,
    confirmJoinExisting,
    declineJoinExisting,
    recheckExpiry,
  };
}

// Pedido do Felipe (16/09): nunca mostrar texto cru do servidor pro
// cliente — nem por engano, se algum dia um erro inesperado (500,
// "Internal server error", stack trace, etc) vazar até aqui. Só confia
// na mensagem do backend quando é claramente um erro 4xx (as exceções
// que eu mesmo escrevo de propósito em português simples pro cliente
// ler — ex: "essa mesa já tem conta aberta"); qualquer coisa 5xx ou sem
// status reconhecível vira uma mensagem genérica e amigável, sem
// revelar NADA do que quebrou por trás.
function extractBackendMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const response = (err as { response?: { status?: number; data?: { message?: string } } })
    .response;
  const status = response?.status;
  if (!status || status < 400 || status >= 500) return undefined;
  return response?.data?.message;
}

const FRIENDLY_FALLBACK_MESSAGE =
  'Não conseguimos abrir essa mesa agora. Chame um garçom pra te ajudar.';
