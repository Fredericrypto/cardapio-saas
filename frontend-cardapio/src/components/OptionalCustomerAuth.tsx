import { type ReactNode } from 'react';
import { useTenant } from '../contexts/TenantContext';

// Irmã do RequireCustomerAuth, mas SEM a trava de login — usada só nas
// rotas do fluxo de mesa (escanear QR físico e pedir). Decisão de
// produto: o cliente já está fisicamente dentro do restaurante quando
// escaneia a mesa, então pedir conta antes de mostrar o cardápio é
// fricção pura — mesmo risco de fazer alguém desistir e ir embora
// frustrado por só querer um lanche rápido. Login continua existindo e
// sendo valioso (cashback, avaliação, histórico, foto de perfil), só
// deixou de ser OBRIGATÓRIO pra pedir.
//
// Ainda espera o tenant carregar (senão TableSessionGate/MenuPage
// quebram tentando ler `tenant.id` undefined) e mostra erro/retry se a
// busca falhar — só a parte de "exigir customer" que não existe mais
// aqui. CustomerAuthContext continua rodando por baixo igual sempre
// (ver CustomerAppShell): se já existir um token válido salvo, `customer`
// já vem preenchido desde o primeiro render, então os perks de conta
// aparecem normalmente pra quem já está logado — isso aqui só para de
// FORÇAR quem não está.
export function OptionalCustomerAuth({ children }: { children: ReactNode }) {
  const { tenant, isLoading: isLoadingTenant, error: tenantError, retry: retryTenant } = useTenant();

  if (tenantError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center">
        <p className="text-sm text-gray-500">{tenantError}</p>
        <button onClick={retryTenant} className="text-sm font-semibold text-gray-900 underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!tenant || isLoadingTenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
