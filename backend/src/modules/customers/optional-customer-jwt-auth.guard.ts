import { ExecutionContext, Injectable } from '@nestjs/common';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';

// Variante de CustomerJwtAuthGuard pra rotas PÚBLICAS que só precisam
// SABER quem é o cliente QUANDO ele está logado, sem nunca bloquear
// quem não está (ex: escanear QR de mesa — convidado sem conta precisa
// continuar funcionando normalmente). Se o token existir e for válido,
// `request.customer` é preenchido igual ao guard normal. Se não existir
// (ou for inválido/expirado), a rota segue normalmente com
// `request.customer = null`, em vez de lançar 401.
//
// NUNCA usar isso em rota que precisa mesmo saber quem é o cliente pra
// autorizar algo — só faz sentido quando a identidade é usada pra uma
// checagem ADICIONAL opcional (como a de "pular de mesa" no scan de
// QR), nunca como única barreira de acesso.
@Injectable()
export class OptionalCustomerJwtAuthGuard extends CustomerJwtAuthGuard {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (err || !user) {
      request.customer = null;
      return null;
    }
    request.customer = user;
    return user;
  }
}
