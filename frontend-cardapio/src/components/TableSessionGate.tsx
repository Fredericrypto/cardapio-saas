import { type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTableSession } from '../hooks/useTableSession';
import { TableSessionProvider } from '../contexts/TableSessionContext';
import { TableSessionTimer } from './TableSessionTimer';
import { QrCode, Users } from 'lucide-react';
import { BUILD_VERSION } from '../buildInfo';

// Rodapezinho discreto só nas telas de estado do próprio gate (loading,
// confirmação, mesa livre, erro) — pedido do Felipe (sessão G) pra bater
// o olho e confirmar se o navegador está rodando o código novo ou um
// antigo ainda em memória/cache, sem precisar adivinhar.
function BuildMark() {
  return <p className="text-[10px] text-gray-300 mt-6 select-all">build {BUILD_VERSION}</p>;
}

// Porta de entrada de TODAS as rotas `/mesa/:qrCodeToken/*`. Ver o
// cabeçalho de `useTableSession.ts` (reescrita da sessão F) pra regra
// completa — resumo: NADA aqui depende de memória do navegador pra
// decidir o que mostrar, só do estado atual no backend pra esse token
// específico:
//
// 1. Mesa tem sessão ativa agora → pede confirmação (única pergunta que
//    sobrou) antes de mostrar qualquer coisa.
// 2. Mesa sem sessão ativa mas já usada antes → tela neutra "mesa livre
//    agora", com botão explícito pra começar um pedido novo. Nunca cria
//    nada sozinho.
// 3. Mesa nunca usada → entra direto, sem fricção.
export function TableSessionGate({ children }: { children: ReactNode }) {
  const { slug, qrCodeToken } = useParams<{ slug: string; qrCodeToken: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    session,
    isLoading,
    error,
    tableIsFree,
    pendingJoinToken,
    confirmJoinExisting,
    declineJoinExisting,
    startNewOrderHere,
    recheckExpiry,
  } = useTableSession(slug, qrCodeToken);

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
        <BuildMark />
      </div>
    );
  }

  if (pendingJoinToken) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center bg-gray-50">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <Users size={26} className="text-gray-500" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">Essa mesa já tem uma conta aberta</p>
          <p className="text-sm text-gray-500 mt-1">
            Já existe uma sessão em aberto nessa mesa. Continuar entra na mesma conta, com
            todos os pedidos já feitos.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            onClick={confirmJoinExisting}
            className="py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            Sim, continuar nessa mesa
          </button>
          <button
            onClick={declineJoinExisting}
            className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
          >
            Não, ver cardápio geral
          </button>
        </div>
        <BuildMark />
      </div>
    );
  }

  if (tableIsFree) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center bg-gray-50">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
          <QrCode size={26} className="text-gray-500" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">Essa mesa está livre agora</p>
          <p className="text-sm text-gray-500 mt-1">
            A última conta aqui já foi encerrada. Se você está sentado nessa mesa agora,
            toque abaixo pra começar um pedido novo.
          </p>
        </div>
        <button
          onClick={startNewOrderHere}
          className="py-3 px-6 rounded-xl bg-gray-900 text-white text-sm font-semibold"
        >
          Começar meu pedido nessa mesa
        </button>
        <BuildMark />
      </div>
    );
  }

  if (!session) return null;

  // O timer só fica embutido no header (ao lado do nome) na tela
  // principal do cardápio — nas outras páginas do fluxo de mesa
  // (carrinho, produto, "minha conta") não tem esse header, então sem
  // isso aqui o relógio simplesmente sumia ao navegar pra qualquer uma
  // delas, mesmo o pedido ainda não tendo sido feito. Continua sumindo
  // de verdade só quando `expiresAt` vem null (ou seja, quando já tem
  // pedido — ver TablesService.withTimerInfo) ou quando não há prazo
  // configurado.
  const isMainMenuPage = location.pathname === `/${slug}/mesa/${qrCodeToken}`;

  return (
    <TableSessionProvider value={{ session, recheckExpiry }}>
      {!isMainMenuPage && session.expiresAt && (
        <TableSessionTimer session={session} onExpiryTick={recheckExpiry} variant="fixed" />
      )}
      {children}
    </TableSessionProvider>
  );
}
