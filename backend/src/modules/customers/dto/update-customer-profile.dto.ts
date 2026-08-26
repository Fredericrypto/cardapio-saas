import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const GENDER_OPTIONS = ['masculino', 'feminino', 'outro', 'prefiro_nao_dizer'] as const;

// Todo campo de texto livre aqui tem whitelist de caracteres (nunca
// aceita string qualquer) — nome só letras/espaços/hífen/apóstrofo, sem
// símbolos, números ou coisas do tipo `'; DROP TABLE`. Isso é uma camada
// a mais de defesa: mesmo sem isso o TypeORM já usa queries
// parametrizadas (não dá pra fazer SQL injection por parâmetro de query
// de qualquer forma), mas travar o formato aqui também barra lixo/abuso
// óbvio antes de chegar perto do banco.
export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  @Matches(/^[\p{L}\s'-]+$/u, {
    message: 'Nome só pode ter letras, espaços, hífen e apóstrofo.',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone em formato inválido — use (DDD) 99999-9999.',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(GENDER_OPTIONS)
  gender?: (typeof GENDER_OPTIONS)[number];
}
