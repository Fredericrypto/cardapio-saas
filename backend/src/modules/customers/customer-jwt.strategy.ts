import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface CustomerJwtPayload {
  sub: string; // customer.id
  tenantId: string;
  email: string;
  type: 'customer';
}

// ================= ISOLAMENTO DE SEGURANÇA — LEIA ANTES DE MEXER =================
// Essa estratégia é DELIBERADAMENTE uma cópia separada de JwtStrategy (auth
// admin), não uma reutilização com "if role === customer". São dois
// sistemas de autenticação irmãos, mas independentes, por três camadas:
//
// 1. Segredo de assinatura DIFERENTE — CUSTOMER_JWT_SECRET, nunca o
//    mesmo valor de JWT_SECRET (do admin). Verificado no boot abaixo:
//    a aplicação recusa subir se os dois segredos forem iguais ou se
//    CUSTOMER_JWT_SECRET não estiver definido. Isso por si só já impede
//    um token de cliente ser aceito em rota de admin (e vice-versa),
//    mesmo que algum guard fosse aplicado no controller errado por engano.
// 2. Nome de estratégia Passport DIFERENTE ('customer-jwt' vs 'jwt') —
//    guards (@UseGuards(CustomerJwtAuthGuard) vs JwtAuthGuard) apontam
//    pra classes de estratégia completamente distintas.
// 3. Claim `type: 'customer'` no payload, checado explicitamente aqui —
//    mesmo num cenário hipotético de erro de configuração (os dois
//    segredos iguais por acidente), o token de admin não tem
//    `type: 'customer'` e seria rejeitado por essa checagem.
//
// NUNCA faça CustomerJwtAuthGuard e JwtAuthGuard apontarem pro mesmo
// segredo ou pra mesma tabela. NUNCA adicione um "role" de admin dentro
// de CustomerJwtPayload. A área do admin é do estabelecimento — o
// cliente final não deve ter NENHUM caminho, nem teórico, de autenticar
// lá usando uma conta de cliente.
// ===================================================================================
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('CUSTOMER_JWT_SECRET');
    const adminSecret = config.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('CUSTOMER_JWT_SECRET não está definido no .env');
    }
    if (secret === adminSecret) {
      // Isso não é só uma boa prática — é a diferença entre "cliente não
      // consegue logar como admin" ser garantido por dois segredos
      // distintos, ou depender só de checagem de claim em runtime.
      throw new Error(
        'CUSTOMER_JWT_SECRET não pode ser igual a JWT_SECRET — são dois sistemas de login separados (cliente final vs admin do estabelecimento) e precisam de segredos de assinatura diferentes.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // O retorno daqui vira `request.customer` em qualquer rota protegida
  // por CustomerJwtAuthGuard — nunca `request.user` (esse nome fica
  // reservado pro admin, JwtStrategy, pra nunca serem confundidos em
  // código que esqueça de checar qual guard está em uso).
  async validate(payload: CustomerJwtPayload) {
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Token inválido para esta área.');
    }
    return {
      customerId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
    };
  }
}
