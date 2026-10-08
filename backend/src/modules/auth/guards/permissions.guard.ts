import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions } from '../../../common/permissions/permission-matcher';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

// Lê as permissões de request.user, que a JwtStrategy montou a partir do BANCO.
// Corpo, query e headers da requisição NUNCA são consultados aqui — qualquer
// "roles"/"permissions" enviado pelo cliente é simplesmente ignorado.
//
// Avaliação (estrita, ver common/permissions/permission-matcher.ts):
//   "*" → acesso imediato · slug exato → acesso · "modulo:*" cobre o módulo.
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string; permissions?: unknown } | undefined;
    const granted =
      user && Array.isArray(user.permissions)
        ? (user.permissions.filter((p) => typeof p === 'string') as string[])
        : [];

    if (hasAllPermissions(granted, required)) return true;

    // Log só com ids/rota (sem corpo, sem token, sem PII).
    this.logger.warn(
      `Acesso negado user=${user?.userId ?? '?'} ${request.method} ${request.route?.path ?? request.url?.split('?')[0]} exige=[${required.join(',')}]`,
    );
    throw new ForbiddenException('Acesso negado: privilégios insuficientes.');
  }
}
