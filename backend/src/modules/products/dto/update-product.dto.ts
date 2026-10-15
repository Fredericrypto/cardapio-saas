import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsInt,
  IsArray,
  IsUrl,
  ArrayMaxSize,
  MaxLength,
  Min,
  IsObject,
  IsIn,
} from 'class-validator';
import { MAX_PRODUCT_IMAGES } from '../product-images';
import { DECLARED_BADGE_CODES, type DeclaredBadgeCode } from '../badges/product-badges.types';

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
  @IsObject()
  translations?: Record<string, Record<string, string>> | null;

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

  // Formato antigo (uma foto só): troca só a CAPA e mantém as demais fotos.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  // Galeria COMPLETA e ordenada (substitui a atual; a primeira é a capa). Mandar
  // [] remove todas as fotos. Máximo de 5 por item. Tem precedência sobre imageUrl.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_IMAGES, { message: `Cada item aceita no máximo ${MAX_PRODUCT_IMAGES} fotos.` })
  @IsString({ each: true })
  @MaxLength(2048, { each: true, message: 'Endereço de foto muito longo.' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    { each: true, message: 'Cada foto precisa ser um endereço http(s) válido.' },
  )
  images?: string[];

  // Selos declarativos (o que só o restaurante pode afirmar). Códigos do catálogo; o limite
  // de selos de texto é validado no service. [] limpa.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DECLARED_BADGE_CODES.length)
  @IsIn([...DECLARED_BADGE_CODES], { each: true, message: 'Selo desconhecido.' })
  badges?: DeclaredBadgeCode[];

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
