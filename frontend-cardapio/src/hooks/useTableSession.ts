import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentTableSession, scanTableQrCode, fetchTableInfo } from '../lib/menu-api';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';
import { useTenant } from '../contexts/TenantContext';
import { presetSelectedLocationId } from './useSelectedLocation';
import type { TableSession } from '../types';
import {
  adoptGuestSession,
  clearActiveMesaToken,
  consumeQrScanIntent,
  getSeatByTable,
  setActiveMesaToken,
  wasLeftLocally,
} from '../lib/seat';
export { getActiveMesaToken } from '../lib/seat';

// `mesa_ativa_{slug}`: usado SÓ como conveniência pra montar o link do
// menu de baixo (BottomNav) quando o cliente navega pra uma página que
// não tem o token na própria URL (ex: "Minha conta", histórico de
// pedidos). NÃO participa de nenhuma decisão sobre abrir/criar/reabrir
// sessão — só decide pra onde um link aponta.
// REGRA ABSOLUTA (30/09, decisão final do Felipe): sessão encerrada ou
// saída da mesa é DEFINITIVA — por qualquer motivo (cliente, admin,
// "corrigir sessão", pagamento, prazo, "sair da mesa"). Recarregar,
// voltar, restaurar aba ou limpar cache NUNCA reabre nem cria sessão; só
// um novo escaneamento do QR abre sessão nova.
//
// Duas camadas, a segunda é a que não depende do navegador:
//  1) SERVIDOR (assento): quem saiu perde o assento pra sempre — pedido,
//     fechamento e chamado de garçom com ele são recusados, e
//     getCurrentTableSession devolve seat='left'. Ver TablesService.
//  2) ESTE ARQUIVO: ENTRAR numa mesa só é permitido numa abertura NOVA da
//     página (escaneamento/link). Recarregar, voltar/avançar e o React
//     remontando dentro da mesma página só podem RETOMAR um assento que o
//     servidor confirma como vivo; sem essa prova (inclusive depois de
//     limpar os dados do site) → tela de sessão encerrada, nada é criado.
//
// LIMITE FÍSICO: o QR é só um link, e escanear de novo é, pro navegador e
// pro servidor, indistinguível de abrir o mesmo link de novo. Uma
// abertura nova deliberada sempre entra (gerando assento novo) — é a
// única porta, e é a que a regra pede ("somente via novo escaneamento").
// true = este documento foi aberto por uma navegação nova (QR, link,
// endereço digitado); false = refresh ou voltar/avançar.
function isFreshDocumentLoad(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) return nav.type === 'navigate';
    // Navegadores antigos: 0 = navigate, 1 = reload, 2 = back_forward.
    const legacy = (performance as unknown as { navigation?: { type?: number } }).navigation;
    if (legacy && typeof legacy.type === 'number') return legacy.type === 0;
  } catch {
    // ignora
  }
  return true;
}
// Esta página foi aberta JÁ numa URL de mesa? (vale na hora em que o app
// carrega, antes do roteador navegar). Só então o tipo de navegação do
// documento diz algo sobre "escaneou o QR".
const documentOpenedOnMesaUrl =
  typeof window !== 'undefined' && /\/mesa\//.test(window.location.pathname);

