import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Extrai o id + nome/email do FUNCIONÁRIO logado (não só o tenant) —
// necessário pra registrar QUEM aprovou um resgate de cupom (reembolso,
// prêmio de fidelidade, etc), não só quando. Mesmo princípio do
// CurrentTenant, só que devolvendo o usuário inteiro em vez de string.
export interface RequestAdminUser {
  userId: string;
  tenantId: string;
  email: string;
  // LEGADO (owner/manager/staff) — derivado do cargo; usado pelas notificações internas.
  role: string;
  // RBAC: preenchidos pela JwtStrategy a partir do BANCO (nunca do corpo/headers
  // da requisição). Opcionais só para não quebrar código/testes antigos.
  roleId?: string | null;
  roleSlug?: string | null;
  roleName?: string | null;
  permissions?: string[];
}

export const CurrentAdminUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestAdminUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
