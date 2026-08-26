import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Extrai o tenantId já validado pelo JwtAuthGuard/TenantGuard da requisição.
// Uso: async findAll(@CurrentTenant() tenantId: string) { ... }
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId;
  },
);
