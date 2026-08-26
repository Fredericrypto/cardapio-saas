import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  tenantName: string; // nome do estabelecimento, cria o tenant junto

  @IsNotEmpty()
  @IsString()
  tenantSlug: string; // ex: "hamburgueria-do-joao"

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  name: string; // nome do dono/admin
}
