import { IsIn, IsOptional, IsNumber, Min } from 'class-validator';

export class CloseSessionDto {
  @IsIn(['dinheiro', 'cartao', 'pix'])
  paymentMethod: string;

  // Obrigatório só quando o pagamento é em dinheiro, pra calcular o troco.
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountReceived?: number;
}
