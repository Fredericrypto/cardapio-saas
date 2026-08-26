import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestCustomer {
  customerId: string;
  tenantId: string;
  email: string;
}

// Extrai o objeto do cliente já validado por CustomerJwtAuthGuard. Lê de
// `request.customer` (nunca `request.user`, que é reservado pro admin) —
// ver o comentário em customer-jwt.strategy.ts sobre por que os dois
// nomes ficam propositalmente diferentes. Devolve o objeto inteiro
// (customerId + tenantId + email) porque as rotas de cliente sempre
// precisam conferir se o tenantId do token bate com o tenantId da URL.
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestCustomer => {
    const request = ctx.switchToHttp().getRequest();
    return request.customer;
  },
);
