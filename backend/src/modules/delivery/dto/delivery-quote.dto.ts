import { IsOptional, IsString, MinLength } from 'class-validator';

export class DeliveryQuoteDto {
  @IsString()
  @MinLength(2)
  street: string;

  @IsOptional()
  @IsString()
  addressNumber?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsString()
  @MinLength(2)
  city: string;

  @IsString()
  @MinLength(2)
  state: string;

  @IsOptional()
  @IsString()
  postcode?: string;
}
