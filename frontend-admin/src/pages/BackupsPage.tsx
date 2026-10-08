import { useAuth } from '../contexts/AuthContext';
import { AccessDeniedView } from '../components/common/AccessDeniedView';
import { BackupsSection } from '../components/backups/BackupsSection';

// Aba própria "Segurança e Backups" (menu lateral). Só o Administrador (CEO,
// role legado 'owner'): o item some do menu para os demais cargos e, se alguém
// digitar /seguranca na barra de endereço, vê "Acesso negado". O servidor
// confere de novo (OwnerOnlyGuard, relendo o perfil do banco) — esconder aqui é
// só conforto visual.
export function BackupsPage() {
  const { admin } = useAuth();
  if (admin?.role !== 'owner') return <AccessDeniedView />;
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <BackupsSection />
    </div>
  );
}
