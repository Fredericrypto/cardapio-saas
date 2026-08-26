import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Mesmo padrão de validação usado em DeliveryQuoteDto/CreateOrderDto —
// cada campo é texto, mas com limites de tamanho sensatos. A
// geocodificação de verdade (LocationIQ) é quem decide se o endereço
// existe; isso aqui só evita strings absurdamente longas ou vazias
// chegando na chamada externa.
export class ConfirmCustomerAddressDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  street: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city: string;

  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'UF deve ter 2 letras (ex: SC).' })
  state: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  postcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referencePoint?: string;
}
