import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateTableDto {
  @IsNotEmpty()
  @IsString()
  number: string; // "Mesa 5", "Balcão 2"

  @IsUUID()
  locationId: string;
}
