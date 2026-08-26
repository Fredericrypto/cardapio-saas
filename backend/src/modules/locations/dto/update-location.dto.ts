import { IsString, IsOptional, IsBoolean, IsNumber, IsObject, Min } from 'class-validator';

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  // address NÃO está aqui de propósito, mesmo motivo do Tenant antes —
  // só muda via PATCH /locations/me/:id/location (geocodificação).

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @IsOptional()
  @IsObject()
  openingHours?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFeePerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryMaxRadiusKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;
}
