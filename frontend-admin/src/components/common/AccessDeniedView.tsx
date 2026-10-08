import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { firstAllowedPath } from '../../config/sidebarConfig';

// Tela de "acesso negado" Mostrada dentro do layout quando o
// usuário abre uma rota para a qual o cargo dele não tem permissão.
export function AccessDeniedView() {
  const { hasPermission, admin } = useAuth();
  const back = firstAllowedPath((p) => hasPermission(p));

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-50">
          <ShieldAlert size={28} strokeWidth={1.25} className="text-red-600" />
        </div>
        <h1 className="font-display text-xl font-semibold text-red-600">Acesso negado</h1>
        <p className="mt-2 text-sm text-gray-700">
          Seu cargo{admin?.roleName ? ` (${admin.roleName})` : ''} não tem privilégios suficientes para abrir esta área.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Se você acredita que deveria ter acesso, fale com o administrador do estabelecimento.
        </p>
        <Link
          to={back}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Voltar
        </Link>
      </div>
    </div>
  );
}
