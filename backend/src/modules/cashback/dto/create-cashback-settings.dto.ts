import { IsString, IsOptional, IsInt, IsBoolean, IsArray, IsUUID, IsNumber, Min, Max, MaxLength, ValidateIf } from 'class-validator';

export class CreateCashbackSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  percentage: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  // `null` explícito = "sem teto" (o frontend sempre manda null, nunca
  // omite o campo, pra dar pra LIMPAR um teto que já existia numa
  // edição). `@ValidateIf` pula a validação pra null OU undefined, mas
  // valida de verdade (>= 0,01) se vier um número — sem isso, um campo
  // "opcional" vazio disparava erro de validação por engano.
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
