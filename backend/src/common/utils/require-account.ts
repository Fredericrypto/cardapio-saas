import { UnauthorizedException } from '@nestjs/common';

export const LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED';

// Todo pedido pertence a uma conta de cliente identificável. A regra vive no
// servidor (a UI só orienta): quem chama a API sem token válido deste restaurante
// recebe 401 com `code`, que o app usa para levar a pessoa ao login e voltar.
export function requireOrderAccount(customerId: string | null | undefined): string {
  if (!customerId) {
    throw new UnauthorizedException({
      code: LOGIN_REQUIRED_CODE,
      message: 'Para fazer o pedido você precisa entrar na sua conta.',
    });
  }
  return customerId;
}
