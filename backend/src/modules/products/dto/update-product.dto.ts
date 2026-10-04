import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

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

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
