import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../../common/sanitize/sanitize-text.decorator';
import { PERMISSION_SLUG_REGEX } from './create-role.dto';

export class UpdateRoleDto {
  @IsOptional()
  @SanitizeText()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @SanitizeText()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Matches(PERMISSION_SLUG_REGEX, { each: true, message: 'Permissão com formato inválido.' })
  permissions?: string[];
}
