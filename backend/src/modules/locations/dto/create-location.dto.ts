import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
