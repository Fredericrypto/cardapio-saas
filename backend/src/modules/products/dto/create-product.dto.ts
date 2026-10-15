import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
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

export class CreateProductDto {
  @IsUUID()
  categoryId: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  translations?: Record<string, Record<string, string>> | null;

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

  // Formato antigo (uma foto só). Continua aceito: vira a capa da galeria.
  @IsOptional()
  @IsString()
  imageUrl?: string;

  // Galeria ordenada — a primeira é a capa. Máximo de 5 fotos por item.
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
}
