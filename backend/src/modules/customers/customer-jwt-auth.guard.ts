import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege rotas de cliente final. Aplicado com @UseGuards(CustomerJwtAuthGuard).
// Aponta pra estratégia Passport 'customer-jwt' (ver customer-jwt.strategy.ts) —
// NUNCA a mesma classe ou string usada por JwtAuthGuard (admin).
//
// IMPORTANTE: o comportamento padrão do Passport/@nestjs/passport é
// sempre escrever o resultado da estratégia em `request.user`,
// independente do nome da estratégia. Se não sobrescrevêssemos isso
// aqui, `request.user` do cliente ficaria com o MESMO nome de campo que
// `request.user` do admin (JwtAuthGuard) — dois formatos de objeto
// diferentes (`{customerId,email}` vs `{userId,tenantId,email,role}`)
// disputando a mesma propriedade é exatamente o tipo de confusão que não
// pode existir entre as duas áreas. Por isso: `handleRequest` sobrescrito
// pra gravar em `request.customer` explicitamente, e CurrentCustomer (o
// decorator) só lê dali — nunca de `request.user`.
@Injectable()
export class CustomerJwtAuthGuard extends AuthGuard('customer-jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // super.handleRequest já lança UnauthorizedException se err/user
    // inválidos — mantemos esse comportamento padrão e só adicionamos
    // onde o resultado fica guardado.
    const validatedCustomer = super.handleRequest(err, user, info, context);
    const request = context.switchToHttp().getRequest();
    request.customer = validatedCustomer;
    return validatedCustomer;
  }
}
