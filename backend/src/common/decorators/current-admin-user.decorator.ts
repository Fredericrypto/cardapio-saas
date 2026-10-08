import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Extrai o id + nome/email do FUNCIONÁRIO logado (não só o tenant) —
// necessário pra registrar QUEM aprovou um resgate de cupom (reembolso,
// prêmio de fidelidade, etc), não só quando. Mesmo princípio do
// CurrentTenant, só que devolvendo o usuário inteiro em vez de string.
export interface RequestAdminUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export const CurrentAdminUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestAdminUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
