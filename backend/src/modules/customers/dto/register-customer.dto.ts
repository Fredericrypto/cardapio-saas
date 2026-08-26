import { IsEmail, IsString, MinLength, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class RegisterCustomerDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  // Mesmo padrão do PhoneInput no frontend — "(XX) XXXX-XXXX" ou
  // "(XX) XXXXX-XXXX". Nunca confia só na máscara do lado do cliente.
  @IsOptional()
  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone em formato inválido — use (DDD) 99999-9999.',
  })
  phone?: string;
}
