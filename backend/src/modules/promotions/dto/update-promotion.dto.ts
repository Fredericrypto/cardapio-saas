import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsIn,
  IsBoolean,
  IsDateString,
  IsArray,
  IsUUID,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsIn(['percentage', 'fixed'])
  discountType?: 'percentage' | 'fixed';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  discountValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsIn(['all', 'category', 'product'])
  scope?: 'all' | 'category' | 'product';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  @IsOptional()
  @IsBoolean()
  allowReuseAcrossLocations?: boolean;

  // Enviar 0 ou null limpa o limite (ver PromotionsService.update).
  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimitPerCustomer?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptions?: number;

  // Enviar 0 ou null limpa o limite (ver PromotionsService.update).
  @ValidateIf((o) => o.maxEligibleQuantity !== undefined && o.maxEligibleQuantity !== null && o.maxEligibleQuantity !== 0 && o.maxEligibleQuantity !== ('' as unknown))
  @IsInt()
  @Min(1)
  maxEligibleQuantity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Enviar string vazia limpa a data (ver PromotionsService.update, que
  // checa `dto.startsAt !== undefined` e trata '' como null). Por isso
  // aqui é ValidateIf, não IsOptional: @IsOptional() só pula a validação
  // em null/undefined, e deixaria o @IsDateString() rodar em cima de ''
  // e falhar — precisamos que '' passe direto sem validar, mas continue
  // chegando no service pra disparar o "limpar campo".
  @ValidateIf((o) => o.startsAt !== undefined && o.startsAt !== null && o.startsAt !== '')
  @IsDateString()
  startsAt?: string | null;

  @ValidateIf((o) => o.endsAt !== undefined && o.endsAt !== null && o.endsAt !== '')
  @IsDateString()
  endsAt?: string | null;
}
