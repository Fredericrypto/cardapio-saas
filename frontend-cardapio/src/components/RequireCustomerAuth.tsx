import { useI18n } from '../i18n/I18nContext';
import { type ReactNode } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { useCustomerAuth } from '../contexts/CustomerAuthContext';

// Trava o app inteiro atrás de login — decisão de produto explícita
// (igual Instagram: sem navegação anônima). Toda rota do cardápio
// exceto a própria tela de entrar/criar conta passa por aqui. Isso
// também é metade da correção do vazamento de carrinho entre contas:
// sem sessão anônima navegável, não existe mais o cenário de "adicionei
// item deslogado, depois logei e o item ainda estava lá" — a outra
// metade é CartContext.clearCart() sendo chamado explicitamente em
// login/registro/logout (ver CustomerAuthContext).
//
// tenant e customer agora vêm de Context (TenantProvider +
// CustomerAuthProvider, montados uma vez em CustomerAppShell) em vez de
// serem buscados aqui — ver o comentário em CustomerAuthContext.tsx
// pro motivo real disso ter mudado.
export function RequireCustomerAuth({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { tenant, isLoading: isLoadingTenant, error: tenantError, retry: retryTenant } = useTenant();
  const { customer, isLoading: isLoadingAuth, authError, token, retry: retryAuth } = useCustomerAuth();

  if (tenantError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center">
        <p className="text-sm text-gray-500">{tenantError}</p>
        <button onClick={retryTenant} className="text-sm font-semibold text-gray-900 underline">
          {t('optionalCustomerAuth.tentar_de_novo')}
        </button>
      </div>
    );
  }

  if (!tenant || isLoadingTenant || isLoadingAuth) {
    // Mesmo fundo do primeiro quadro da splash (#131314, z-50): quando o MenuPage monta a
    // splash logo em seguida a troca e invisivel (sem spinner claro piscando antes).
    return <div role="status" aria-label={t('common.loading')} className="fixed inset-0 z-50 bg-[#131314]" />;
  }

  // CRÍTICO — bug real que isso corrige: antes, `!customer` sozinho já
  // mandava pro login, sem distinguir "realmente deslogado" de "existe
  // um token, só não deu pra confirmar agora" (429, 5xx, rede). Isso
  // criava um vaivém login→app→login→app sem NENHUM delay de rede real
  // freando o ciclo. Agora: só navega pro login quando dá pra afirmar
  // com confiança que não há sessão (sem token, ou erro já confirmado
  // como 401 dentro do CustomerAuthContext — que aí sim limpa o token).
  // Erro passageiro com token presente mostra "tentar de novo" bem
  // aqui, sem sair da página.
  if (authError && token) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center">
        <p className="text-sm text-gray-500">
          {t('requireCustomerAuth.nao_foi_possivel_confirmar')}
        </p>
        <button onClick={retryAuth} className="text-sm font-semibold text-gray-900 underline">
          {t('optionalCustomerAuth.tentar_de_novo')}
        </button>
      </div>
    );
  }

  if (!customer) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/${slug}/conta-cliente/entrar?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
