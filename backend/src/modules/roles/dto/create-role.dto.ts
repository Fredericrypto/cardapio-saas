import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../../common/sanitize/sanitize-text.decorator';

export const PERMISSION_SLUG_REGEX = /^(\*|[a-z][a-z0-9-]*:(\*|[a-z][a-z0-9-]*))$/;

export class CreateRoleDto {
  @SanitizeText()
  @IsString()
  @MinLength(2, { message: 'O nome do cargo precisa ter ao menos 2 caracteres.' })
  @MaxLength(60)
  name: string;

  @IsOptional()
  @SanitizeText()
  @IsString()
  @MaxLength(200)
  description?: string;

  // Slugs de permissão. O slug do CARGO nunca vem do cliente (é gerado no servidor).
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Matches(PERMISSION_SLUG_REGEX, { each: true, message: 'Permissão com formato inválido.' })
  permissions: string[];
}
