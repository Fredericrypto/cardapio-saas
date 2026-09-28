import { IsIn, IsOptional, IsNumber, Min } from 'class-validator';

export class CloseSessionDto {
  // Opcional agora: quando o cashback do cliente cobre a conta inteira,
  // não existe forma de pagamento nenhuma a escolher — o serviço decide
  // sozinho (ver TablesService.closeSession) e ignora isto quando não
  // faz falta. Continua obrigatório em qualquer outro caso.
  @IsOptional()
  @IsIn(['dinheiro', 'cartao', 'pix'])
  paymentMethod?: string;

  // Obrigatório só quando o pagamento é em dinheiro, pra calcular o troco.
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountReceived?: number;
}
