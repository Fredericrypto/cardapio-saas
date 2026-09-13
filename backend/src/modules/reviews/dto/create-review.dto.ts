import { IsUUID, IsInt, Min, Max, IsOptional, IsString, MaxLength, IsBoolean, IsIn } from 'class-validator';

export class CreateReviewDto {
  @IsUUID('4')
  orderId: string;

  @IsIn(['restaurant', 'item'])
  targetType: 'restaurant' | 'item';

  // Obrigatório (e validado contra os itens do próprio pedido, no
  // serviço) quando targetType='item'; ignorado quando 'restaurant'.
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  // Só tem efeito quando targetType='restaurant' — avaliação de item é
  // sempre só estrela, o serviço descarta esse campo nesse caso mesmo
  // que venha preenchido.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  // Se true, esconde nome/avatar do cliente na vitrine pública (vira
  // "Anônimo" + avatar genérico) — o admin continua vendo quem
  // escreveu, só o público não. Só faz sentido pra 'restaurant'.
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
