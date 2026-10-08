// FONTE ÚNICA do menu lateral e das permissões por rota.
// Novo módulo/aba = uma linha aqui (+ a rota em App.tsx e o catálogo no
// backend). O Admin ("*") enxerga itens atuais e futuros automaticamente.

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  iconName: string; // chave de components/layout/iconRegistry.ts (Lucide)
  permission?: string; // ex.: 'stock:view'. Omitido = qualquer usuário autenticado.
  badge?: string;
  end?: boolean; // NavLink "end" (rota "/")
  // Só o Administrador (CEO, role legado 'owner'). Não é uma permissão do catálogo
  // de propósito: o backend (OwnerOnlyGuard) confere o mesmo critério, então um
  // cargo personalizado nunca enxerga uma aba que o servidor vai recusar.
  ownerOnly?: boolean;
}

export const SIDEBAR_ITEMS: readonly MenuItem[] = [
  { id: 'painel', label: 'Painel', path: '/', iconName: 'LayoutDashboard', permission: 'orders:view', end: true },
  { id: 'cardapio', label: 'Cardápio', path: '/cardapio', iconName: 'UtensilsCrossed', permission: 'menu:view' },
  { id: 'mesas', label: 'Mesas', path: '/mesas', iconName: 'Table2', permission: 'tables:view' },
  { id: 'lojas', label: 'Lojas', path: '/lojas', iconName: 'Store', permission: 'locations:view' },
  { id: 'promocoes', label: 'Promoções', path: '/promocoes', iconName: 'Percent', permission: 'promotions:view' },
  { id: 'fidelidade', label: 'Fidelidade', path: '/fidelidade', iconName: 'Gift', permission: 'loyalty:view' },
  { id: 'cashback', label: 'Cashback', path: '/cashback', iconName: 'Wallet', permission: 'cashback:view' },
  { id: 'avaliacoes', label: 'Avaliações', path: '/avaliacoes', iconName: 'Star', permission: 'reviews:view' },
  { id: 'verificacoes', label: 'Verificações', path: '/verificacoes', iconName: 'BadgeCheck', permission: 'verifications:view' },
  { id: 'analise', label: 'Análise', path: '/analise', iconName: 'TrendingUp', permission: 'analytics:view' },
  { id: 'anotacoes', label: 'Anotações', path: '/anotacoes', iconName: 'StickyNote' },
  { id: 'historico', label: 'Histórico', path: '/historico', iconName: 'History', permission: 'history:view' },
  { id: 'verificar-cupom', label: 'Verificar cupom', path: '/verificar-cupom', iconName: 'ScanLine', permission: 'receipts:verify' },
  { id: 'cargos', label: 'Cargos e acessos', path: '/cargos', iconName: 'ShieldCheck', permission: 'roles:view' },
  { id: 'seguranca', label: 'Segurança e Backups', path: '/seguranca', iconName: 'DatabaseBackup', ownerOnly: true },
  { id: 'configuracoes', label: 'Configurações', path: '/configuracoes', iconName: 'Settings', permission: 'settings:view' },
];

// Rotas que não aparecem no menu mas também são protegidas.
const EXTRA_ROUTE_PERMISSIONS: Record<string, string | undefined> = {
  '/notificacoes': undefined, // todo usuário autenticado (preferências próprias)
};

export function permissionForPath(path: string): string | undefined {
  if (path in EXTRA_ROUTE_PERMISSIONS) return EXTRA_ROUTE_PERMISSIONS[path];
  return SIDEBAR_ITEMS.find((i) => i.path === path)?.permission;
}

// Primeira rota que o usuário pode abrir (destino do "voltar" no acesso negado).
export function firstAllowedPath(can: (permission: string) => boolean): string {
  const item = SIDEBAR_ITEMS.find((i) => !i.ownerOnly && (!i.permission || can(i.permission)));
  return item?.path ?? '/notificacoes';
}
