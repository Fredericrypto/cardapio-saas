import { Outlet } from 'react-router-dom';
import { TenantProvider } from '../contexts/TenantContext';
import { CustomerAuthProvider } from '../contexts/CustomerAuthContext';
import { ReviewPromptProvider } from './ReviewPromptProvider';
import { QrScanButton } from './QrScanButton';

// Layout raiz de todas as rotas `/:slug/*` — monta a busca do tenant e
// a sessão do cliente UMA VEZ, compartilhada por toda a árvore de rotas
// abaixo via Context (ver TenantContext e CustomerAuthContext pro
// motivo). Precisa estar DENTRO de uma <Route path="/:slug"> pra
// `useParams()` funcionar dentro do TenantProvider.
//
// ReviewPromptProvider mora aqui dentro (não mais como sibling solto de
// <Routes> lá em App.tsx) justamente pra poder ler tenant/customer do
// Context em vez de buscar os dois de novo por conta própria.
export function CustomerAppShell() {
  return (
    <TenantProvider>
      <CustomerAuthProvider>
        <Outlet />
        <ReviewPromptProvider />
        <QrScanButton />
      </CustomerAuthProvider>
    </TenantProvider>
  );
}
