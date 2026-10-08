import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AccessControlService } from '../roles/access-control.service';

export interface JwtPayload {
  sub: string; // adminUser.id
  tenantId: string;
  email: string;
  role: string;
  type: 'admin';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly access: AccessControlService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET não está definido no .env');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // O retorno daqui vira `request.user` em qualquer rota protegida.
  // Checagem de `type: 'admin'` é a mesma segunda camada de defesa que
  // existe em CustomerJwtStrategy (ver o comentário lá) — mesmo num
  // cenário hipotético de segredo compartilhado por engano, um token de
  // cliente final não tem esse claim e é rejeitado aqui.
  async validate(payload: JwtPayload) {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Token inválido para esta área.');
    }
    // Cargo e permissões vêm SEMPRE do banco (com cache curto), nunca do token
    // nem da requisição: promoção/rebaixamento/exclusão valem em segundos.
    const ctx = await this.access.getContext(payload.sub);
    if (!ctx || ctx.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    }
    return {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      email: ctx.email,
      name: ctx.name,
      role: ctx.role,
      roleId: ctx.roleId,
      roleSlug: ctx.roleSlug,
      roleName: ctx.roleName,
      permissions: ctx.permissions,
    };
  }
}
