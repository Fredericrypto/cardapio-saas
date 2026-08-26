import { IsString, IsBoolean, IsArray, IsOptional, ValidateNested, MinLength, MaxLength, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ProductOptionValueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string; // ex: "Grande", "Bacon"

  @IsNumber()
  @Min(0)
  priceDelta: number; // 0 pra opções sem custo extra (ex: "sem cebola")

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean; // default true — false = "em falta hoje"
}

class ProductOptionGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string; // ex: "Tamanho", "Adicionais", "Remover"

  // Modelo iFood: min=0 é opcional, min>=1 é obrigatório escolher pelo
  // menos essa quantidade. max=1 se comporta como rádio, max>1 como
  // checkbox com teto. max sempre precisa ser >= min (checado no
  // service, já que depende também de min).
  @IsNumber()
  @Min(0)
  minSelect: number;

  @IsNumber()
  @Min(1)
  maxSelect: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductOptionValueDto)
  values: ProductOptionValueDto[];
}

// Substitui TODOS os grupos de opções de um produto de uma vez —
// mais simples que CRUD granular por grupo/valor, e casa com como o
// formulário do admin vai funcionar (edita a lista inteira, salva tudo
// junto). Ver ProductsService.setOptions.
export class SetProductOptionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductOptionGroupDto)
  groups: ProductOptionGroupDto[];
}
