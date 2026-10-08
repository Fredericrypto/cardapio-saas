import type { CSSProperties } from 'react';
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

// Menu lateral DINÂMICO (tema Dracula): renderiza só o que o cargo do usuário
// pode ver, a partir de config/sidebarConfig.ts. Admin ("*") vê tudo —
// inclusive abas que forem criadas no futuro.
export function AdminSidebar({ menuOpen, blinking, onLogout }: AdminSidebarProps) {
  const { tenant, admin, hasPermission, permissionsReady } = useAuth();

  const visibleItems = SIDEBAR_ITEMS.filter(
    (item) => !item.permission || (permissionsReady && hasPermission(item.permission)),
  );

  return (
    <aside
      className={`bg-dracula-bg border-r border-dracula-comment/40 flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 md:overflow-visible ${
        menuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-5 border-b border-dracula-comment/40">
        {/* Nome SEM cortar: quebra em quantas linhas precisar. */}
        <p className="font-display font-bold text-dracula-purple leading-tight" style={{ overflowWrap: 'anywhere' }}>
          {tenant?.name}
        </p>
        <p className="text-xs text-dracula-comment mt-0.5" style={{ overflowWrap: 'anywhere' }}>
          {tenant?.slug}
        </p>
        {admin?.roleName && (
          <span
            className="mt-2 inline-block max-w-full rounded-md border border-dracula-cyan/40 bg-dracula-current px-2 py-0.5 text-[11px] font-medium text-dracula-cyan"
            style={{ overflowWrap: 'anywhere' }}
          >
            {admin.roleName}
          </span>
        )}
      </div>

      <nav
        className="flex-1 p-3 flex flex-col gap-1"
        // O "piscar" do menu usa estas variáveis (ver index.css); aqui em âmbar Dracula.
        style={
          {
            '--nav-blink-bg-on': 'rgba(255, 184, 108, 0.22)',
            '--nav-blink-text-on': '#ffb86c',
          } as CSSProperties
        }
      >
        {visibleItems.map((item) => {
          const Icon = getIcon(item.iconName);
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? 'bg-dracula-current text-dracula-pink border-dracula-pink'
                    : `text-dracula-fg/80 border-transparent hover:bg-dracula-current/60 hover:text-dracula-fg ${
                        blinking[item.id] ? 'nav-attention-blink' : ''
                      }`
                }`
              }
            >
              <Icon size={18} strokeWidth={1.5} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="rounded bg-dracula-purple/20 px-1.5 py-0.5 text-[10px] font-semibold text-dracula-purple">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-dracula-comment/40">
        <button
          onClick={onLogout}
          className="w-full rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold bg-dracula-current text-dracula-fg hover:text-dracula-red transition-colors"
        >
          <LogOut size={14} strokeWidth={1.5} />
          Sair
        </button>
        <p className="text-[10px] text-dracula-comment text-center mt-2 select-all">build {BUILD_VERSION}</p>
      </div>
    </aside>
  );
}
