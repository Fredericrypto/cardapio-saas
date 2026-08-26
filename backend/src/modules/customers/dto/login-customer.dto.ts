import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginCustomerDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
