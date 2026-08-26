import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SetCustomerPixKeyDto {
  @IsIn(['email', 'telefone', 'cpf', 'aleatoria'])
  pixKeyType: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  pixKey: string;
}
