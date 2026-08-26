import { IsString, MinLength } from 'class-validator';

export class ConfirmLocationAddressDto {
  @IsString()
  @MinLength(5)
  address: string;
}
