import { IsString, MinLength } from 'class-validator';

export class ConfirmTenantLocationDto {
  @IsString()
  @MinLength(5)
  address: string;
}
