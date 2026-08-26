import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ConcludeOrderDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['dinheiro', 'cartao', 'pix'])
  paymentMethod: string;

  // Só relevante (e validado no service) quando paymentMethod === 'dinheiro'
  // — guardado pra poder mostrar o troco depois no cupom do histórico.
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountReceived?: number;
}
