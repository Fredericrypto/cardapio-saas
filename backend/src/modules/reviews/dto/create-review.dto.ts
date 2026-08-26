import { IsUUID, IsInt, Min, Max, IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';

export class CreateReviewDto {
  @IsUUID('4')
  orderId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  // Se true, esconde nome/avatar do cliente na vitrine pública (vira
  // "Anônimo" + avatar genérico) — o admin continua vendo quem
  // escreveu, só o público não.
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
