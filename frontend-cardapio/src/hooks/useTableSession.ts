import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentTableSession, scanTableQrCode } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import type { TableSession } from '../types';

// `mesa_ativa_{slug}`: usado SÓ como conveniência pra montar o link do
// menu de baixo (BottomNav) quando o cliente navega pra uma página que
// não tem o token na própria URL (ex: "Minha conta", histórico de
// pedidos) — sem isso, o menu de baixo levava pro cardápio genérico e a
// mesa era "esquecida" ao voltar. IMPORTANTE: isso NÃO participa mais de
// nenhuma decisão sobre abrir/criar/reabrir sessão (ver reescrita da
// sessão F logo abaixo) — só decide pra ONDE um link aponta. Se estiver
// desatualizado, o pior caso é o link levar pra tela "mesa livre, toque
// pra pedir" em vez de ir direto — nunca cria nem reabre nada sozinho.
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

// REESCRITA 2026-09-13 (sessão F) — o modelo da sessão E (um "ponteiro"
// de qual mesa é "a ativa" por dispositivo, redirecionando abas antigas
// sozinho) causou o oposto do pedido: escanear uma mesa nova estava
// silenciosamente "transformando" a mesa de uma aba diferente na mesa
// nova, e vice-versa. Felipe foi taxativo: **nenhuma decisão sobre qual
// mesa mostrar pode depender de nada guardado no navegador** — nem
// localStorage, nem sessionStorage, nada disso sobrevive de forma
// confiável entre abas/tempo e, mais importante, ele não quer que
// sobreviva mesmo limpando cache. A fonte de verdade agora é 100%
// backend, recalculada do zero a cada carregamento de página:
//
//   - Essa mesa (esse token específico) tem sessão ativa agora? Se sim,
//     SEMPRE pede confirmação antes de mostrar — não importa se "essa
//     aba já esteve aqui antes" (não existe mais esse conceito). Único
//     jeito de entrar numa sessão que já existe.
//   - Se não tem sessão ativa: essa mesa já teve ALGUMA sessão antes
//     (checado no banco, não no navegador)? Se sim, está livre mas não
//     abre sozinha — mostra uma tela neutra "mesa livre agora" com um
//     botão explícito pra começar um pedido novo (uma ação de verdade
//     do cliente, nunca automática).
//   - Se a mesa nunca teve sessão nenhuma (mesa realmente virgem), aí
//     sim entra direto, sem fricção — não tem ninguém pra atrapalhar.
//
// Isso elimina de vez qualquer "mágica" de redirecionar uma aba pra
// mesa de outra, ou de uma aba velha reaparecer com o estado de antes:
// toda visita reconsulta o servidor do zero e nunca herda nada.
export function useTableSession(slug: string | undefined, qrCodeToken: string | undefined) {
  const { token: customerToken, isLoading: isAuthLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<TableSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // true = mesa sem sessão ativa, mas já usada antes — mostra a tela
  // "mesa livre, toque pra pedir" em vez de criar sozinha.
  const [tableIsFree, setTableIsFree] = useState(false);
  // token != null = essa mesa tem sessão ativa que ainda não é "minha"
  // nessa aba — pede confirmação antes de entrar.
  const [pendingJoinToken, setPendingJoinToken] = useState<string | null>(null);

  const doJoin = useCallback(
    async (token: string) => {
      const freshSession = await scanTableQrCode(token, customerToken);
      if (slug) setActiveMesaToken(slug, token);
      setSession(freshSession);
      setTableIsFree(false);
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
    setTableIsFree(false);
    try {
      const { session: current, hasHistory } = await getCurrentTableSession(qrCodeToken);
      if (current) {
        // Sempre pede confirmação — mesmo que essa "seja minha" sessão
        // de verdade (ex: só dei um refresh na própria aba). É a única
        // pergunta que sobrou no sistema, e ela cobre TODOS os casos de
        // forma previsível, em vez de tentar adivinhar por heurística.
        setSession(null);
        setPendingJoinToken(qrCodeToken);
      } else if (hasHistory) {
        // Mesa já foi usada antes e está livre agora — nunca cria
        // sessão nova sozinha, precisa de toque explícito (ver
        // `startNewOrderHere` abaixo).
        setSession(null);
        setTableIsFree(true);
        if (slug) clearActiveMesaTokenForSlug(slug);
      } else {
        // Mesa nunca teve sessão nenhuma — sem ninguém pra atrapalhar,
        // entra direto.
        await doJoin(qrCodeToken);
      }
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? 'Não foi possível abrir esta mesa. Peça ajuda a um garçom.');
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
      setError(backendMessage ?? 'Não foi possível abrir esta mesa. Peça ajuda a um garçom.');
    } finally {
      setIsLoading(false);
    }
  }, [pendingJoinToken, doJoin]);

  const declineJoinExisting = useCallback(() => {
    setPendingJoinToken(null);
    if (slug) navigate(`/${slug}`);
  }, [slug, navigate]);

  const startNewOrderHere = useCallback(async () => {
    if (!qrCodeToken) return;
    setIsLoading(true);
    setError(null);
    try {
      await doJoin(qrCodeToken);
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? 'Não foi possível abrir esta mesa. Peça ajuda a um garçom.');
    } finally {
      setIsLoading(false);
    }
  }, [qrCodeToken, doJoin]);

  // Reconfere no backend (fonte da verdade) se a sessão ainda está
  // ativa — usado pelo timer quando o prazo estoura, e pela varredura
  // de fundo abaixo. BUG REAL CORRIGIDO nesta reescrita: antes, um erro
  // de rede/timeout (bem comum com o backend no plano grátis do Render,
  // que "dorme" e demora pra acordar) era tratado como "sessão não
  // existe" (`.catch(() => null)`), fechando a sessão na tela do
  // cliente sozinho por causa de uma falha passageira de rede, não por
  // ela ter realmente acabado. Agora um erro de rede é ignorado
  // (mantém o estado atual, tenta de novo na próxima varredura) — só um
  // 200 de verdade sem sessão conta como "encerrada".
  const recheckExpiry = useCallback(async () => {
    if (!qrCodeToken) return;
    try {
      const { session: current } = await getCurrentTableSession(qrCodeToken);
      if (current) {
        setSession(current);
      } else {
        setSession(null);
        setTableIsFree(true);
        if (slug) clearActiveMesaTokenForSlug(slug);
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
    tableIsFree,
    pendingJoinToken,
    confirmJoinExisting,
    declineJoinExisting,
    startNewOrderHere,
    recheckExpiry,
  };
}

function extractBackendMessage(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
    : undefined;
}
