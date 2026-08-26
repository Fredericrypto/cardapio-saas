import { IsString, IsOptional, IsInt, IsBoolean, IsArray, IsUUID, IsNumber, Min, Max, MaxLength, ValidateIf } from 'class-validator';

export class UpdateCashbackSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  // `null` explícito = "sem teto" (limpa um teto que já existia). Chave
  // ausente do corpo (undefined) = "não mexe nesse campo". `@ValidateIf`
  // pula a validação pra null OU undefined, valida de verdade (>= 0,01)
  // só quando vem um número.
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0.01)
  maxCashbackPerOrder?: number | null;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0.01)
  maxCashbackPerCustomerPerDay?: number | null;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  expirationDays?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  promoText?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];
}
