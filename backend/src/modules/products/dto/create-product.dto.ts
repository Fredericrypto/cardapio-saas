import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsUUID()
  categoryId: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promoPrice?: number;

  // Custo do item (opcional) — alimenta o CMV real na aba Análise. null limpa.
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number | null;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
