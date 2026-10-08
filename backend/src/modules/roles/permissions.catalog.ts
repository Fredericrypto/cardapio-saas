// CATÁLOGO ÚNICO de permissões do sistema. Para criar um módulo novo
// ("Estoque", "RH"…) basta:
//   1. acrescentar as entradas aqui (são sincronizadas com o banco no boot);
//   2. anotar as rotas com @RequirePermission('estoque:view');
//   3. adicionar o item em frontend-admin/src/config/sidebarConfig.ts.
// O cargo Admin (wildcard "*") enxerga e acessa tudo automaticamente — sem
// migration nem edição de lógica de autorização.

export interface PermissionDef {
  slug: string;
  name: string;
  module: string;
  description: string;
}

const p = (slug: string, name: string, module: string, description: string): PermissionDef => ({
  slug,
  name,
  module,
  description,
});

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  p('*', 'Acesso total', 'Sistema', 'Acesso universal a todos os módulos, atuais e futuros. Conceda com extremo cuidado.'),

  p('orders:view', 'Visualizar pedidos', 'Pedidos', 'Ver o Painel e a lista de pedidos.'),
  p('orders:manage', 'Gerenciar pedidos', 'Pedidos', 'Alterar status, concluir, confirmar Pix e verificar cupons.'),

  p('receipts:verify', 'Verificar cupons', 'Pedidos', 'Verificar autenticidade de cupons e registrar resgates.'),

  p('tables:view', 'Visualizar mesas', 'Mesas', 'Ver mesas, chamados de garçom e contas abertas.'),
  p('tables:manage', 'Gerenciar mesas', 'Mesas', 'Criar/excluir mesas, atender chamados e fechar contas.'),

  p('menu:view', 'Visualizar cardápio', 'Cardápio', 'Ver produtos e categorias.'),
  p('menu:manage', 'Gerenciar cardápio', 'Cardápio', 'Criar, editar e excluir produtos e categorias.'),

  p('locations:view', 'Visualizar lojas', 'Lojas', 'Ver as lojas da marca.'),
  p('locations:manage', 'Gerenciar lojas', 'Lojas', 'Criar, editar e excluir lojas.'),

  p('promotions:view', 'Visualizar promoções', 'Marketing', 'Ver promoções.'),
  p('promotions:manage', 'Gerenciar promoções', 'Marketing', 'Criar, editar e excluir promoções.'),
  p('loyalty:view', 'Visualizar fidelidade', 'Marketing', 'Ver programas e resgates de fidelidade.'),
  p('loyalty:manage', 'Gerenciar fidelidade', 'Marketing', 'Criar programas, resgatar e entregar prêmios.'),
  p('cashback:view', 'Visualizar cashback', 'Marketing', 'Ver regras e extrato de cashback.'),
  p('cashback:manage', 'Gerenciar cashback', 'Marketing', 'Criar, editar e excluir regras de cashback.'),

  p('reviews:view', 'Visualizar avaliações', 'Relacionamento', 'Ver avaliações dos clientes.'),
  p('reviews:manage', 'Responder avaliações', 'Relacionamento', 'Responder avaliações publicamente.'),
  p('verifications:view', 'Visualizar verificações', 'Relacionamento', 'Ver verificações de clientes.'),
  p('verifications:manage', 'Gerenciar verificações', 'Relacionamento', 'Aprovar, rejeitar, revogar e suspender verificações.'),

  p('analytics:view', 'Visualizar análise', 'Gestão', 'Acessar a aba Análise (dados financeiros).'),
  p('history:view', 'Visualizar histórico', 'Gestão', 'Ver o histórico de pedidos e sessões.'),
  p('history:manage', 'Gerenciar histórico', 'Gestão', 'Sinalizar pedidos/sessões no histórico.'),
  p('cash:view', 'Visualizar caixa', 'Gestão', 'Ver movimentações do caixa.'),
  p('cash:manage', 'Gerenciar caixa', 'Gestão', 'Registrar movimentações de caixa.'),
  p('settings:view', 'Visualizar configurações', 'Gestão', 'Abrir a tela de Configurações.'),
  p('settings:manage', 'Gerenciar configurações', 'Gestão', 'Alterar dados, marca, logo e capa do estabelecimento.'),

  p('roles:view', 'Visualizar cargos e equipe', 'Acesso', 'Ver cargos, permissões e membros da equipe.'),
  p('roles:manage', 'Gerenciar cargos e equipe', 'Acesso', 'Criar/editar/excluir cargos e atribuir cargos (limitado ao que o próprio cargo possui).'),
];

// Cargos de sistema criados para TODO estabelecimento (slug fixo).
export const SYSTEM_ROLE_ADMIN = 'admin';
export const SYSTEM_ROLE_MANAGER = 'manager';
export const SYSTEM_ROLE_STAFF = 'staff';
export const RESERVED_ROLE_SLUGS: readonly string[] = [SYSTEM_ROLE_ADMIN, SYSTEM_ROLE_MANAGER, SYSTEM_ROLE_STAFF];

export interface SystemRoleDef {
  slug: string;
  name: string;
  description: string;
  permissions: string[];
  // Valor da coluna legada admin_users.role (usada por notificações internas).
  legacyRole: 'owner' | 'manager' | 'staff';
}

export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    slug: SYSTEM_ROLE_ADMIN,
    name: 'Administrador (CEO)',
    description: 'Acesso universal. Não pode ser editado nem excluído.',
    permissions: ['*'],
    legacyRole: 'owner',
  },
  {
    slug: SYSTEM_ROLE_MANAGER,
    name: 'Gerente de Loja',
    description: 'Opera a loja e vê relatórios; não altera configurações nem acessos.',
    permissions: [
      'orders:view', 'orders:manage', 'receipts:verify', 'tables:view', 'tables:manage',
      'menu:view', 'menu:manage', 'locations:view',
      'promotions:view', 'promotions:manage', 'loyalty:view', 'loyalty:manage',
      'cashback:view', 'cashback:manage', 'reviews:view', 'reviews:manage',
      'verifications:view', 'verifications:manage',
      'analytics:view', 'history:view', 'history:manage',
      'cash:view', 'cash:manage', 'settings:view',
    ],
    legacyRole: 'manager',
  },
  {
    slug: SYSTEM_ROLE_STAFF,
    name: 'Atendente',
    description: 'Atende pedidos e mesas.',
    permissions: ['orders:view', 'orders:manage', 'receipts:verify', 'tables:view', 'tables:manage', 'menu:view'],
    legacyRole: 'staff',
  },
];

// Perfil legado (coluna admin_users.role) para um cargo: cargos de sistema
// mapeiam 1:1; qualquer cargo PERSONALIZADO vira "staff" (menor visibilidade
// nas notificações internas — nunca eleva por acidente).
export function legacyRoleFor(slug: string, isSystemDefault: boolean): 'owner' | 'manager' | 'staff' {
  if (!isSystemDefault) return 'staff';
  return SYSTEM_ROLES.find((r) => r.slug === slug)?.legacyRole ?? 'staff';
}
