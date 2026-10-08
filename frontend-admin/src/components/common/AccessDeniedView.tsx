import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { firstAllowedPath } from '../../config/sidebarConfig';

// Tela de "acesso negado" (tema Dracula). Mostrada dentro do layout quando o
// usuário abre uma rota para a qual o cargo dele não tem permissão.
export function AccessDeniedView() {
  const { hasPermission, admin } = useAuth();
  const back = firstAllowedPath((p) => hasPermission(p));

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-dracula-red/60 bg-dracula-bg p-8 text-center shadow-xl"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-dracula-red/60 bg-dracula-current">
          <ShieldAlert size={28} strokeWidth={1.25} className="text-dracula-red" />
        </div>
        <h1 className="font-display text-xl font-semibold text-dracula-red">Acesso negado</h1>
        <p className="mt-2 text-sm text-dracula-fg">
          Seu cargo{admin?.roleName ? ` (${admin.roleName})` : ''} não tem privilégios suficientes para abrir esta área.
        </p>
        <p className="mt-1 text-xs text-dracula-comment">
          Se você acredita que deveria ter acesso, fale com o administrador do estabelecimento.
        </p>
        <Link
          to={back}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-dracula-pink px-4 py-2.5 text-sm font-semibold text-dracula-bg hover:opacity-90"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Voltar
        </Link>
      </div>
    </div>
  );
}
