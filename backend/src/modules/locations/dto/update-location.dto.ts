import { IsString, IsOptional, IsBoolean, IsNumber, IsObject, Min } from 'class-validator';

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  // Pedido do Felipe (19/09): Telegram e telefone de contato "puro"
  // agora são por LOJA, mesmo raciocínio do WhatsApp (cada filial tem
  // seu próprio número/contato).
  @IsOptional()
  @IsString()
  telegramUsername?: string;

  @IsOptional()
  @IsString()
  contactPhoneNumber?: string;

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
