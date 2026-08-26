import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsIn,
  IsBoolean,
  IsDateString,
  IsArray,
  IsUUID,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreatePromotionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['percentage', 'fixed'])
  discountType: 'percentage' | 'fixed';

  @IsNumber()
  @Min(0.01)
  discountValue: number;

  // Obrigatório quando discountType='percentage' — ver
  // PromotionsService.validateDiscountValue. Sem isso, um pedido grande
  // (muitas unidades do mesmo item) geraria um desconto sem limite.
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsIn(['all', 'category', 'product'])
  scope?: 'all' | 'category' | 'product';

  // Só relevante quando scope = 'category'.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  // Só relevante quando scope = 'product'.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];

  // Em quais lojas vale — vazio/omitido = todas as lojas do tenant.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  locationIds?: string[];

  // false (padrão) = uso em qualquer loja consome o limite por cliente
  // nas outras também. true = cada loja controla independentemente.
  @IsOptional()
  @IsBoolean()
  allowReuseAcrossLocations?: boolean;

  // ValidateIf em vez de IsOptional: o form do admin manda 0 quando a
  // caixinha "limitar" está desmarcada (não null/undefined), e
  // @IsOptional() só pula @Min(1) em null/undefined — 0 cairia na
  // validação e travava a criação de QUALQUER promoção sem limite por
  // cliente marcado. 0 (e null/undefined/'') = sem limite.
  @ValidateIf((o) => o.usageLimitPerCustomer !== undefined && o.usageLimitPerCustomer !== null && o.usageLimitPerCustomer !== 0)
  @IsInt()
  @Min(1)
  usageLimitPerCustomer?: number;

  // Mesmo motivo do campo acima: 0 = "sem limite total de usos", não um
  // valor inválido.
  @ValidateIf((o) => o.maxRedemptions !== undefined && o.maxRedemptions !== null && o.maxRedemptions !== 0)
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  // Quantas UNIDADES elegíveis, no máximo, contam pro desconto — em
  // branco/0/omitido = sem limite (o carrinho elegível inteiro conta,
  // escalando com a quantidade). Com um número aqui, essas unidades
  // ficam isoladas do resto no carrinho do cliente (ver
  // PromotionsService.eligibleSubtotalCents).
  @ValidateIf((o) => o.maxEligibleQuantity !== undefined && o.maxEligibleQuantity !== null && o.maxEligibleQuantity !== 0)
  @IsInt()
  @Min(1)
  maxEligibleQuantity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ValidateIf em vez de IsOptional: @IsOptional() só pula a validação
  // quando o valor é null/undefined, não quando é '' (string vazia) —
  // e o frontend antigo chegou a mandar '' quando o campo ficava em
  // branco. Isso garante que '' também é tratado como "não informado"
  // mesmo que algum client volte a mandar besteira no futuro.
  @ValidateIf((o) => o.startsAt !== undefined && o.startsAt !== null && o.startsAt !== '')
  @IsDateString()
  startsAt?: string | null;

  @ValidateIf((o) => o.endsAt !== undefined && o.endsAt !== null && o.endsAt !== '')
  @IsDateString()
  endsAt?: string | null;
}