// Uma "abertura nova" (= escaneamento) vale em DOIS casos, nunca mais:
//  1) o documento foi aberto por navegação nova NUMA URL de mesa (câmera
//     do celular, link) — só na PRIMEIRA checagem da carga;
//  2) o leitor de QR do PRÓPRIO app acabou de ler este QR (intenção em
//     memória, de uso único e com validade curta, ver lib/seat.ts) —
//     esse caminho navega sem recarregar a página, então o navegador não
//     enxerga o scan sozinho (bug de 01/10: escanear de novo pelo app,
//     depois de sair da mesa, mostrava "sessão já fechada").
// Qualquer outra checagem — refresh, voltar/avançar, React remontando o
// gate, troca de conta — NÃO é um scan. Reaproveitada por 2s só pra não
// quebrar o duplo efeito do React em desenvolvimento.
let documentLoadConsumed = false;
let lastFreshDecision: { token: string; value: boolean; at: number } | null = null;
function takeFreshLoadDecision(qrCodeToken: string): boolean {
  const now = Date.now();
  if (
    lastFreshDecision &&
    lastFreshDecision.token === qrCodeToken &&
    now - lastFreshDecision.at < 2000
  ) {
    return lastFreshDecision.value;
  }
  const fromAppScanner = consumeQrScanIntent(qrCodeToken);
  const fromDocumentLoad = !documentLoadConsumed && documentOpenedOnMesaUrl && isFreshDocumentLoad();
  documentLoadConsumed = true;
  const value = fromAppScanner || fromDocumentLoad;
  lastFreshDecision = { token: qrCodeToken, value, at: now };
  return value;
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
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [session, setSession] = useState<TableSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // true = essa sessão específica acabou de encerrar — tela final, sem
  // nenhum botão de recomeçar aqui, só "voltar pro cardápio geral".
  const [sessionEnded, setSessionEnded] = useState(false);
  // true = ESTE cliente saiu da mesa (e a mesa pode continuar ativa pros
  // outros) — tela final própria, sem nenhum caminho de volta.
  const [leftTable, setLeftTable] = useState(false);
  // token != null = essa mesa tem sessão ativa que ainda não é "minha"
  // nessa aba — pede confirmação antes de entrar.
  const [pendingJoinToken, setPendingJoinToken] = useState<string | null>(null);

  const doJoin = useCallback(
    async (token: string, confirmed = false) => {
      try {
        const freshSession = await scanTableQrCode(token, customerToken, confirmed);
        if (slug) setActiveMesaToken(customerToken, slug, token);
        setSession(freshSession);
        setSessionEnded(false);
        setPendingJoinToken(null);
      } catch (err) {
        // O servidor EXIGE confirmação pra entrar numa mesa que já tem
        // seção aberta (pode ter aberto entre a checagem e o scan):
        // pergunta em vez de entrar sozinho.
        const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code === 'JOIN_CONFIRMATION_REQUIRED') {
          setSession(null);
          setPendingJoinToken(token);
          return;
        }
        throw err;
      }
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
    setLeftTable(false);
    // Decidido de forma SÍNCRONA, antes de qualquer await — ver a REGRA
    // ABSOLUTA no topo do arquivo.
    const isNewOpening = takeFreshLoadDecision(qrCodeToken);
    // Visitante que acabou de fazer login leva a seção dele pra conta; o que
    // é de OUTRA conta nunca é herdado (ver lib/seat.ts).
    adoptGuestSession(customerToken, slug, qrCodeToken);

    function showEnded(left: boolean) {
      setSession(null);
      if (slug) clearActiveMesaToken(customerToken, slug);
      if (left) setLeftTable(true);
      else setSessionEnded(true);
    }
    // Esta CONTA nunca teve seção nessa mesa (ex: troquei de conta no mesmo
    // aparelho e voltei por uma URL de mesa antiga): não é "sessão
    // encerrada" — simplesmente não é a mesa dela. Vai pro cardápio geral.
    function goToGeneralMenuSilently() {
      setSession(null);
      if (slug) {
        clearActiveMesaToken(customerToken, slug);
        navigate(`/${slug}`, { replace: true });
      }
    }
    const neverHadSeat =
      getSeatByTable(customerToken, qrCodeToken) === null && !wasLeftLocally(customerToken, qrCodeToken);

    try {
      const { session: current, recentlyEnded, seat } = await getCurrentTableSession(
        qrCodeToken,
        customerToken,
      );
      if (current) {
        if (seat === 'active') {
          // O SERVIDOR confirma que o assento é meu e está vivo: retomar.
          if (slug) setActiveMesaToken(customerToken, slug, qrCodeToken);
          setSession(current);
          setPendingJoinToken(null);
        } else if (!isNewOpening) {
          // Recarregar/voltar/remontar SEM assento vivo: nunca entra, nunca
          // pergunta. Se a conta nunca esteve nessa mesa → cardápio geral;
          // se saiu/encerrou → tela final.
          if (seat === 'none' && neverHadSeat) goToGeneralMenuSilently();
          else showEnded(seat === 'left' || wasLeftLocally(customerToken, qrCodeToken));
        } else {
          // Abertura nova (scan) de uma mesa que já tem conta aberta de
          // outra pessoa — confirmação explícita, como sempre foi.
          setSession(null);
          setPendingJoinToken(qrCodeToken);
        }
      } else if (recentlyEnded) {
        // Acabou de encerrar — tela final, sem saída pra recomeçar aqui.
        showEnded(wasLeftLocally(customerToken, qrCodeToken));
      } else if (!isNewOpening) {
        // Mesa livre, mas isto é recarregar/voltar: NUNCA abre sessão.
        if (neverHadSeat) goToGeneralMenuSilently();
        else showEnded(wasLeftLocally(customerToken, qrCodeToken));
      } else {
        // Abertura nova (scan) de uma mesa livre — entra direto.
        await doJoin(qrCodeToken);
      }
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? FRIENDLY_FALLBACK_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [qrCodeToken, doJoin, slug, customerToken, navigate]);

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
      await doJoin(pendingJoinToken, true);
    } catch (err) {
      const backendMessage = extractBackendMessage(err);
      setError(backendMessage ?? FRIENDLY_FALLBACK_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [pendingJoinToken, doJoin]);

  const declineJoinExisting = useCallback(async () => {
    setPendingJoinToken(null);
    // Pedido do Felipe (18/09): mesmo raciocínio do TableSessionGate —
    // corrige a loja selecionada pra ser a dessa mesa antes de mandar
    // pro cardápio geral, em vez de deixar cair numa loja escolhida
    // antes por engano.
    try {
      if (tenant && qrCodeToken) {
        const { locationId } = await fetchTableInfo(qrCodeToken);
        presetSelectedLocationId(tenant.id, locationId);
      }
    } catch {
      // segue o baile — pior caso, cai na loja que já estava selecionada.
    }
    if (slug) navigate(`/${slug}`);
  }, [slug, navigate, tenant, qrCodeToken]);

  // Reconfere no backend (fonte da verdade) se a sessão ainda está
  // ativa — usado pelo timer quando o prazo estoura, e pela varredura
  // de fundo abaixo. Um erro de rede/timeout (comum no Render grátis) é
  // ignorado — mantém o estado atual, tenta de novo depois — só um 200
  // de verdade sem sessão conta como "encerrada".
  const recheckExpiry = useCallback(async () => {
    if (!qrCodeToken) return;
    try {
      const { session: current, seat } = await getCurrentTableSession(qrCodeToken, customerToken);
      if (current && seat === 'active') {
        setSession(current);
      } else {
        // Sessão encerrada, ou o MEU assento saiu/não existe mais: fim,
        // definitivo. (Nunca "reabre" daqui — só um novo scan.)
        setSession(null);
        if (slug) clearActiveMesaToken(customerToken, slug);
        if (current && (seat === 'left' || wasLeftLocally(customerToken, qrCodeToken))) setLeftTable(true);
        else setSessionEnded(true);
      }
    } catch {
      // falha de rede/timeout — não mexe em nada, tenta de novo depois.
    }
  }, [qrCodeToken, slug, customerToken]);

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
    leftTable,
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
