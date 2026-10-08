// Contexto de acesso de um usuário do painel, montado no servidor.
export interface AccessContext {
  userId: string;
  tenantId: string;
  email: string;
  name: string | null;
  role: string; // legado owner|manager|staff
  roleId: string | null;
  roleSlug: string | null;
  roleName: string | null;
  permissions: string[];
}
