import { IsObject, IsOptional, IsArray, IsIn } from 'class-validator';

export class SuggestTranslationDto {
  // Textos em pt-BR a traduzir: { name?, title?, description? }.
  @IsObject()
  texts: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsIn(['en', 'es'], { each: true })
  targets?: Array<'en' | 'es'>;
}
