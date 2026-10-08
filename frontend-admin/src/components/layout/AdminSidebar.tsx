import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { SIDEBAR_ITEMS } from '../../config/sidebarConfig';
import { BUILD_VERSION } from '../../buildInfo';
import { getIcon } from './iconRegistry';

interface AdminSidebarProps {
  menuOpen: boolean;
  // id do item do menu → está pedindo atenção (pisca)
  blinking: Record<string, boolean>;
  onLogout: () => void;
}

// Menu lateral DINÂMICO (visual original da aplicação; o modo escuro vem do
// tema global, ver index.css): renderiza só o que o cargo do usuário
// pode ver, a partir de config/sidebarConfig.ts. Admin ("*") vê tudo —
// inclusive abas que forem criadas no futuro.
export function AdminSidebar({ menuOpen, blinking, onLogout }: AdminSidebarProps) {
  const { tenant, admin, hasPermission, permissionsReady } = useAuth();

  const visibleItems = SIDEBAR_ITEMS.filter(
    (item) => !item.permission || (permissionsReady && hasPermission(item.permission)),
  );

  return (
    <aside
      className={`bg-white border-r border-gray-100 flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 md:overflow-visible ${
        menuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-5 border-b border-gray-100">
        {/* Nome SEM cortar: quebra em quantas linhas precisar. */}
        <p className="font-display font-bold text-gray-900 leading-tight" style={{ overflowWrap: 'anywhere' }}>
          {tenant?.name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5" style={{ overflowWrap: 'anywhere' }}>
          {tenant?.slug}
        </p>
        {admin?.roleName && (
          <span
            className="mt-2 inline-block max-w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600"
            style={{ overflowWrap: 'anywhere' }}
          >
            {admin.roleName}
          </span>
        )}
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-1">
        {visibleItems.map((item) => {
          const Icon = getIcon(item.iconName);
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : `text-gray-600 hover:bg-gray-100 ${blinking[item.id] ? 'nav-attention-blink' : ''}`
                }`
              }
            >
              <Icon size={18} strokeWidth={1.5} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        {/* Mesmo estilo do "Chamar garçom" do cardápio, centralizado. */}
        <button
          onClick={onLogout}
          className="w-full rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: tenant?.primaryColor ?? '#3d3846' }}
        >
          <LogOut size={14} strokeWidth={1.5} />
          Sair
        </button>
        <p className="text-[10px] text-gray-300 text-center mt-2 select-all">build {BUILD_VERSION}</p>
      </div>
    </aside>
  );
}
