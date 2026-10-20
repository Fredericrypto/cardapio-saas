import { type ReactNode } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { BrandLoader } from './BrandLoader';

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
  const {
    tenant,
    isLoading: isLoadingTenant,
    error: tenantError,
    errorTransient: tenantErrorTransient,
    retry: retryTenant,
  } = useTenant();

  // Servidor acordando (Render) = estado normal de carregamento, nunca erro técnico:
  // o GET é refeito em lib/api.ts e este loader some sozinho quando o tenant chega.
  // Falha passageira: o loader continua igual e dispara a nova tentativa sozinho.
  // Erro definitivo (restaurante inexistente): tela simples, sem botão e sem texto técnico.
  if (tenantError) {
    return (
      <BrandLoader
        delayMs={400}
        unavailable={!tenantErrorTransient}
        onAutoRetry={tenantErrorTransient ? retryTenant : undefined}
      />
    );
  }

  if (!tenant || isLoadingTenant) {
    return <BrandLoader delayMs={400} />;
  }

  return <>{children}</>;
}
